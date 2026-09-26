import { z } from 'zod';
import { prisma } from '@/server/db';

const timestamp = z.number().finite().min(0).max(4_102_444_800);
export const pomodoroSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().min(1).max(1_000_000),
  category: z.enum(['reading', 'focus', 'coding', 'diary', 'math', 'stretching']),
  name: z.string().max(120), durationMinutes: z.number().int().min(1).max(120),
  autoBreak: z.boolean(), playSound: z.boolean(), keepAwake: z.boolean(),
  phase: z.enum(['focus', 'shortBreak', 'completed', 'stopped']), paused: z.boolean(),
  deadline: timestamp.nullish(), pausedRemaining: z.number().min(0).max(7200).nullish(),
  focusSeconds: z.number().min(0).max(7200), breakSeconds: z.number().min(0).max(300),
  startedAt: timestamp, updatedAt: timestamp, finishedAt: timestamp.nullish(),
}).superRefine((s, ctx) => {
  const active = s.phase === 'focus' || s.phase === 'shortBreak';
  if (s.updatedAt < s.startedAt || s.focusSeconds > s.durationMinutes * 60 ||
      (active && (s.paused ? s.pausedRemaining == null || s.deadline != null : s.deadline == null || s.pausedRemaining != null)) ||
      (!active && (s.finishedAt == null || s.deadline != null || s.paused)) ||
      (s.finishedAt != null && s.finishedAt < s.startedAt)) {
    ctx.addIssue({ code: 'custom', message: 'Invalid timer state' });
  }
});

export async function savePomodoro(userId: string, input: unknown) {
  const state = pomodoroSchema.parse(input);
  const key = { userId, id: state.id };
  // Create once; all later writes are compare-and-set so a delayed request cannot
  // revert a paused/completed session or create a duplicate history record.
  await prisma.pomodoroSession.upsert({ where: { userId_id: key }, update: {}, create: {
    ...key, revision: state.revision, status: state.phase,
    stateJson: JSON.stringify(state), startedAt: new Date(state.startedAt * 1000),
  } });
  await prisma.pomodoroSession.updateMany({ where: { ...key, revision: { lt: state.revision } }, data: {
    revision: state.revision, status: state.phase, stateJson: JSON.stringify(state),
  } });
  const saved = await prisma.pomodoroSession.findUniqueOrThrow({ where: { userId_id: key } });
  return JSON.parse(saved.stateJson);
}
export async function listPomodoroPage(userId: string, cursor?: string) {
  const rows = await prisma.pomodoroSession.findMany({
    where: { userId }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 101,
    ...(cursor ? { cursor: { userId_id: { userId, id: cursor } }, skip: 1 } : {}),
  });
  const page = rows.slice(0, 100);
  return { sessions: page.map(row => JSON.parse(row.stateJson)), nextCursor: rows.length > 100 ? page[page.length - 1].id : null };
}
export async function listPomodoro(userId: string) {
  return (await listPomodoroPage(userId)).sessions;
}
