import { prisma } from '@/server/db';
import { normalizeAdminPlan, type AdminPlan, type TrendPoint } from '@/server/admin-analytics';
import { normalizeVoiceSeconds } from '@/server/voice/usage';

const DAY_MS = 86_400_000;

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function trend(days: number, now: Date, values: Array<{ date: Date; value: number }>): TrendPoint[] {
  const totals = new Map<string, number>();
  values.forEach(({ date, value }) => totals.set(dayKey(date), (totals.get(dayKey(date)) ?? 0) + value));
  return Array.from({ length: days }, (_, index) => {
    const date = startOfUtcDay(now);
    date.setUTCDate(date.getUTCDate() - days + index + 1);
    return {
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      value: Math.round((totals.get(dayKey(date)) ?? 0) * 10) / 10,
    };
  });
}

function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function parseDevice(userAgent: string | null | undefined) {
  if (!userAgent) return { platform: 'Not recorded', device: 'Not recorded' };
  if (/iPhone/i.test(userAgent)) return { platform: 'iOS', device: 'iPhone' };
  if (/iPad/i.test(userAgent)) return { platform: 'iPadOS', device: 'iPad' };
  if (/Android/i.test(userAgent)) return { platform: 'Android', device: /Mobile/i.test(userAgent) ? 'Android phone' : 'Android device' };
  if (/Macintosh|Mac OS/i.test(userAgent)) return { platform: 'macOS', device: 'Mac' };
  if (/Windows/i.test(userAgent)) return { platform: 'Windows', device: 'Windows device' };
  if (/Linux/i.test(userAgent)) return { platform: 'Linux', device: 'Linux device' };
  return { platform: 'Web', device: 'Browser' };
}

function readableIntent(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type AdminUserDashboard = Awaited<ReturnType<typeof getAdminUserDashboard>>;

export async function getAdminUserDashboard(userId: string, days = 15) {
  const now = new Date();
  const since = startOfUtcDay(now);
  since.setUTCDate(since.getUTCDate() - days + 1);
  const previousSince = new Date(since.getTime() - days * DAY_MS);

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      timeZone: true,
      createdAt: true,
      updatedAt: true,
      emailVerifiedAt: true,
      preference: { select: { pushEnabled: true, emailEnabled: true, voiceEnabled: true } },
      calendarConnections: { select: { provider: true, accountEmail: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 3 },
      pushSubscriptions: { select: { userAgent: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 3 },
    },
  });
  if (!user) return null;

  const [memories, voiceRows, voiceSessions, actions, activityLogs, tasks, shoppingLists, moments] = await Promise.all([
    prisma.userMemory.findMany({
      where: { userId, key: { in: ['billing:plan', 'profile:city', 'profile:country', 'device:platform', 'device:model', 'app:version'] } },
      select: { key: true, value: true },
    }),
    prisma.userMemory.findMany({
      where: { userId, kind: 'voice_usage', updatedAt: { gte: previousSince } },
      select: { key: true, value: true, source: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.voiceSession.findMany({
      where: { userId, createdAt: { gte: previousSince } },
      select: { id: true, status: true, locale: true, createdAt: true, _count: { select: { transcripts: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.assistantAction.findMany({
      where: { userId, createdAt: { gte: previousSince } },
      select: { id: true, intent: true, executed: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    }),
    prisma.activityLog.findMany({
      where: { userId, createdAt: { gte: previousSince } },
      select: { id: true, kind: true, summary: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.task.findMany({
      where: { userId, deletedAt: null, createdAt: { gte: previousSince } },
      select: { id: true, title: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.shoppingList.findMany({
      where: { userId, createdAt: { gte: previousSince } },
      select: { id: true, title: true, createdAt: true, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.importantMoment.findMany({
      where: { userId, createdAt: { gte: previousSince } },
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  const memory = new Map(memories.map((row) => [row.key, row.value]));
  const isCurrent = (date: Date) => date >= since;
  const currentActions = actions.filter((row) => isCurrent(row.createdAt));
  const previousActions = actions.filter((row) => !isCurrent(row.createdAt));
  const currentTasks = tasks.filter((row) => isCurrent(row.createdAt));
  const previousTasks = tasks.filter((row) => !isCurrent(row.createdAt));
  const currentVoiceRows = voiceRows.filter((row) => isCurrent(row.updatedAt));
  const previousVoiceRows = voiceRows.filter((row) => !isCurrent(row.updatedAt));
  const voiceMinutes = currentVoiceRows.reduce((sum, row) => sum + normalizeVoiceSeconds(row.value) / 60, 0);
  const previousVoiceMinutes = previousVoiceRows.reduce((sum, row) => sum + normalizeVoiceSeconds(row.value) / 60, 0);
  const currentLists = shoppingLists.filter((row) => isCurrent(row.createdAt));
  const previousLists = shoppingLists.filter((row) => !isCurrent(row.createdAt));

  const lastActivity = [
    user.updatedAt,
    ...activityLogs.map((row) => row.createdAt),
    ...actions.map((row) => row.createdAt),
    ...voiceRows.map((row) => row.updatedAt),
    ...voiceSessions.map((row) => row.createdAt),
  ].sort((a, b) => b.getTime() - a.getTime())[0];

  const intentCounts = new Map<string, number>();
  currentActions.forEach((row) => intentCounts.set(readableIntent(row.intent), (intentCounts.get(readableIntent(row.intent)) ?? 0) + 1));
  const aiBreakdown = [...intentCounts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  const realtimeMinutes = currentVoiceRows.filter((row) => row.source === 'ios-realtime').reduce((sum, row) => sum + normalizeVoiceSeconds(row.value) / 60, 0);
  const otherMinutes = Math.max(0, voiceMinutes - realtimeMinutes);
  const voiceBreakdown = [
    { label: 'Real-time voice', value: Math.round(realtimeMinutes * 10) / 10 },
    { label: 'Other voice', value: Math.round(otherMinutes * 10) / 10 },
  ].filter((row) => row.value > 0);

  const derivedActivity = [
    ...actions.map((row) => ({ id: `action-${row.id}`, date: row.createdAt, activity: `Used ${readableIntent(row.intent)}`, details: row.executed ? 'Completed' : 'Requested' })),
    ...voiceSessions.map((row) => ({ id: `voice-${row.id}`, date: row.createdAt, activity: 'Voice session', details: row._count.transcripts ? `${row._count.transcripts} transcript${row._count.transcripts === 1 ? '' : 's'}` : row.status })),
    ...tasks.map((row) => ({ id: `task-${row.id}`, date: row.createdAt, activity: 'Created task', details: row.title })),
    ...shoppingLists.map((row) => ({ id: `shopping-${row.id}`, date: row.createdAt, activity: 'Created shopping list', details: `${row.title} · ${row._count.items} item${row._count.items === 1 ? '' : 's'}` })),
    ...moments.map((row) => ({ id: `moment-${row.id}`, date: row.createdAt, activity: 'Created important moment', details: row.title })),
  ];
  const recentActivity = (activityLogs.some((row) => isCurrent(row.createdAt))
    ? activityLogs.filter((row) => isCurrent(row.createdAt)).map((row) => ({ id: `log-${row.id}`, date: row.createdAt, activity: readableIntent(row.kind), details: row.summary }))
    : derivedActivity.filter((row) => isCurrent(row.date)))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8)
    .map((row) => ({ ...row, date: row.date.toISOString() }));

  const latestPush = user.pushSubscriptions[0];
  const parsedDevice = parseDevice(latestPush?.userAgent);
  const platform = memory.get('device:platform')?.trim() || parsedDevice.platform;
  const device = memory.get('device:model')?.trim() || parsedDevice.device;
  const calendar = user.calendarConnections.find((connection) => connection.status === 'connected') ?? user.calendarConnections[0];

  return {
    range: { days, from: since.toISOString(), to: now.toISOString() },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      initials: user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      plan: normalizeAdminPlan(memory.get('billing:plan')) as AdminPlan,
      verified: Boolean(user.emailVerifiedAt),
      status: 'Active',
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: lastActivity.toISOString(),
      timeZone: user.timeZone,
      city: memory.get('profile:city')?.trim() || null,
      country: memory.get('profile:country')?.trim() || null,
    },
    metrics: {
      aiActions: currentActions.length,
      voiceMinutes: Math.round(voiceMinutes * 10) / 10,
      tasksCreated: currentTasks.length,
      shoppingLists: currentLists.length,
    },
    changes: {
      aiActions: percentChange(currentActions.length, previousActions.length),
      voiceMinutes: percentChange(voiceMinutes, previousVoiceMinutes),
      tasksCreated: percentChange(currentTasks.length, previousTasks.length),
      shoppingLists: percentChange(currentLists.length, previousLists.length),
    },
    trends: {
      aiActions: trend(days, now, currentActions.map((row) => ({ date: row.createdAt, value: 1 }))),
      voiceMinutes: trend(days, now, currentVoiceRows.map((row) => ({ date: row.updatedAt, value: normalizeVoiceSeconds(row.value) / 60 }))),
    },
    aiBreakdown,
    voiceBreakdown,
    recentActivity,
    feedback: [],
    device: {
      platform,
      device,
      appVersion: memory.get('app:version')?.trim() || 'Not recorded',
      pushNotifications: user.preference?.pushEnabled && user.pushSubscriptions.length ? 'Enabled' : 'Not connected',
      calendar: calendar ? `${calendar.provider} · ${calendar.accountEmail}` : 'Not connected',
      email: user.preference?.emailEnabled ? 'Enabled' : 'Disabled',
      voice: user.preference?.voiceEnabled ? 'Enabled' : 'Disabled',
      lastSeen: latestPush?.updatedAt.toISOString() ?? null,
    },
  };
}
