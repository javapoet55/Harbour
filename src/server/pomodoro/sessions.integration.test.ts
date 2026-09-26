import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { listPomodoro, listPomodoroPage, pomodoroSchema, savePomodoro } from './sessions';
const users: string[] = [];
async function owner() {
  const user = await prisma.user.create({ data: { name: 'Focus tester', email: `${randomUUID()}@pomodoro.test`, passwordHash: 'unused' } });
  users.push(user.id); return user.id;
}
function session() {
  return { id: randomUUID(), revision: 1, category: 'focus', name: 'Proposal', durationMinutes: 25, autoBreak: true, playSound: false, keepAwake: true, phase: 'focus', paused: false, deadline: 1790001500, focusSeconds: 0, breakSeconds: 0, startedAt: 1790000000, updatedAt: 1790000000 };
}
afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: users } } }); });
describe('durable Pomodoro sessions', () => {
  it('keeps completion when an old offline request arrives and never duplicates retries', async () => {
    const user = await owner(); const initial = session();
    await savePomodoro(user, initial);
    const complete = { ...initial, revision: 4, phase: 'completed', deadline: null, focusSeconds: 1500, breakSeconds: 300, finishedAt: 1790001800, updatedAt: 1790001800 };
    await savePomodoro(user, complete);
    expect(await savePomodoro(user, initial)).toMatchObject({ revision: 4, phase: 'completed' });
    await savePomodoro(user, complete);
    expect(await listPomodoro(user)).toEqual([complete]);
  });
  it('isolates history and updates even when two owners supply the same session ID', async () => {
    const a = await owner(); const b = await owner(); const state = session();
    await savePomodoro(a, state);
    expect(await listPomodoro(b)).toEqual([]);
    await savePomodoro(b, { ...state, name: 'Other owner' });
    expect((await listPomodoro(a))[0].name).toBe('Proposal');
    expect((await listPomodoro(b))[0].name).toBe('Other owner');
  });
  it('pages all history with stable ordering and never crosses accounts', async () => {
    const a = await owner(); const b = await owner();
    const rows = Array.from({ length: 105 }, () => session());
    await prisma.pomodoroSession.createMany({ data: rows.map(state => ({ id: state.id, userId: a, revision: 1, status: state.phase, stateJson: JSON.stringify(state), startedAt: new Date(state.startedAt * 1000) })) });
    const first = await listPomodoroPage(a);
    expect(first.sessions).toHaveLength(100); expect(first.nextCursor).not.toBeNull();
    const second = await listPomodoroPage(a, first.nextCursor!);
    expect(second.sessions).toHaveLength(5); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.sessions, ...second.sessions].map(s => s.id)).size).toBe(105);
    expect((await listPomodoroPage(b, first.nextCursor!)).sessions).toEqual([]);
  });
  it('rejects invalid clocks, excessive durations and impossible totals', () => {
    expect(pomodoroSchema.safeParse({ ...session(), paused: true }).success).toBe(false);
    expect(pomodoroSchema.safeParse({ ...session(), durationMinutes: 121 }).success).toBe(false);
    expect(pomodoroSchema.safeParse({ ...session(), focusSeconds: 1600 }).success).toBe(false);
    expect(pomodoroSchema.safeParse({ ...session(), phase: 'completed' }).success).toBe(false);
    expect(pomodoroSchema.safeParse({ ...session(), paused: true, deadline: null, pausedRemaining: 1300 }).success).toBe(true);
  });
});
