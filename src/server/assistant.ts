import { durationLabel } from '@/lib/duration';
import { nextTaskStart } from '@/lib/task-next-occurrence';
import { checkCreationAvailability } from './availability';
import { addDays, formatDay, formatTime, tzToday, weekdayName, ymd } from '@/lib/time';
import { inc, observeMs } from '@/lib/metrics';
import { log } from '@/lib/logger';
import { needsConfirmation, parseIntent, type ParsedIntent } from '@/lib/intent';
import { prisma } from './db';
import { highPriority, overdueTasks, snapshotForRange, waitingTasks } from './agenda';
import { completeTask, createTask, deleteTask, localWhen, scheduleTask } from './tasks';
import { scheduleDefaultReminders } from './reminders';
import { buildDailyPlan } from './planner';
import { buildCompleteBriefing } from './briefing';
import { buildTodayBriefing, getScheduleIntelligence } from './schedule-intelligence';
import { handleExecutiveTurn } from './executive-companion';
import type { ExecutiveRecommendation } from '@/lib/executive-contract';

export type AssistantTurn = {
  transcript: string;
  intent: ParsedIntent;
  spoken: string;
  visual: {
    summary: string;
    appointments: string[];
    tasks: string[];
    overdue: string[];
    next: string;
    rangeLabel: string;
    sections?: Array<{ title: string; items: string[] }>;
  };
  confirmation?: { prompt: string; actionId: string } | null;
  createdTaskId?: string;
  executive?: ExecutiveRecommendation;
  voiceEnabled?: boolean;
  contextActionId?: string;
};

function itemLine(title: string, when: Date | null, timeZone: string) {
  return when ? `${title} at ${formatTime(when, timeZone)}` : title;
}

async function intentScheduleWarnings(userId: string, timeZone: string, intent: ParsedIntent) {
  let scheduleWarnings: string[] = [];
  if (['CREATE_TASK', 'SCHEDULE_TASK', 'CREATE_RECURRING_TASK'].includes(intent.intent) && ['today', 'tomorrow'].includes(intent.whenText ?? '')) {
    const day = tzToday(timeZone, new Date());
    const start = localWhen(ymd(intent.whenText === 'tomorrow' ? addDays(day, 1) : day), intent.timeText, timeZone);
    if (start) scheduleWarnings = await checkCreationAvailability(userId, start, new Date(+start + (intent.durationMin || 30) * 60000), 'task');
  }
  if (intent.intent === 'RESCHEDULE_TASK' && intent.title) {
    const match = await prisma.task.findFirst({ where: { userId, deletedAt: null, title: { contains: intent.title } } });
    const start = resolveWhen(intent.whenText, timeZone, tzToday(timeZone, new Date()));
    if (match && start) scheduleWarnings = await checkCreationAvailability(userId, start, new Date(+start + match.durationMin * 60000), 'task', match.id);
  }
  if (intent.intent === 'COMPLETE_TASK' && intent.title) {
    const task = await prisma.task.findFirst({ where: { userId, deletedAt: null, title: { contains: intent.title } }, include: { recurrence: true } });
    const start = task && nextTaskStart(task);
    if (start && task) scheduleWarnings = await checkCreationAvailability(userId, start, new Date(+start + task.durationMin * 60000), 'task', task.id);
  }
  return scheduleWarnings;
}

export async function runAssistantTurn(userId: string, transcript: string, confirmActionId?: string): Promise<AssistantTurn> {
  if (['FOCUS_TODAY', 'FIX_SCHEDULE', 'DRIVING_BRIEFING', 'FREE_WINDOW', 'NEXT_ACTION', 'COMPARE_TASKS'].includes(parseIntent(transcript).intent)) {
    const executive = await handleExecutiveTurn(userId, transcript, { confirmActionId });
    if (executive) return executive;
  }
  const started = Date.now();
  inc('voice.requests');
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { preference: true },
  });
  const timeZone = user.timeZone;
  const level = user.preference?.confirmationLevel ?? 'CHANGES_AND_DELETES';

  try {
  if (confirmActionId) {
    const pending = await prisma.assistantAction.findFirst({
      where: { id: confirmActionId, userId, executed: false },
    });
    if (pending) {
      const payload = JSON.parse(pending.payloadJson) as ParsedIntent & { scheduleWarnings?: string[] };
      const freshWarnings = await intentScheduleWarnings(userId, timeZone, payload);
      if (freshWarnings.some(warning => !payload.scheduleWarnings?.includes(warning))) throw new Error('STALE_AGENT_PLAN');
      const result = await executeIntent(userId, timeZone, payload, true, true);
      await prisma.assistantAction.update({
        where: { id: pending.id },
        data: { executed: true, confirmation: 'CONFIRMED', resultJson: JSON.stringify(result.visual) },
      });
      return { ...result, transcript, intent: payload };
    }
  }

  const intent = parseIntent(transcript);
  const session = await prisma.voiceSession.create({
    data: {
      userId,
      status: 'processing',
      transcripts: { create: { text: transcript, confidence: intent.confidence } },
    },
  });

  const scheduleWarnings = await intentScheduleWarnings(userId, timeZone, intent);
  if ((scheduleWarnings.length > 0 || needsConfirmation(intent, level)) && ['CREATE_TASK', 'SCHEDULE_TASK', 'CREATE_RECURRING_TASK', 'DELETE_TASK', 'COMPLETE_TASK', 'RESCHEDULE_TASK'].includes(intent.intent)) {
    const action = await prisma.assistantAction.create({
      data: {
        userId,
        sessionId: session.id,
        intent: intent.intent,
        payloadJson: JSON.stringify({ ...intent, scheduleWarnings }),
        confirmation: 'REQUIRED',
      },
    });
    const preview = previewAction(intent, timeZone) + (scheduleWarnings.length ? ` Schedule warning: ${scheduleWarnings.join(' ')} Keep this time?` : '');
    return {
      transcript,
      intent,
      spoken: preview,
      visual: {
        summary: preview,
        appointments: [],
        tasks: [],
        overdue: [],
        next: 'Confirm to save this change.',
        rangeLabel: 'Confirmation',
      },
      confirmation: { prompt: preview, actionId: action.id },
    };
  }

  const result = await executeIntent(userId, timeZone, intent, true);
  await prisma.assistantAction.create({
    data: {
      userId,
      sessionId: session.id,
      intent: intent.intent,
      payloadJson: JSON.stringify(intent),
      confirmation: 'NONE',
      executed: true,
      resultJson: JSON.stringify(result.visual),
    },
  });
  inc('intent.' + intent.intent.toLowerCase());
  log('info', 'voice.turn', { intent: intent.intent, confidence: intent.confidence, confirmed: false });
  return { ...result, transcript, intent };
  } catch (err) {
    inc('voice.failures');
    log('error', 'voice.failed', { name: err instanceof Error ? err.name : 'unknown' });
    throw err;
  } finally {
    observeMs('voice.turn', started);
  }
}

function previewAction(intent: ParsedIntent, timeZone: string) {
  if (intent.intent === 'CREATE_TASK' || intent.intent === 'SCHEDULE_TASK') {
    return `I understood: create “${intent.title}”${intent.whenText ? ` for ${intent.whenText}` : ''}${intent.timeText ? ` at ${intent.timeText}` : ''} in ${timeZone.replace(/_/g, ' ')}. Should I save it?`;
  }
  if (intent.intent === 'COMPLETE_TASK') return `I understood: mark “${intent.title}” complete. Should I do that?`;
  if (intent.intent === 'DELETE_TASK') return `I understood: cancel “${intent.title}”. Should I delete it?`;
  if (intent.intent === 'RESCHEDULE_TASK') return `I understood: move “${intent.title}” to ${intent.whenText ?? 'the new time'}. Should I update it?`;
  return `I understood ${intent.intent.replaceAll('_', ' ').toLowerCase()}. Should I continue?`;
}

async function executeIntent(userId: string, timeZone: string, intent: ParsedIntent, executeWrites: boolean, scheduleApproved = false) {
  const today = tzToday(timeZone);

  if (intent.intent === 'BRIEF_ME') return buildCompleteBriefing(userId, intent.days ?? 5);
  if (intent.intent === 'SCHEDULE_INTELLIGENCE') {
    const intelligence = await getScheduleIntelligence(userId);
    const attention = intelligence.conflicts.length;
    const spoken = attention ? `${attention} schedule issue${attention === 1 ? '' : 's'} need attention. ${intelligence.conflicts[0].explanation}` : `Your schedule is clear. You have ${intelligence.commitmentsToday} calendar commitments today and ${durationLabel(intelligence.availableMinutes)} of usable time remaining.`;
    return { spoken, visual: { summary: spoken, appointments: [], tasks: intelligence.priorities.slice(0, 3).map((task, index) => `${index + 1}. ${task.title} — ${task.reasons.join(', ')}`), overdue: [], next: attention ? intelligence.conflicts[0].recommendedAction : 'Keep your highest-priority task protected.', rangeLabel: 'Schedule intelligence', sections: [{ title: 'Today', items: [`${intelligence.commitmentsToday} calendar commitments`, `${durationLabel(intelligence.availableMinutes)} of usable time remaining`] }, { title: attention ? 'Needs attention' : 'All clear', items: attention ? intelligence.conflicts.map((conflict) => `${conflict.title}: ${conflict.explanation}`) : ['No hard, buffer, workload, or priority conflicts found.'] }, { title: 'Top priority', items: intelligence.priorities.slice(0, 3).map((task) => `${task.title} — ${task.reasons.join(', ')}`) }] } };
  }
  if (intent.intent === 'LIST_THIS_WEEK') {
    const weekday = today.getUTCDay();
    return buildCompleteBriefing(userId, weekday === 0 ? 1 : 8 - weekday);
  }
  if (intent.intent === 'LIST_DEADLINES') {
    const days = intent.days ?? 5;
    const briefing = await buildCompleteBriefing(userId, days);
    const spoken = briefing.deadlineLines.length ? `Your upcoming deadlines are ${briefing.deadlineLines.join('; ')}.` : `You have no deadlines in the next ${days} days.`;
    return { spoken, visual: { summary: spoken, appointments: [], tasks: briefing.deadlineLines, overdue: [], next: briefing.conflictSummary, rangeLabel: 'Upcoming deadlines' } };
  }
  if (intent.intent === 'LIST_TODAY') return buildTodayBriefing(userId);
  if (intent.intent === 'LIST_TOMORROW') {
    const snap = await snapshotForRange(userId, timeZone, 2);
    const tomorrow = snap.range.days[1];
    const tasks = snap.tasks.filter((t) => (t.dueAt && ymdInTz(t.dueAt, timeZone) === tomorrow) || (t.startAt && ymdInTz(t.startAt, timeZone) === tomorrow));
    const events = snap.events.filter((e) => ymdInTz(e.startAt, timeZone) === tomorrow);
    return compose(timeZone, `tomorrow (${weekdayName(tomorrow)})`, events, tasks, [], 'Start with the first appointment, then the highest-priority task.');
  }
  if (intent.intent === 'LIST_NEXT_N_DAYS') return speakRange(userId, timeZone, intent.days ?? 3, `the next ${intent.days ?? 3} days`);
  if (intent.intent === 'LIST_OVERDUE') {
    const overdue = await overdueTasks(userId, timeZone);
    return compose(timeZone, 'overdue work', [], [], overdue, overdue[0] ? `Start with ${overdue[0].title}.` : 'Nothing is overdue.');
  }
  if (intent.intent === 'LIST_HIGH_PRIORITY') {
    const tasks = await highPriority(userId);
    return compose(timeZone, 'this week’s important work', [], tasks, [], tasks[0] ? `Work on ${tasks[0].title} next.` : 'No high-priority tasks.');
  }
  if (intent.intent === 'LIST_APPOINTMENTS') {
    const snap = await snapshotForRange(userId, timeZone, 14);
    return compose(timeZone, 'upcoming appointments', snap.events, [], [], snap.events[0] ? `Your next appointment is ${snap.events[0].title}.` : 'No upcoming appointments.');
  }
  if (intent.intent === 'PLAN_TOMORROW') {
    const plan = await buildDailyPlan(userId, timeZone, ymd(addDays(today, 1)));
    return {
      spoken: plan.spoken,
      visual: plan.visual,
    };
  }
  if (intent.intent === 'CREATE_TASK' || intent.intent === 'SCHEDULE_TASK' || intent.intent === 'CREATE_RECURRING_TASK') {
    let startAt: Date | null = null;
    if (intent.whenText === 'tomorrow') startAt = localWhen(ymd(addDays(today, 1)), intent.timeText, timeZone);
    if (intent.whenText === 'today') startAt = localWhen(ymd(today), intent.timeText, timeZone);
    let taskId: string | undefined;
    if (executeWrites) {
      const task = await createTask({
        userId,
        title: intent.title || 'New task',
        startAt,
        dueAt: startAt,
        durationMin: intent.durationMin,
        status: 'PLANNED',
        idempotencyKey: `${userId}:${intent.raw}:${startAt?.toISOString() ?? 'none'}`,
      });
      taskId = task.id;
      if (startAt) await scheduleDefaultReminders(userId, task.id, startAt, false);
    }
    const spoken = `Saved ${intent.title}. ${startAt ? `It is scheduled for ${formatDay(startAt, timeZone)} at ${formatTime(startAt, timeZone)}.` : ''}`;
    return {
      spoken,
      visual: { summary: spoken, appointments: [], tasks: [intent.title || 'New task'], overdue: [], next: 'I will remind you before it is due.', rangeLabel: 'Created' },
      createdTaskId: taskId,
    };
  }
  if (intent.intent === 'COMPLETE_TASK' && intent.title && executeWrites) {
    const match = await prisma.task.findFirst({
      where: { userId, deletedAt: null, title: { contains: intent.title } },
    });
    if (match) await completeTask(userId, match.id, scheduleApproved);
    const spoken = match ? `Marked ${match.title} complete.` : `I could not find a task named ${intent.title}.`;
    return { spoken, visual: { summary: spoken, appointments: [], tasks: [], overdue: [], next: '', rangeLabel: 'Update' } };
  }
  if (intent.intent === 'DELETE_TASK' && intent.title && executeWrites) {
    const match = await prisma.task.findFirst({
      where: { userId, deletedAt: null, title: { contains: intent.title } },
    });
    if (match) await deleteTask(userId, match.id);
    const spoken = match ? `Cancelled ${match.title}.` : `I could not find ${intent.title}.`;
    return { spoken, visual: { summary: spoken, appointments: [], tasks: [], overdue: [], next: '', rangeLabel: 'Update' } };
  }
  if (intent.intent === 'RESCHEDULE_TASK' && intent.title && executeWrites) {
    const match = await prisma.task.findFirst({
      where: { userId, deletedAt: null, title: { contains: intent.title } },
    });
    const when = resolveWhen(intent.whenText, timeZone, today);
    if (match && when) {
      await scheduleTask(userId, match.id, when, match.durationMin);
      await scheduleDefaultReminders(userId, match.id, when, match.critical);
    }
    const spoken = match && when
      ? `Moved ${match.title} to ${formatDay(when, timeZone)} at ${formatTime(when, timeZone)}.`
      : `I need a clearer date to move ${intent.title ?? 'that task'}.`;
    return { spoken, visual: { summary: spoken, appointments: [], tasks: [], overdue: [], next: '', rangeLabel: 'Update' } };
  }
  if (intent.intent === 'SNOOZE_TASK' && executeWrites) {
    const due = await prisma.reminder.findFirst({
      where: { userId, status: { in: ['SCHEDULED', 'QUEUED', 'RETRYING'] } },
      orderBy: { fireAt: 'asc' },
    });
    if (due) {
      const fireAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      await prisma.reminder.update({ where: { id: due.id }, data: { fireAt, status: 'SCHEDULED' } });
    }
    const spoken = due ? 'Snoozed that reminder for two hours.' : 'There is no active reminder to snooze.';
    return { spoken, visual: { summary: spoken, appointments: [], tasks: [], overdue: [], next: '', rangeLabel: 'Update' } };
  }
  if (intent.intent === 'FIND_FREE_TIME') {
    const plan = await buildDailyPlan(userId, timeZone, ymd(today));
    const spoken = `You have about ${Math.round(plan.availableMinutes / 60)} open hours today after appointments.`;
    return { spoken, visual: { ...plan.visual, summary: spoken, rangeLabel: 'Free time' } };
  }
  if (intent.intent === 'GENERAL_HELP') {
    const spoken = 'Ask what you have today, the next three or five days, or tell me to remind you of something.';
    return { spoken, visual: { summary: spoken, appointments: [], tasks: [], overdue: [], next: '', rangeLabel: 'Help' } };
  }
  const waiting = await waitingTasks(userId);
  if (/waiting/.test(intent.raw.toLowerCase())) {
    return compose(timeZone, 'waiting-for items', [], waiting, [], waiting[0] ? `You are waiting on ${waiting[0].waitingOn || waiting[0].title}.` : 'Nothing is waiting.');
  }
  return speakRange(userId, timeZone, 1, 'today');
}

function ymdInTz(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function resolveWhen(whenText: string | undefined, timeZone: string, today: Date) {
  if (whenText === 'today') return localWhen(ymd(today), '09:00', timeZone);
  if (whenText === 'tomorrow') return localWhen(ymd(addDays(today, 1)), '09:00', timeZone);
  if (whenText === 'friday') {
    const weekday = today.getUTCDay();
    const delta = weekday === 5 ? 7 : (5 - weekday + 7) % 7 || 7;
    return localWhen(ymd(addDays(today, delta)), '09:00', timeZone);
  }
  return null;
}

async function speakRange(userId: string, timeZone: string, days: number, label: string) {
  const snap = await snapshotForRange(userId, timeZone, days);
  return compose(timeZone, label, snap.events, snap.tasks, snap.overdue, snap.tasks[0] ? `Start with ${snap.tasks[0].title}.` : 'Your schedule is clear.');
}

function compose(
  timeZone: string,
  label: string,
  events: { title: string; startAt: Date }[],
  tasks: { title: string; startAt: Date | null; dueAt: Date | null; priority: string }[],
  overdue: { title: string }[],
  next: string,
) {
  const appointments = events.map((e) => itemLine(e.title, e.startAt, timeZone));
  const taskLines = tasks.map((t) => itemLine(t.title, t.startAt ?? t.dueAt, timeZone));
  const overdueLines = overdue.map((t) => t.title);
  const important = tasks.filter((t) => t.priority === 'HIGH' || t.priority === 'CRITICAL');
  const spoken = [
    `For ${label} in your local time, you have ${events.length} appointment${events.length === 1 ? '' : 's'} and ${tasks.length} task${tasks.length === 1 ? '' : 's'}.`,
    events[0] ? `Your first appointment is ${itemLine(events[0].title, events[0].startAt, timeZone)}.` : '',
    important[0] ? `Your highest-priority task is ${important[0].title}.` : '',
    overdue.length ? `You also have ${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}.` : '',
  ].filter(Boolean).join(' ');

  return {
    spoken: spoken || `I found no matching items for ${label}.`,
    visual: {
      summary: spoken || `No matching items for ${label}.`,
      appointments,
      tasks: taskLines,
      overdue: overdueLines,
      next,
      rangeLabel: label,
    },
  };
}
