import { prisma } from './db';
import type { Prisma } from '@/generated/prisma';
import { addDays, endOfLocalDay, tzToday, ymd } from '@/lib/time';
import { completionProbability, confidence, localHour, median, smoothedRate, timeBucket } from '@/lib/predictions';
import { calendarBusy, freeSlots, minutesIn, withoutTaskMirrors } from '@/lib/schedule-intelligence';
import { workWindows } from '@/lib/replanning';
import { listEventsInRange } from './agenda';

type SchedulableTask = { id: string; categoryId: string | null; projectId: string | null; kind: string; durationMin: number };
function taskSegment(task: SchedulableTask) { return task.categoryId ? `category:${task.categoryId}` : task.projectId ? `project:${task.projectId}` : `kind:${task.kind}`; }

export async function personalizedTaskDurations(userId: string, tasks: SchedulableTask[], db: Prisma.TransactionClient = prisma) {
  const preference = await db.userPreference.findUnique({ where: { userId } });
  const result = new Map(tasks.map((task) => [task.id, task.durationMin]));
  if (!preference?.personalizationEnabled || !tasks.length) return result;
  const history = await db.task.findMany({ where: { userId, deletedAt: null, status: 'COMPLETED', actualDurationMin: { gt: 0 }, ...(preference.personalizationConsentAt ? { updatedAt: { gte: preference.personalizationConsentAt } } : {}) }, select: { categoryId: true, projectId: true, kind: true, actualDurationMin: true } });
  const groups = new Map<string, number[]>();
  for (const sample of history) groups.set(taskSegment({ ...sample, id: '', durationMin: sample.actualDurationMin || 0 }), [...(groups.get(taskSegment({ ...sample, id: '', durationMin: sample.actualDurationMin || 0 })) || []), sample.actualDurationMin!]);
  for (const task of tasks) {
    const samples = groups.get(taskSegment(task)) || [];
    const prediction = median(samples);
    if (samples.length >= 3 && prediction !== null) result.set(task.id, Math.max(task.durationMin, 5, Math.round(prediction)));
  }
  return result;
}

function localDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export async function buildPersonalizedInsights(userId: string, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { preference: true } });
  if (!user.preference?.personalizationEnabled) return { enabled: false as const, consentedAt: null, message: 'Personalized predictions are off. Enable them in Settings to begin learning.' };
  const since = new Date(now.getTime() - 180 * 86400000);
  const observationStart = user.preference.personalizationConsentAt && user.preference.personalizationConsentAt > since ? user.preference.personalizationConsentAt : since;
  const [tasks, reminders, sessions, interruptions] = await Promise.all([
    prisma.task.findMany({ where: { userId, updatedAt: { gte: observationStart }, deletedAt: null }, include: { category: true, project: true }, orderBy: { updatedAt: 'desc' } }),
    prisma.reminder.findMany({ where: { userId, createdAt: { gte: observationStart } }, include: { attempts: true, task: true } }),
    prisma.taskWorkSession.findMany({ where: { userId, startedAt: { gte: observationStart }, endedAt: { not: null }, durationMin: { not: null } }, include: { task: { include: { category: true, project: true } } } }),
    prisma.activityLog.findMany({ where: { userId, kind: 'AUTO_REPLAN', createdAt: { gte: new Date(Math.max(observationStart.getTime(), now.getTime() - 30 * 86400000)) } } }),
  ]);
  const label = (task: typeof tasks[number]) => task.category?.name || task.project?.name || task.kind.toLowerCase();
  const durationGroups = new Map<string, Array<{ estimate: number; actual: number }>>();
  for (const task of tasks) if (task.actualDurationMin) {
    const key = label(task);
    durationGroups.set(key, [...(durationGroups.get(key) || []), { estimate: task.durationMin, actual: task.actualDurationMin }]);
  }
  const durationInsights = [...durationGroups.entries()].map(([category, samples]) => {
    const estimatedMedian = median(samples.map((item) => item.estimate))!;
    const actualMedian = median(samples.map((item) => item.actual))!;
    return { category, estimatedMedian: Math.round(estimatedMedian), actualMedian: Math.round(actualMedian), multiplier: Number((actualMedian / Math.max(1, estimatedMedian)).toFixed(2)), samples: samples.length, confidence: confidence(samples.length), explanation: `For ${category}, your median actual duration is ${Math.round(actualMedian)} minutes versus ${Math.round(estimatedMedian)} estimated.` };
  }).sort((a, b) => b.samples - a.samples);

  const eligible = tasks.filter((task) => task.status === 'COMPLETED' || task.status === 'CANCELLED' || Boolean(task.dueAt && task.dueAt < now));
  const succeeded = (task: typeof tasks[number]) => task.status === 'COMPLETED' && (!task.dueAt || Boolean(task.completedAt && task.completedAt <= task.dueAt));
  const overall = { successes: eligible.filter(succeeded).length, samples: eligible.length };
  const segment = (predicate: (task: typeof tasks[number]) => boolean) => {
    const rows = eligible.filter(predicate); return { successes: rows.filter(succeeded).length, samples: rows.length };
  };
  const openTasks = tasks.filter((task) => ['INBOX', 'PLANNED', 'IN_PROGRESS'].includes(task.status));
  const completionPredictions = openTasks.slice(0, 20).map((task) => {
    const bucket = task.startAt ? timeBucket(localHour(task.startAt, user.timeZone)) : null;
    const probability = completionProbability({ overall, priority: segment((row) => row.priority === task.priority), timeBucket: bucket ? segment((row) => Boolean(row.startAt && timeBucket(localHour(row.startAt, user.timeZone)) === bucket)) : undefined, postponements: task.postponeCount });
    return { taskId: task.id, title: task.title, probability: Math.round(probability * 100), samples: overall.samples, confidence: confidence(overall.samples), factors: [`${task.priority.toLowerCase()} priority`, bucket || 'no scheduled time', `${task.postponeCount} postponement${task.postponeCount === 1 ? '' : 's'}`] };
  }).sort((a, b) => a.probability - b.probability);

  const bucketRows = ['morning', 'afternoon', 'after 4 PM', 'outside core hours'].map((bucket) => {
    const rows = eligible.filter((task) => task.startAt && timeBucket(localHour(task.startAt, user.timeZone)) === bucket);
    const successes = rows.filter(succeeded).length;
    return { bucket, rate: Math.round(smoothedRate(successes, rows.length) * 100), rawRate: rows.length ? Math.round(successes / rows.length * 100) : null, samples: rows.length, confidence: confidence(rows.length) };
  });
  const preferredTime = [...bucketRows].filter((row) => row.samples).sort((a, b) => b.rate - a.rate || b.samples - a.samples)[0] || null;
  const preferredTimesByCategory = [...new Set(eligible.map(label))].map((category) => {
    const categoryRows = eligible.filter((task) => label(task) === category && task.startAt);
    const buckets = ['morning', 'afternoon', 'after 4 PM', 'outside core hours'].map((bucket) => {
      const rows = categoryRows.filter((task) => timeBucket(localHour(task.startAt!, user.timeZone)) === bucket);
      return { bucket, rate: Math.round(smoothedRate(rows.filter(succeeded).length, rows.length) * 100), samples: rows.length };
    });
    const best = buckets.filter((row) => row.samples).sort((a, b) => b.rate - a.rate || b.samples - a.samples)[0];
    return best ? { category, ...best, confidence: confidence(categoryRows.length) } : null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)).sort((a, b) => b.samples - a.samples);
  const late = bucketRows.find((row) => row.bucket === 'after 4 PM')!;

  const channelRows = ['push', 'email', 'sms'].map((channel) => {
    const sent = reminders.filter((reminder) => reminder.attempts.some((attempt) => attempt.channel === channel && ['SENT', 'DELIVERED', 'OPENED'].includes(attempt.status)));
    const effective = sent.filter((reminder) => Boolean(reminder.acknowledgedAt)).length;
    return { channel, score: Math.round(smoothedRate(effective, sent.length, 0.5, 3) * 100), acknowledged: effective, samples: sent.length, confidence: confidence(sent.length) };
  });
  const preferredChannel = [...channelRows].filter((row) => row.samples).sort((a, b) => b.score - a.score || b.samples - a.samples)[0] || null;
  const effectiveOffsets = reminders.filter((reminder) => reminder.acknowledgedAt && reminder.task && (reminder.task.startAt || reminder.task.dueAt)).map((reminder) => Math.round(((reminder.task!.startAt || reminder.task!.dueAt)!.getTime() - reminder.fireAt.getTime()) / 60_000)).filter((minutes) => minutes >= 0 && minutes <= 7 * 1440);
  const bestReminderMinutes = median(effectiveOffsets);

  const dailyTotals = new Map<string, number>();
  for (const session of sessions) dailyTotals.set(localDay(session.startedAt, user.timeZone), (dailyTotals.get(localDay(session.startedAt, user.timeZone)) || 0) + (session.durationMin || 0));
  const realisticDailyCapacity = median([...dailyTotals.values()]);
  const workEndMinutes = Number(user.preference.workEnd.split(':')[0]) * 60 + Number(user.preference.workEnd.split(':')[1]);
  const overtimeSessions = sessions.filter((session) => session.endedAt && localHour(session.endedAt, user.timeZone) * 60 + Number(new Intl.DateTimeFormat('en-US', { timeZone: user.timeZone, minute: '2-digit' }).format(session.endedAt)) > workEndMinutes).length;

  const horizonEnd = endOfLocalDay(ymd(addDays(tzToday(user.timeZone, now), 6)), user.timeZone);
  const dueSoon = openTasks.filter((task) => task.dueAt && task.dueAt <= horizonEnd);
  const categoryPrediction = new Map(durationInsights.map((item) => [item.category, item]));
  const requiredMinutes = dueSoon.reduce((sum, task) => {
    const prediction = categoryPrediction.get(label(task));
    return sum + (prediction && prediction.samples >= 3 ? Math.max(task.durationMin, prediction.actualMedian) : task.durationMin);
  }, 0);
  const workMinutes = (Number(user.preference.workEnd.split(':')[0]) * 60 + Number(user.preference.workEnd.split(':')[1])) - (Number(user.preference.workStart.split(':')[0]) * 60 + Number(user.preference.workStart.split(':')[1]));
  const [meetings, bufferMemory] = await Promise.all([
    listEventsInRange(userId, now, horizonEnd),
    prisma.userMemory.findUnique({ where: { userId_key: { userId, key: 'preference:buffer_minutes' } } }),
  ]);
  const requestedBuffer = Number(bufferMemory?.value ?? 15);
  const buffer = Number.isFinite(requestedBuffer) ? Math.max(0, Math.min(120, requestedBuffer)) : 15;
  const windows = workWindows(user.timeZone, user.preference.workingDays, user.preference.workStart, user.preference.workEnd, 7, now);
  const availableMinutes = minutesIn(windows.flatMap((window) => freeSlots(window.start, window.end, calendarBusy(withoutTaskMirrors(meetings, tasks), buffer))));

  const interruptionByReason = interruptions.reduce<Record<string, number>>((bag, item) => { const reason = item.summary.match(/\(([^)]+)\)$/)?.[1] || 'other'; bag[reason] = (bag[reason] || 0) + 1; return bag; }, {});
  return {
    enabled: true as const, consentedAt: user.preference.personalizationConsentAt,
    generatedAt: now, lookbackDays: 180,
    durationInsights,
    completion: { overallRate: eligible.length ? Math.round(overall.successes / eligible.length * 100) : null, samples: eligible.length, predictions: completionPredictions, lateDay: { ...late, explanation: late.samples ? `Tasks scheduled after 4 PM are completed on time ${late.rawRate}% of the time (${late.samples} samples).` : 'Not enough after-4-PM tasks yet.' } },
    preferredTime, preferredTimesByCategory,
    postponement: {
      tasksPostponed: tasks.filter((task) => task.postponeCount > 0).length,
      totalPostponements: tasks.reduce((sum, task) => sum + task.postponeCount, 0), samples: tasks.length,
      likelihood: tasks.length ? Math.round(smoothedRate(tasks.filter((task) => task.postponeCount > 0).length, tasks.length, 0.25, 4) * 100) : null,
      byCategory: [...new Set(tasks.map(label))].map((category) => { const rows = tasks.filter((task) => label(task) === category); return { category, likelihood: Math.round(smoothedRate(rows.filter((task) => task.postponeCount > 0).length, rows.length, 0.25, 4) * 100), samples: rows.length, confidence: confidence(rows.length) }; }).sort((a, b) => b.samples - a.samples),
    },
    reminders: { preferredChannel, channels: channelRows, bestTimingMinutes: bestReminderMinutes === null ? null : Math.round(bestReminderMinutes), timingSamples: effectiveOffsets.length },
    patterns: { interruptionsLast30Days: interruptions.length, interruptionByReason, overtimeRate: sessions.length ? Math.round(overtimeSessions / sessions.length * 100) : null, overtimeSessions, sessionSamples: sessions.length },
    capacity: { realisticDailyMinutes: realisticDailyCapacity === null ? null : Math.round(realisticDailyCapacity), sampleDays: dailyTotals.size, configuredDailyMinutes: workMinutes },
    deadlineRisk: { atRisk: requiredMinutes > availableMinutes, requiredMinutes, availableMinutes, deficitMinutes: Math.max(0, requiredMinutes - availableMinutes), taskCount: dueSoon.length, explanation: `You have ${availableMinutes} available minutes for ${requiredMinutes} predicted minutes of work due in the next 7 days.` },
  };
}

export async function erasePersonalizationData(userId: string) {
  await prisma.$transaction([
    prisma.taskWorkSession.deleteMany({ where: { userId } }),
    prisma.task.updateMany({ where: { userId }, data: { actualDurationMin: null, startedAt: null, postponeCount: 0, lastRescheduledAt: null } }),
    prisma.activityLog.deleteMany({ where: { userId, kind: { in: ['AUTO_REPLAN', 'ML_PREDICTION'] } } }),
  ]);
}
