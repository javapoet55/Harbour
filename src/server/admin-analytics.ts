import { prisma } from '@/server/db';
import { normalizeVoiceSeconds } from '@/server/voice/usage';

export type AdminPlan = 'FREE' | 'PRO' | 'MAX';
export type TrendPoint = { label: string; value: number };

const monthlyPrices: Record<AdminPlan, number> = { FREE: 0, PRO: 9.99, MAX: 19.99 };

export function normalizeAdminPlan(value: string | null | undefined): AdminPlan {
  const plan = value?.trim().toUpperCase();
  return plan === 'PRO' || plan === 'MAX' ? plan : 'FREE';
}

export function estimateMonthlyRevenue(plans: AdminPlan[]) {
  return plans.reduce((total, plan) => total + monthlyPrices[plan], 0);
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function dayLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function trendFromDates(dates: Date[], days: number, now: Date, cumulativeBase = 0): TrendPoint[] {
  const counts = new Map<string, number>();
  dates.forEach((date) => counts.set(dayKey(date), (counts.get(dayKey(date)) ?? 0) + 1));
  let running = cumulativeBase;
  return Array.from({ length: days }, (_, index) => {
    const date = startOfDay(now);
    date.setUTCDate(date.getUTCDate() - days + index + 1);
    running += counts.get(dayKey(date)) ?? 0;
    return { label: dayLabel(date), value: cumulativeBase ? running : counts.get(dayKey(date)) ?? 0 };
  });
}

function trendFromValues(values: Array<{ date: Date; value: number }>, days: number, now: Date): TrendPoint[] {
  const counts = new Map<string, number>();
  values.forEach(({ date, value }) => counts.set(dayKey(date), (counts.get(dayKey(date)) ?? 0) + value));
  return Array.from({ length: days }, (_, index) => {
    const date = startOfDay(now);
    date.setUTCDate(date.getUTCDate() - days + index + 1);
    return { label: dayLabel(date), value: Math.round((counts.get(dayKey(date)) ?? 0) * 10) / 10 };
  });
}

function growth(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function getAdminSnapshot(days = 30, range?: { from: Date; to: Date }) {
  const generatedAt = new Date();
  const now = range ? new Date(range.to) : new Date();
  if (range) now.setUTCHours(23, 59, 59, 999);
  const since = range ? startOfDay(range.from) : startOfDay(now);
  if (!range) since.setUTCDate(since.getUTCDate() - days + 1);
  if (range) days = Math.max(1, Math.round((+startOfDay(range.to) - +since) / 86_400_000) + 1);
  const until = new Date(now.getTime() + 1);
  const previousSince = new Date(since);
  previousSince.setUTCDate(previousSince.getUTCDate() - days);

  const [
    users,
    planRows,
    locationRows,
    voiceRows,
    voiceSessions,
    actions,
    activityLogs,
    tasks,
    shoppingLists,
    moments,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, email: true, name: true, timeZone: true, createdAt: true, updatedAt: true, emailVerifiedAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userMemory.findMany({ where: { key: 'billing:plan' }, select: { userId: true, value: true, updatedAt: true } }),
    prisma.userMemory.findMany({ where: { key: { in: ['profile:city', 'profile:country'] } }, select: { userId: true, key: true, value: true } }),
    prisma.userMemory.findMany({ where: { kind: 'voice_usage', updatedAt: { gte: previousSince, lt: until } }, select: { userId: true, value: true, source: true, updatedAt: true } }),
    prisma.voiceSession.findMany({ where: { createdAt: { gte: previousSince, lt: until } }, select: { id: true, userId: true, status: true, locale: true, createdAt: true, _count: { select: { transcripts: true } } }, orderBy: { createdAt: 'desc' }, take: 10000 }),
    prisma.assistantAction.findMany({ where: { createdAt: { gte: previousSince, lt: until } }, select: { userId: true, intent: true, executed: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20000 }),
    prisma.activityLog.findMany({ where: { createdAt: { gte: previousSince, lt: until } }, select: { userId: true, kind: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20000 }),
    prisma.task.findMany({ where: { deletedAt: null, createdAt: { gte: previousSince, lt: until } }, select: { userId: true, createdAt: true }, take: 20000 }),
    prisma.shoppingList.findMany({ where: { createdAt: { gte: previousSince, lt: until } }, select: { userId: true, createdAt: true }, take: 10000 }),
    prisma.importantMoment.findMany({ where: { createdAt: { gte: previousSince, lt: until } }, select: { userId: true, createdAt: true }, take: 10000 }),
  ]);

  const planByUser = new Map(planRows.map((row) => [row.userId, normalizeAdminPlan(row.value)]));
  const locationByUser = new Map<string, { city?: string; country?: string }>();
  locationRows.forEach((row) => {
    const location = locationByUser.get(row.userId) ?? {};
    if (row.key === 'profile:city') location.city = row.value.trim().slice(0, 100);
    if (row.key === 'profile:country') location.country = row.value.trim().slice(0, 100);
    locationByUser.set(row.userId, location);
  });
  const inCurrentPeriod = (date: Date) => date >= since && date < until;
  const voiceByUser = new Map<string, number>();
  voiceRows.filter((row) => inCurrentPeriod(row.updatedAt)).forEach((row) => voiceByUser.set(row.userId, (voiceByUser.get(row.userId) ?? 0) + normalizeVoiceSeconds(row.value) / 60));
  const actionsByUser = new Map<string, number>();
  actions.filter((row) => inCurrentPeriod(row.createdAt)).forEach((row) => actionsByUser.set(row.userId, (actionsByUser.get(row.userId) ?? 0) + 1));

  const lastActivity = new Map(users.map((user) => [user.id, user.updatedAt]));
  [...voiceRows.map((row) => ({ userId: row.userId, date: row.updatedAt })), ...voiceSessions.map((row) => ({ userId: row.userId, date: row.createdAt })), ...actions.map((row) => ({ userId: row.userId, date: row.createdAt })), ...activityLogs.map((row) => ({ userId: row.userId, date: row.createdAt }))]
    .forEach(({ userId, date }) => {
      if (!lastActivity.get(userId) || date > lastActivity.get(userId)!) lastActivity.set(userId, date);
    });

  const currentSignups = users.filter((user) => inCurrentPeriod(user.createdAt));
  const previousSignups = users.filter((user) => user.createdAt >= previousSince && user.createdAt < since);
  const activeUserIds = new Set<string>();
  users.filter((user) => inCurrentPeriod(user.updatedAt)).forEach((user) => activeUserIds.add(user.id));
  [...voiceRows, ...voiceSessions, ...actions, ...activityLogs].filter((row) => inCurrentPeriod('updatedAt' in row ? row.updatedAt : row.createdAt)).forEach((row) => activeUserIds.add(row.userId));

  const currentActions = actions.filter((row) => inCurrentPeriod(row.createdAt));
  const previousActions = actions.filter((row) => row.createdAt < since);
  const currentVoiceRows = voiceRows.filter((row) => inCurrentPeriod(row.updatedAt));
  const previousVoiceRows = voiceRows.filter((row) => row.updatedAt < since);
  const voiceMinutes = currentVoiceRows.reduce((total, row) => total + normalizeVoiceSeconds(row.value) / 60, 0);
  const previousVoiceMinutes = previousVoiceRows.reduce((total, row) => total + normalizeVoiceSeconds(row.value) / 60, 0);

  const plans = users.map((user) => planByUser.get(user.id) ?? 'FREE');
  const planCounts = { FREE: 0, PRO: 0, MAX: 0 } satisfies Record<AdminPlan, number>;
  plans.forEach((plan) => { planCounts[plan] += 1; });
  const estimatedMrr = estimateMonthlyRevenue(plans);

  const featureCounts = [
    { label: 'Tasks & planning', value: tasks.filter((row) => inCurrentPeriod(row.createdAt)).length, color: '#1d7dfa' },
    { label: 'AI assistant', value: currentActions.length, color: '#7655eb' },
    { label: 'Voice sessions', value: voiceSessions.filter((row) => inCurrentPeriod(row.createdAt)).length + currentVoiceRows.length, color: '#17b8b0' },
    { label: 'Shopping lists', value: shoppingLists.filter((row) => inCurrentPeriod(row.createdAt)).length, color: '#ee5b9a' },
    { label: 'Important moments', value: moments.filter((row) => inCurrentPeriod(row.createdAt)).length, color: '#f0a13b' },
  ].sort((a, b) => b.value - a.value);

  const byUserId = new Map(users.map((user) => [user.id, user]));
  const adminUsers = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    plan: planByUser.get(user.id) ?? 'FREE',
    city: locationByUser.get(user.id)?.city || null,
    country: locationByUser.get(user.id)?.country || null,
    timeZone: user.timeZone,
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: (lastActivity.get(user.id) ?? user.updatedAt).toISOString(),
    aiActions: actionsByUser.get(user.id) ?? 0,
    voiceMinutes: Math.round((voiceByUser.get(user.id) ?? 0) * 10) / 10,
    verified: Boolean(user.emailVerifiedAt),
  }));

  return {
    generatedAt: generatedAt.toISOString(),
    rangeStart: since.toISOString(),
    rangeEnd: new Date(until.getTime() - 1).toISOString(),
    days,
    metrics: {
      totalUsers: users.length,
      newUsers: currentSignups.length,
      activeUsers: activeUserIds.size,
      aiActions: currentActions.length,
      voiceMinutes: Math.round(voiceMinutes * 10) / 10,
      voiceSessions: voiceSessions.filter((row) => inCurrentPeriod(row.createdAt)).length + currentVoiceRows.length,
      estimatedMrr: Math.round(estimatedMrr * 100) / 100,
      verifiedUsers: users.filter((user) => user.emailVerifiedAt).length,
    },
    changes: {
      newUsers: growth(currentSignups.length, previousSignups.length),
      aiActions: growth(currentActions.length, previousActions.length),
      voiceMinutes: growth(voiceMinutes, previousVoiceMinutes),
    },
    planCounts,
    users: adminUsers,
    featureCounts,
    trends: {
      signups: trendFromDates(currentSignups.map((user) => user.createdAt), days, now),
      totalUsers: trendFromDates(currentSignups.map((user) => user.createdAt), days, now, users.length - currentSignups.length),
      aiActions: trendFromDates(currentActions.map((row) => row.createdAt), days, now),
      voiceMinutes: trendFromValues(currentVoiceRows.map((row) => ({ date: row.updatedAt, value: normalizeVoiceSeconds(row.value) / 60 })), days, now),
    },
    recentVoice: [...currentVoiceRows.map((row) => ({
      id: `usage-${row.userId}-${row.updatedAt.toISOString()}`,
      user: byUserId.get(row.userId)?.email ?? 'Unknown user',
      date: row.updatedAt.toISOString(),
      minutes: Math.round((normalizeVoiceSeconds(row.value) / 60) * 10) / 10,
      type: row.source === 'ios-realtime' ? 'Realtime' : 'Voice',
      status: 'Completed',
    })), ...voiceSessions.filter((row) => inCurrentPeriod(row.createdAt)).map((row) => ({
      id: row.id,
      user: byUserId.get(row.userId)?.email ?? 'Unknown user',
      date: row.createdAt.toISOString(),
      minutes: null,
      type: row._count.transcripts ? 'Transcription' : 'Voice',
      status: row.status,
    }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
  };
}
