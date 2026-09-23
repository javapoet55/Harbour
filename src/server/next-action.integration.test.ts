import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db';
import { writeSession } from './session';
import { POST as assistant } from '@/app/api/assistant/route';
import { POST as intelligence } from '@/app/api/schedule-intelligence/route';
import { PATCH as taskPatch } from '@/app/api/tasks/[id]/route';
import { PATCH as settings } from '@/app/api/settings/route';
import { loadScheduleContext } from './schedule-intelligence';
import { proactiveNextAction, resolveComparison } from './executive-companion';
import { snapshot } from '@/lib/metrics';
import type { AssistantTurn } from './assistant';
import { buildExecutiveRecommendation } from '@/lib/executive-recommendations';

const jar = vi.hoisted(() => new Map<string, { value: string }>());
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => jar.get(key), set: (key: string, value: string) => jar.set(key, { value }), delete: (key: string) => jar.delete(key) }) }));
const at = (hm: string) => new Date(`2026-09-07T${hm}:00-07:00`);
const request = (body: unknown) => new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
let userId: string;
let otherId: string;
const create = (title: string, extra = {}) => prisma.task.create({ data: { userId, title, status: 'PLANNED', durationMin: 30, ...extra } });
async function ask(transcript: string, contextActionId?: string) {
  const response = await assistant(request({ transcript, contextActionId }));
  return { status: response.status, body: await response.json() as AssistantTurn & { error?: string } };
}
const patch = (id: string, body: unknown) => taskPatch(request(body), { params: Promise.resolve({ id }) });
const proactive = async () => { const response = await intelligence(request({ operation: 'next-action' })); return { status: response.status, body: await response.json() as Awaited<ReturnType<typeof proactiveNextAction>> }; };
async function enable(enabled = true, switchingThreshold = 10) {
  expect((await settings(request({ nextAction: { enabled, switchingThreshold } }))).status).toBe(200);
}
const event = (start = '14:00', end = '15:00') => prisma.calendarEvent.create({ data: { userId, title: 'Owned appointment', startAt: at(start), endAt: at(end) } });
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(at('13:00'));
  vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('HARBOR_SESSION_SECRET', 'a'.repeat(64));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No network expected in deterministic next-action tests'); }));
  jar.clear();
  userId = (await prisma.user.create({ data: { email: `${randomUUID()}@next-action.test`, passwordHash: 'private-fixture', name: 'Next-action owner', timeZone: 'America/Los_Angeles', preference: { create: {} } } })).id;
  otherId = (await prisma.user.create({ data: { email: `${randomUUID()}@next-action.test`, passwordHash: 'private', name: 'Other owner' } })).id;
  await writeSession(userId);
});
afterEach(async () => {
  await prisma.calendarEvent.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  jar.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
});

describe('authenticated next-action API → SQLite → shared engine → response/action', () => {
  it('A: real owned tasks/deadlines/calendar produce one best next action, with no LLM or mutations', async () => {
    const urgent = await create('Finish proposal', { priority: 'CRITICAL', dueAt: at('15:00') });
    await create('Routine admin', { priority: 'LOW' }); await event();
    await prisma.task.create({ data: { userId: otherId, title: 'OTHER-USER-SECRET', priority: 'CRITICAL' } });
    const before = await prisma.task.findMany({ where: { userId } });
    const result = await ask('What should I do next?');
    expect(result.status).toBe(200);
    expect(result.body.executive?.nextAction).toMatchObject({ bestAction: { taskId: urgent.id }, availableWindowMinutes: 45 });
    expect(JSON.stringify(result.body)).not.toContain('OTHER-USER-SECRET');
    expect(await prisma.task.findMany({ where: { userId } })).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('signature: a 38-minute opening starts a 30-minute session for the presentation', async () => {
    vi.setSystemTime(at('14:37'));
    const presentation = await create('Finish presentation', { priority: 'HIGH', dueAt: at('17:00'), durationMin: 30 });
    await create('Call insurance', { priority: 'LOW', durationMin: 10 });
    await create('Reply to Damien', { priority: 'LOW', durationMin: 5 });
    await event('15:30', '16:00');
    const result = await ask('What should I do next?');
    expect(result.status).toBe(200);
    expect(result.body.executive?.nextAction).toMatchObject({ availableWindowMinutes: 38, bestAction: { taskId: presentation.id, focusMinutes: 30 } });
    const started = await patch(presentation.id, { status: 'IN_PROGRESS', focusMinutes: 30, fromRecommendation: true });
    expect(started.status).toBe(200);
    expect((await started.json()).focus.minutes).toBe(30);
    expect((await loadScheduleContext(userId)).activeFocus).toMatchObject({ taskId: presentation.id, endsAt: +at('15:07') });
  });
  it('B: 45 minutes caps at the next real meeting and excludes an unsplittable long task', async () => {
    await event('13:45', '14:00');
    const short = await create('Short task');
    await create('Impossible long', { priority: 'CRITICAL', durationMin: 180 });
    const result = await ask('I have 45 minutes. What should I do?');
    expect(result.body.executive?.nextAction).toMatchObject({ bestAction: { taskId: short.id, focusMinutes: 30 }, availableWindowMinutes: 30 });
  });
  it('C: compares actual candidate tasks, not unrelated higher priorities or invented meeting links', async () => {
    const prep = await create('Prepare for my meeting', { priority: 'HIGH', dueAt: at('14:00') });
    await create('Finish the budget', { priority: 'NORMAL', dueAt: at('17:00') });
    await create('Unrelated critical work', { priority: 'CRITICAL', dueAt: at('13:30') });
    const result = await ask('Should I prepare for my meeting or finish the budget?');
    expect(result.body.executive?.nextAction?.bestAction?.taskId).toBe(prep.id);
    expect(result.body.executive?.priorities.map((item) => item.title)).not.toContain('Unrelated critical work');
    expect(result.body.spoken).not.toMatch(/meeting (starts|is) at|blocks two other people/);
  });
  it('asks clarification for ambiguous, unknown and cross-user comparison choices without LLM fallback', async () => {
    await create('Team budget'); await create('Personal budget'); await create('Meeting prep');
    const response = await ask('Should I finish the budget or prepare for my meeting?');
    expect(response.body.spoken).toContain('exact task titles'); expect(response.body.executive).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(resolveComparison('Should I A or B?', [{ id: '1', title: 'A' }, { id: '2', title: 'B' }])).toEqual(['1', '2']);
  });
  it('compares all four named candidates instead of mislabelling the fourth as unable to fit', async () => {
    for (const title of ['proposal', 'budget', 'emails', 'review']) await create(title);
    const result = await ask('Should I finish proposal, budget, emails or review?');
    expect(result.body.executive?.priorities).toHaveLength(4);
    expect(result.body.executive?.sections.at(-1)?.items.join(' ')).not.toContain('unable to fit');
  });
  it('D: a meeting extended by 45 minutes invalidates an earlier recommendation; cancellation reopens time', async () => {
    const appointment = await event('12:00', '12:45');
    const work = await create('Work');
    const first = await ask('What should I do next?');
    expect(first.body.executive?.nextAction?.bestAction?.taskId).toBe(work.id);
    await prisma.calendarEvent.update({ where: { id: appointment.id }, data: { endAt: at('13:30') } });
    expect((await ask('What should I do next?')).body.executive?.window.availableMinutes).toBe(0);
    expect((await patch(work.id, { status: 'IN_PROGRESS', focusMinutes: 30, fromRecommendation: true })).status).toBe(409);
    await prisma.calendarEvent.update({ where: { id: appointment.id }, data: { deletedAt: at('13:00') } });
    expect((await ask('What should I do next?')).body.executive?.nextAction?.bestAction?.taskId).toBe(work.id);
  });
  it('does not invent a new meeting end time from an ambiguous late-meeting report', async () => {
    const appointment = await event(); await create('Work');
    const answer = await ask('My meeting ran 45 minutes late.');
    expect(answer.body.spoken).toContain('updated end time'); expect(answer.body.confirmation).toBeUndefined();
    expect(await prisma.calendarEvent.findUnique({ where: { id: appointment.id } })).toEqual(appointment);
  });
  it('E: completing a scheduled task opens real time and produces an eligible proactive next step', async () => {
    await enable();
    const occupied = await create('Current task', { startAt: at('13:00'), dueAt: null });
    const upcoming = await create('Next useful task');
    expect((await proactive()).body.recommendation).toBeNull();
    expect((await patch(occupied.id, { status: 'COMPLETED' })).status).toBe(200);
    const result = await proactive();
    expect(result.body.recommendation?.nextAction).toMatchObject({ bestAction: { taskId: upcoming.id }, proactive: true });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: upcoming.id } })).status).toBe('PLANNED');
  });
  it('retains explicit Why context and temporarily excludes disliked alternatives without task writes', async () => {
    await create('A critical task', { priority: 'CRITICAL' }); await create('B task'); await create('C task');
    const before = await prisma.task.findMany({ where: { userId } });
    const first = await ask('What should I do next?');
    await ask('I have 15 minutes.'); // unrelated turn must not hijack explicit context
    const why = await ask('Why?', first.body.contextActionId);
    expect(why.body.spoken).toContain('A critical task');
    const second = await ask("I don't want to work on that.", first.body.contextActionId);
    expect(second.body.executive?.priorities[0].title).toBe('B task');
    const third = await ask('Give me another one.', second.body.contextActionId);
    expect(third.body.executive?.priorities[0].title).toBe('C task');
    expect((await ask('No', third.body.contextActionId)).body.executive?.priorities).toEqual([]);
    expect((await ask('What should I do next?')).body.executive?.priorities[0].title).toBe('A critical task');
    expect(await prisma.task.findMany({ where: { userId } })).toEqual(before);
  });
  it('requires the owned conversation; cannot use another user’s Why, rejection, or focus action', async () => {
    const work = await create('Owned task'); const first = await ask('What should I do next?');
    await enable(); const card = await proactive();
    await writeSession(otherId);
    expect((await ask('Why?', first.body.contextActionId)).status).toBe(404);
    expect((await intelligence(request({ operation: 'dismiss-next-action', contextActionId: card.body.contextActionId }))).status).toBe(404);
    expect((await patch(work.id, { status: 'IN_PROGRESS', focusMinutes: 25 })).status).toBe(404);
  });
  it('focus start is explicit, creates expiring operational state without learning history, and protects switching', async () => {
    const work = await create('Current work'); await create('Slightly better');
    const response = await patch(work.id, { status: 'IN_PROGRESS', focusMinutes: 30, fromRecommendation: true });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(await prisma.taskWorkSession.count({ where: { userId } })).toBe(0);
    expect((await loadScheduleContext(userId)).activeFocus?.taskId).toBe(work.id);
    expect((await ask('What should I do next?')).body.executive?.nextAction?.continuingFocus).toBe(true);
    expect((await patch(work.id, { focusAction: 'finish', focusToken: data.focus.focusToken, endedAt: at('13:00').toISOString() })).status).toBe(200);
    expect((await loadScheduleContext(userId)).activeFocus).toBeNull();
  });
  it('a delayed finish for an old timer cannot clear the new timer', async () => {
    const work = await create('Work');
    const a = await (await patch(work.id, { status: 'IN_PROGRESS', focusMinutes: 25 })).json();
    const b = await (await patch(work.id, { status: 'IN_PROGRESS', focusMinutes: 45 })).json();
    await patch(work.id, { focusAction: 'finish', focusToken: a.focus.focusToken, endedAt: at('13:00').toISOString() });
    expect((await loadScheduleContext(userId)).activeFocus?.endsAt).toBe(+at('13:45'));
    await patch(work.id, { focusAction: 'finish', focusToken: b.focus.focusToken, endedAt: at('13:00').toISOString() });
    expect((await loadScheduleContext(userId)).activeFocus).toBeNull();
  });
  it('proactive preference, cooldown, dismissal, and repeated-card refresh prevent notification spam', async () => {
    const work = await create('A work'); const other = await create('B work');
    expect((await proactive()).body.recommendation).toBeNull();
    await enable();
    const beforeCount = snapshot().counters.proactive_next_action_generated ?? 0;
    const first = await proactive();
    expect(first.body.recommendation?.priorities[0].taskId).toBe(work.id);
    const repeated = await proactive();
    expect(repeated.body.contextActionId).toBe(first.body.contextActionId);
    expect(snapshot().counters.proactive_next_action_generated).toBe(beforeCount + 1);
    expect((await intelligence(request({ operation: 'dismiss-next-action', contextActionId: first.body.contextActionId }))).status).toBe(200);
    expect((await proactive()).body.recommendation).toBeNull();
    // Completing the dismissed choice ends its cooldown by design (next-action-config.ts:14): the
    // dismissal was about that task, so finishing it must not hold back the next useful suggestion.
    await prisma.task.update({ where: { id: work.id }, data: { status: 'COMPLETED' } });
    expect((await proactive()).body.recommendation?.priorities[0].taskId).toBe(other.id);
    vi.setSystemTime(at('13:31'));
    const persisted = JSON.parse((await prisma.userMemory.findUniqueOrThrow({ where: { userId_key: { userId, key: 'runtime:next_action' } } })).value);
    expect(persisted).toMatchObject({ taskId: other.id, shownAt: +at('13:00') });
    expect(persisted.dismissed).toBeUndefined();
    expect(buildExecutiveRecommendation(await loadScheduleContext(userId), 'NEXT_ACTION').recommendation.priorities[0]?.title).toBe('B work');
    const afterCooldown = await proactive();
    expect(afterCooldown).toMatchObject({ status: 200, body: { enabled: true, recommendation: { priorities: [{ title: 'B work' }] } } });
    await enable(false); expect((await proactive()).body.recommendation).toBeNull();
  });
  it('quiet hours and active focus suppress proactive suggestions; focus completion boundary resumes evaluation', async () => {
    const work = await create('Work'); await enable();
    await prisma.userPreference.update({ where: { userId }, data: { quietStart: '12:00', quietEnd: '14:00' } });
    const quiet = await proactive(); expect(quiet.body.recommendation).toBeNull(); expect(quiet.body.refreshAt).toBe(at('14:00').toISOString());
    await prisma.userPreference.update({ where: { userId }, data: { quietStart: '21:00', quietEnd: '07:00' } });
    const data = await (await patch(work.id, { status: 'IN_PROGRESS', focusMinutes: 25 })).json();
    const result = await proactive();
    expect(result.body.recommendation).toBeNull(); expect(result.body.refreshAt).toBe(at('13:25').toISOString());
    await patch(work.id, { focusAction: 'finish', focusToken: data.focus.focusToken, endedAt: at('13:00').toISOString() });
    expect((await proactive()).body.recommendation?.priorities[0].taskId).toBe(work.id);
  });
  it('simultaneous proactive requests claim only one new suggestion', async () => {
    await create('Work'); await enable();
    const before = snapshot().counters.proactive_next_action_generated ?? 0;
    const results = await Promise.all([proactiveNextAction(userId), proactiveNextAction(userId), proactiveNextAction(userId)]);
    expect(results.some((result) => result.recommendation)).toBe(true);
    expect((snapshot().counters.proactive_next_action_generated ?? 0) - before).toBe(1);
    expect(await prisma.assistantAction.count({ where: { userId, intent: 'EXECUTIVE_READ' } })).toBe(1);
  });
  it('stale external calendars degrade with a warning and suppress proactive/focus actions', async () => {
    await create('Work'); await enable();
    await prisma.calendarConnection.create({ data: { userId, provider: 'google', calendarId: 'owned', calendarName: 'Owned', accountEmail: 'fixture@example.test', lastSyncedAt: at('10:00') } });
    const answer = await ask('What should I do next?');
    expect(answer.body.executive?.confidence).toBe(.5);
    expect(answer.body.executive?.recommendedActions).toEqual([]);
    expect((await proactive()).body.recommendation).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it('observability records dispositions without task titles or calendar details', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    await create('PRIVATE-TITLE');
    const result = await ask('What should I do next?');
    await ask('Give me another one.', result.body.contextActionId);
    expect(log.mock.calls.flat().join(' ')).not.toContain('PRIVATE-TITLE');
    for (const key of ['next_action_requested', 'next_action_generated', 'next_action_rejected', 'next_action_alternative_requested']) expect(snapshot().counters[key]).toBeGreaterThan(0);
    log.mockRestore();
  });
});
