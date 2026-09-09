import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db';
import { runConversationalAgent } from './conversational-agent';
import { pushTaskToExternal } from './calendar-sync';
import { applyReplanProposal } from './replanner';
import { PATCH } from '@/app/api/tasks/[id]/route';
import { requireUser } from './auth';

vi.mock('./calendar-sync', () => ({ pushTaskToExternal: vi.fn(async () => null) }));
vi.mock('./auth', () => ({ requireUser: vi.fn() }));
const at = (hm: string, day = '2026-09-07') => new Date(`${day}T${hm}:00-07:00`);
let userId: string;
let otherId: string;
const create = (title: string, values = {}) => prisma.task.create({ data: { userId, title, status: 'PLANNED', ...values } });
const turn = (text: string, actionId?: string, rejectId?: string) => runConversationalAgent(userId, text, actionId, rejectId);
const focusRequest = (minutes: unknown) => new Request('http://localhost/api/tasks/t', { method: 'PATCH', body: JSON.stringify({ status: 'IN_PROGRESS', focusMinutes: minutes, fromRecommendation: true }), headers: { 'Content-Type': 'application/json' } });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(at('12:00'));
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.clearAllMocks();
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@executive.test`, name: 'Test user', passwordHash: 'never-send-this-hash', timeZone: 'America/Los_Angeles', preference: { create: { workingDays: '1,2,3,4,5' } } }, include: { preference: true } });
  userId = user.id;
  const other = await prisma.user.create({ data: { email: `${randomUUID()}@executive.test`, name: 'Other user', passwordHash: 'unused' } });
  otherId = other.id;
  vi.mocked(requireUser).mockResolvedValue(user);
});
afterEach(async () => {
  if (userId && otherId) {
    // Cleanup only the two test accounts; user deletion cascades their test records.
    await prisma.calendarEvent.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  }
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
});

describe('executive conversation integrated with owned data', () => {
  it('answers focus and Why from real tasks without an LLM or calendar writes', async () => {
    await create('Important proposal', { priority: 'CRITICAL', dueAt: at('14:00'), durationMin: 90 });
    await create('Routine admin', { priority: 'LOW' });
    const remote = vi.fn(); vi.stubGlobal('fetch', remote);
    const first = await turn('What should I focus on today?');
    expect(first.executive?.priorities[0].title).toBe('Important proposal');
    const why = await turn('Why?');
    expect(why.spoken).toContain('Important proposal');
    expect(why.spoken).toContain('high importance');
    expect(remote).not.toHaveBeenCalled();
    expect(pushTaskToExternal).not.toHaveBeenCalled();
  });
  it('excludes other users, hidden calendars and duplicate task mirrors', async () => {
    const hidden = await prisma.calendarConnection.create({ data: { userId, provider: 'mock', accountEmail: 'test@test.example', calendarId: 'hidden', calendarName: 'Hidden', visible: false } });
    await prisma.calendarEvent.createMany({ data: [
      { userId, title: 'hidden title', connectionId: hidden.id, startAt: at('13:00'), endAt: at('14:00') },
      { userId: otherId, title: 'private other event', startAt: at('13:00'), endAt: at('14:00') },
      { userId, title: 'mirror', externalId: 'mirror-id', startAt: at('12:00'), endAt: at('13:00') },
    ] });
    await create('done mirror task', { externalEventId: 'mirror-id', status: 'COMPLETED' });
    await prisma.task.create({ data: { userId: otherId, title: 'private other task' } });
    const result = await turn('I have 45 minutes.');
    expect(result.executive?.window.availableMinutes).toBe(45);
    expect(JSON.stringify(result)).not.toMatch(/private other|hidden title|mirror/);
  });
  it('shows before/after and changes nothing until approval, then applies once', async () => {
    const task = await create('Proposal', { durationMin: 60, priority: 'CRITICAL', startAt: at('13:00'), dueAt: at('17:00') });
    const meeting = await prisma.calendarEvent.create({ data: { userId, title: 'Dentist', startAt: at('13:00'), endAt: at('14:00') } });
    const proposal = await turn('Fix my afternoon.');
    const id = proposal.confirmation!.actionId;
    expect(proposal.executive?.proposedScheduleChanges).toHaveLength(1);
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toEqual(task);
    expect(pushTaskToExternal).not.toHaveBeenCalled();
    const result = await turn('yes', id);
    expect(result.spoken).toContain('Applied 1');
    expect(pushTaskToExternal).toHaveBeenCalledTimes(1);
    expect(await prisma.calendarEvent.findUnique({ where: { id: meeting.id } })).toEqual(meeting);
    await expect(turn('yes', id)).rejects.toThrow('NOT_FOUND');
  });
  it('rejects the proposal persistently, not merely in the UI', async () => {
    const task = await create('Unscheduled work', { priority: 'CRITICAL' });
    const proposal = await turn('Fix my afternoon.');
    await turn('Keep my current plan', undefined, proposal.confirmation!.actionId);
    expect((await prisma.assistantAction.findUniqueOrThrow({ where: { id: proposal.confirmation!.actionId } })).confirmation).toBe('REJECTED');
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toEqual(task);
    await expect(turn('yes', proposal.confirmation!.actionId)).rejects.toThrow();
    expect(pushTaskToExternal).not.toHaveBeenCalled();
  });
  it('leaves time to read and approve an immediate plan, then expires past-start proposals', async () => {
    await create('Unscheduled critical work', { priority: 'CRITICAL' });
    const first = await turn('Fix my afternoon.');
    expect(new Date(first.executive!.proposedScheduleChanges[0].after)).toEqual(at('12:05'));
    vi.setSystemTime(at('12:01'));
    expect((await turn('yes', first.confirmation!.actionId)).spoken).toContain('Applied 1');
    await create('More critical work', { priority: 'CRITICAL' });
    const next = await turn('Fix my afternoon.');
    vi.setSystemTime(at('12:20'));
    await expect(turn('yes', next.confirmation!.actionId)).rejects.toThrow('STALE_REPLAN');
  });
  it('recomputes a protected-task follow-up and supersedes the old proposal', async () => {
    const dentist = await create('Dentist', { startAt: at('13:00'), durationMin: 30 });
    await create('Priority work', { durationMin: 120, priority: 'CRITICAL' });
    const first = await turn('Fix my afternoon.');
    const revised = await turn("Don't move the dentist.");
    expect(revised.executive?.proposedScheduleChanges.some((move) => move.taskId === dentist.id)).toBe(false);
    expect(revised.executive?.fixedCommitments.some((item) => item.id === dentist.id)).toBe(true);
    expect((await prisma.assistantAction.findUniqueOrThrow({ where: { id: first.confirmation!.actionId } })).confirmation).toBe('SUPERSEDED');
  });
  it('preserves all external meetings for “don’t move that meeting”', async () => {
    await create('Work', { priority: 'CRITICAL' });
    await prisma.calendarEvent.create({ data: { userId, title: 'Meeting', startAt: at('13:00'), endAt: at('14:00') } });
    await turn('Fix my afternoon.');
    const revised = await turn("Don't move that meeting.");
    expect(revised.executive?.fixedCommitments[0].title).toBe('Meeting');
    expect(pushTaskToExternal).not.toHaveBeenCalled();
  });
  it('rejects stale calendar context, task edits, and another user’s approval', async () => {
    const task = await create('Work', { priority: 'CRITICAL' });
    const first = await turn('Fix my afternoon.');
    await expect(applyReplanProposal(otherId, first.confirmation!.actionId)).rejects.toThrow('NOT_FOUND');
    await prisma.calendarEvent.create({ data: { userId, title: 'New meeting', startAt: at('12:00'), endAt: at('13:00') } });
    await expect(turn('yes', first.confirmation!.actionId)).rejects.toThrow('STALE_REPLAN');
    const second = await turn('Fix my afternoon.');
    await prisma.task.update({ where: { id: task.id }, data: { title: 'Edited work' } });
    await expect(turn('yes', second.confirmation!.actionId)).rejects.toThrow('STALE_REPLAN');
    expect(pushTaskToExternal).not.toHaveBeenCalled();
  });
  it('provides a driving brief and grounded conflict/first-meeting follow-ups', async () => {
    await create('Shipped important work', { status: 'COMPLETED', completedAt: at('11:00'), priority: 'HIGH' });
    await create('Send presentation', { priority: 'CRITICAL', dueAt: at('15:00') });
    await prisma.calendarEvent.createMany({ data: [
      { userId, title: 'Dentist', startAt: at('13:00'), endAt: at('14:00') },
      { userId, title: 'Team call', startAt: at('13:30'), endAt: at('14:30') },
      { userId, title: 'Tomorrow meeting', startAt: at('09:00', '2026-09-08'), endAt: at('10:00', '2026-09-08') },
    ] });
    const briefing = await turn("I'm driving home. What do I need to know?");
    expect(briefing.spoken).toContain('completed 1 important task');
    expect((await turn('Tell me about the conflict.')).spoken).toContain('Dentist');
    expect((await turn("What's my first meeting?")).spoken).toContain('Tomorrow meeting');
    expect(pushTaskToExternal).not.toHaveBeenCalled();
  });
  it('uses only one optional explanation call and never sends credentials or notes', async () => {
    await create('Meaningful work', { notes: 'PRIVATE-NOTE-DO-NOT-SEND', priority: 'CRITICAL' });
    vi.stubEnv('OPENAI_API_KEY', 'test-key-not-real');
    const remote = vi.fn(async (_url: string, init: RequestInit) => {
      const candidates = JSON.parse(JSON.parse(String(init.body)).input).candidates as string[];
      return Response.json({ output_text: JSON.stringify({ explanation: candidates[1] }) });
    });
    vi.stubGlobal('fetch', remote);
    const result = await turn('What should I focus on today?');
    expect(remote).toHaveBeenCalledTimes(1);
    const input = JSON.parse(String(remote.mock.calls[0][1].body)).input;
    expect(input).not.toMatch(/PRIVATE-NOTE|passwordHash|never-send|accountEmail|userId/);
    expect(result.executive?.conversationalSummary).toBe('Meaningful work: high importance');
    expect(result.executive?.priorities[0].title).toBe('Meaningful work');
  });
  it('falls back to deterministic facts when the explanation provider fails', async () => {
    await create('Saved work');
    vi.stubEnv('OPENAI_API_KEY', 'test-key-not-real');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await turn('What should I focus on today?');
    expect(result.executive?.priorities[0].title).toBe('Saved work');
  });
  it('starts the recommended 45-minute focus through the existing task endpoint', async () => {
    const task = await create('Long proposal', { priority: 'CRITICAL', durationMin: 90, splittable: true, minFocusMin: 15 });
    const result = await turn('I have 45 minutes.');
    expect(result.executive?.recommendedActions[0].durationMin).toBe(45);
    const response = await PATCH(focusRequest(45), { params: Promise.resolve({ id: task.id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).focus.minutes).toBe(45);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('IN_PROGRESS');
    expect(pushTaskToExternal).not.toHaveBeenCalled();
    expect(await prisma.taskWorkSession.count({ where: { userId } })).toBe(0); // learning consent is off
  });
  it('validates focus duration, ownership, blocked and completed tasks', async () => {
    const task = await create('Done', { status: 'COMPLETED' });
    expect((await PATCH(focusRequest(-1), { params: Promise.resolve({ id: task.id }) })).status).toBe(400);
    expect((await PATCH(focusRequest(25), { params: Promise.resolve({ id: task.id }) })).status).toBe(409);
    const other = await prisma.task.create({ data: { userId: otherId, title: 'Other' } });
    expect((await PATCH(focusRequest(25), { params: Promise.resolve({ id: other.id }) })).status).toBe(404);
  });
  it('records only active focus segments with learning consent and rejects another user’s segment', async () => {
    await prisma.userPreference.update({ where: { userId }, data: { personalizationEnabled: true } });
    const task = await create('Splittable work', { durationMin: 90, splittable: true });
    const first = await PATCH(focusRequest(45), { params: Promise.resolve({ id: task.id }) });
    const segmentId = (await first.json()).focus.workSessionId;
    const finish = (workSessionId: string, endedAt: string) => PATCH(new Request('http://localhost/api/tasks/t', { method: 'PATCH', body: JSON.stringify({ focusAction: 'finish', workSessionId, endedAt }) }), { params: Promise.resolve({ id: task.id }) });
    vi.setSystemTime(at('12:10'));
    expect((await finish(segmentId, at('12:10').toISOString())).status).toBe(200);
    vi.setSystemTime(at('12:30'));
    expect((await finish(segmentId, at('12:30').toISOString())).status).toBe(200);
    expect((await prisma.taskWorkSession.findUniqueOrThrow({ where: { id: segmentId } })).durationMin).toBe(10);
    const resumed = await PATCH(focusRequest(35), { params: Promise.resolve({ id: task.id }) });
    const resumedId = (await resumed.json()).focus.workSessionId;
    expect(resumedId).not.toBe(segmentId);
    vi.setSystemTime(at('14:00')); // browser wakes late; stop at the actual timer deadline
    expect((await finish(resumedId, at('13:05').toISOString())).status).toBe(200);
    expect((await prisma.taskWorkSession.findUniqueOrThrow({ where: { id: resumedId } })).durationMin).toBe(35);
    const otherTask = await prisma.task.create({ data: { userId: otherId, title: 'Private' } });
    const otherSession = await prisma.taskWorkSession.create({ data: { userId: otherId, taskId: otherTask.id, startedAt: at('12:00') } });
    expect((await finish(otherSession.id, at('13:00').toISOString())).status).toBe(404);
    expect((await finish(segmentId, 'invalid')).status).toBe(400);
    expect(pushTaskToExternal).not.toHaveBeenCalled();
  });
  it('will not start a stale recommended session across a newly added meeting', async () => {
    const task = await create('Focus work', { durationMin: 45 });
    expect((await turn('I have 45 minutes.')).executive?.recommendedActions[0].durationMin).toBe(45);
    await prisma.calendarEvent.create({ data: { userId, title: 'New commitment', startAt: at('12:15'), endAt: at('13:00') } });
    expect((await PATCH(focusRequest(45), { params: Promise.resolve({ id: task.id }) })).status).toBe(409);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('PLANNED');
  });
  it('reports an external sync failure without claiming the local changes failed', async () => {
    await create('Task to place', { priority: 'CRITICAL' });
    const result = await turn('Fix my afternoon.');
    vi.mocked(pushTaskToExternal).mockRejectedValueOnce(new Error('Provider unavailable'));
    const applied = await turn('yes', result.confirmation!.actionId);
    expect(applied.spoken).toContain('Applied 1');
    expect(applied.spoken).toContain('1 calendar or reminder updates failed');
  });
  it('invalidates an ambiguous correction and never applies the earlier plan', async () => {
    await create('Review A'); await create('Review B');
    const proposal = await turn('Fix my afternoon.');
    const correction = await turn("Don't move review.");
    expect(correction.spoken).toContain('Which exact');
    await expect(turn('yes', proposal.confirmation!.actionId)).rejects.toThrow();
    expect(pushTaskToExternal).not.toHaveBeenCalled();
  });
});
