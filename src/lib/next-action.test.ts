import { describe, expect, it } from 'vitest';
import { buildExecutiveRecommendation, type ExecutiveContext, type ExecutiveTask } from './executive-recommendations';
import { parseIntent } from './intent';
import { NEXT_ACTION_POLICY } from './next-action-config';

const at = (hm: string) => new Date(`2026-09-07T${hm}:00-07:00`);
const task = (id: string, values: Partial<ExecutiveTask> = {}): ExecutiveTask => ({ id, title: id, status: 'PLANNED', priority: 'NORMAL', startAt: null, dueAt: null, durationMin: 30, updatedAt: at('08:00'), ...values });
const meeting = (start = '14:00', end = '15:00') => ({ id: 'meeting', title: 'Meeting', startAt: at(start), endAt: at(end) });
const ctx = (values: Partial<ExecutiveContext> = {}): ExecutiveContext => ({ now: at('13:00'), timeZone: 'America/Los_Angeles', workStart: '09:00', workEnd: '17:00', workingDays: '1,2,3,4,5', bufferMinutes: 15, tasks: [], events: [], ...values });
const next = (context: ExecutiveContext, options = {}) => buildExecutiveRecommendation(context, 'NEXT_ACTION', options).recommendation;

describe('next-action deterministic acceptance matrix', () => {
  it.each(['What should I do next?', 'What should I work on now?', "What's the most important thing right now?", 'What is my next priority?', 'What should I work on next?'])('routes %s to the shared next engine', (text) => expect(parseIntent(text).intent).toBe('NEXT_ACTION'));
  it('preserves explicit free-time bounds before the next-action phrase', () => expect(parseIntent('I have 45 minutes. What should I do next?')).toMatchObject({ intent: 'FREE_WINDOW', durationMin: 45 }));
  it('resolves comparison intent before generic focus', () => expect(parseIntent('Should I prepare for the 2 PM review, answer emails, or finish the budget?').intent).toBe('COMPARE_TASKS'));
  it('routes recovery to approval-safe replanning', () => expect(parseIntent('My meeting ran 45 minutes late.').intent).toBe('FIX_SCHEDULE'));
  it('one strongest urgent recommendation first, with normalized traceable factors', () => {
    const rec = next(ctx({ tasks: [task('routine', { priority: 'LOW' }), task('urgent', { priority: 'CRITICAL', dueAt: at('14:00') })], events: [meeting()] }));
    expect(rec.nextAction?.bestAction?.taskId).toBe('urgent');
    expect(rec.nextAction?.alternatives.map((item) => item.taskId)).toEqual(['routine']);
    expect(rec.nextAction?.availableWindowMinutes).toBe(45);
    expect(rec.nextAction?.bestAction?.score).toBeGreaterThan(80);
    expect(rec.nextAction?.bestAction?.score).toBeLessThanOrEqual(100);
    expect(rec.requiresApproval).toBe(false); expect(rec.proposedScheduleChanges).toEqual([]);
  });
  it.each([15, 30, 45, 60])('fits a declared %i-minute window, not an unsplittable 3-hour task', (minutes) => {
    const rec = buildExecutiveRecommendation(ctx({ tasks: [task('fits', { durationMin: minutes }), task('too long', { durationMin: 180, priority: 'CRITICAL' })] }), 'FREE_WINDOW', { minutes }).recommendation;
    expect(rec.nextAction?.bestAction).toMatchObject({ taskId: 'fits', focusMinutes: minutes, windowFit: 100 });
    expect(rec.nextAction?.alternatives).toEqual([]);
  });
  it('supports a saved splittable long task and excludes chunks below the saved minimum', () => {
    const context = ctx({ events: [meeting()], tasks: [task('presentation', { durationMin: 90, priority: 'CRITICAL', splittable: true, minFocusMin: 30 }), task('routine')] });
    expect(next(context).nextAction?.bestAction).toMatchObject({ taskId: 'presentation', partial: true, focusMinutes: 45 });
    context.events = [meeting('13:30', '14:00')];
    expect(next(context).nextAction?.bestAction).toBeNull();
  });
  it('ranks competing urgency and negative cumulative slack, including overdue work', () => {
    const rec = next(ctx({ tasks: [task('normal'), task('soon', { priority: 'CRITICAL', dueAt: at('13:30') }), task('overdue', { priority: 'CRITICAL', dueAt: at('12:00') })] }));
    expect(rec.priorities[0].taskId).toBe('overdue');
    expect(rec.priorities[0].deadlineRisk).toBe(100);
    expect(rec.priorities[0].slackMinutes).toBe(-30);
    expect(rec.priorities.find((item) => item.taskId === 'soon')?.slackMinutes).toBe(-30);
  });
  it('excludes blocked, waiting, completed and cancelled tasks', () => {
    const tasks = [task('blocked', { dependencyBlocked: true }), task('waiting', { status: 'WAITING' }), task('done', { status: 'COMPLETED' }), task('cancelled', { status: 'CANCELLED' }), task('ready')];
    expect(next(ctx({ tasks })).priorities.map((item) => item.taskId)).toEqual(['ready']);
  });
  it('reuses dependency impact and configurable weights without a second priority engine', () => {
    const rec = next(ctx({ tasks: [task('A'), task('B', { blocksCount: 3 })] }), { weights: { ...NEXT_ACTION_POLICY.weights, dependencyImpact: 5 } });
    expect(rec.priorities[0]).toMatchObject({ taskId: 'B', dependencyImpact: 99 });
    expect(rec.priorities[0].reasons.join(' ')).toContain('3 follow-on');
  });
  it('honors saved energy/project preference with no invented device or location context', () => {
    const rec = next(ctx({ tasks: [task('A', { contextScore: 10, preferenceScore: 10 }), task('B', { contextScore: 100, preferenceScore: 100 })] }));
    expect(rec.priorities[0].taskId).toBe('B');
    expect(rec.assumptions.join(' ')).toContain('Unknown location');
  });
  it('clips before a meeting starting soon, including the buffer', () => {
    expect(next(ctx({ tasks: [task('short', { durationMin: 15 })], events: [meeting('13:20', '14:00')] })).window.availableMinutes).toBe(5);
  });
  it('free calendar is bounded by work hours, full calendar gives no recommendation', () => {
    const context = ctx({ tasks: [task('work')] });
    expect(next(context).window.availableMinutes).toBe(240);
    expect(next({ ...context, events: [meeting('09:00', '17:00')] }).nextAction?.bestAction).toBeNull();
  });
  it('uses exact now between quarter-hours instead of treating 13:31 as outside working hours', () => {
    const rec = next(ctx({ now: new Date('2026-09-07T13:31:12-07:00'), tasks: [task('work')] }));
    expect(rec.window.availableMinutes).toBe(208); expect(rec.nextAction?.bestAction?.taskId).toBe('work');
  });
  it('outside work hours does not invent a free workday, but an explicit window is allowed', () => {
    const context = ctx({ now: at('20:00'), tasks: [task('work')] });
    expect(next(context).window.availableMinutes).toBe(0);
    expect(buildExecutiveRecommendation(context, 'FREE_WINDOW', { minutes: 30 }).recommendation.nextAction?.bestAction?.taskId).toBe('work');
  });
  it('protects active focus from a slightly higher score, counting invested time and project setup', () => {
    const rec = next(ctx({ tasks: [task('current', { status: 'IN_PROGRESS', projectId: 'one', contextScore: 80 }), task('slightly better', { projectId: 'two', contextScore: 100 })], activeFocus: { taskId: 'current', startedAt: +at('12:40'), endsAt: +at('13:30') } }));
    expect(rec.nextAction?.continuingFocus).toBe(true);
    expect(rec.priorities[0].taskId).toBe('current');
    expect(rec.priorities[1].switchingCost).toBe(30);
    expect(rec.priorities[1].baseScore! - rec.priorities[0].baseScore!).toBeLessThan(5);
  });
  it('allows a meaningful improvement but never switches automatically', () => {
    const rec = next(ctx({ tasks: [task('current', { priority: 'LOW', status: 'IN_PROGRESS' }), task('urgent', { priority: 'CRITICAL', dueAt: at('13:45') })], activeFocus: { taskId: 'current', startedAt: +at('13:00'), endsAt: +at('13:30') } }));
    expect(rec.priorities[0].taskId).toBe('urgent'); expect(rec.proposedScheduleChanges).toEqual([]);
  });
  it('strong user switching preference keeps focus when a weaker threshold would not', () => {
    const context = ctx({ switchingThreshold: 50, tasks: [task('current', { status: 'IN_PROGRESS' }), task('urgent', { priority: 'CRITICAL', dueAt: at('14:00') })], activeFocus: { taskId: 'current', startedAt: +at('13:00'), endsAt: +at('13:30') } });
    expect(next(context).priorities[0].taskId).toBe('current');
  });
  it('continues an explicitly started focus chunk even when the whole estimate cannot finish now', () => {
    expect(next(ctx({ tasks: [task('current', { status: 'IN_PROGRESS', durationMin: 90 })], events: [meeting()], activeFocus: { taskId: 'current', startedAt: +at('12:50'), endsAt: +at('13:15') } })).priorities[0]).toMatchObject({ taskId: 'current', focusMinutes: 15, partial: true });
  });
  it('ignores expired or completed focus state', () => {
    const context = ctx({ tasks: [task('old', { status: 'COMPLETED' }), task('new')], activeFocus: { taskId: 'old', startedAt: +at('12:00'), endsAt: +at('14:00') } });
    expect(next(context).priorities[0]).toMatchObject({ taskId: 'new', switchingCost: 0 });
  });
  it('recalculates when a meeting runs 45 minutes late, is cancelled, or a task completes', () => {
    const context = ctx({ events: [meeting('12:00', '12:45')], tasks: [task('work')] });
    expect(next(context).window.availableMinutes).toBe(240);
    context.events[0].endAt = at('13:30');
    expect(next(context).window.availableMinutes).toBe(0);
    context.events = [];
    expect(next(context).window.availableMinutes).toBe(240);
    context.tasks[0].status = 'COMPLETED';
    expect(next(context).nextAction?.bestAction).toBeNull();
  });
  it('honors exclusions and comparison scope in the same engine', () => {
    const context = ctx({ tasks: [task('a', { priority: 'CRITICAL' }), task('b'), task('c')] });
    expect(next(context, { excludedTaskIds: ['a'], candidateTaskIds: ['a', 'b'] }).priorities.map((item) => item.taskId)).toEqual(['b']);
  });
  it.each([
    ['Asia/Kolkata', '2026-09-07T04:30:00Z', '2026-09-07T11:30:00Z', 420],
    ['America/Los_Angeles', '2026-03-08T08:30:00Z', '2026-03-08T11:00:00Z', 150],
    ['America/Los_Angeles', '2026-11-01T07:30:00Z', '2026-11-01T12:00:00Z', 270],
  ])('uses local working time and real elapsed time through DST: %s %s', (zone, now, end, minutes) => {
    const rec = next(ctx({ timeZone: zone, now: new Date(now), workStart: zone === 'Asia/Kolkata' ? '09:00' : '00:00', workEnd: zone === 'Asia/Kolkata' ? '17:00' : '04:00', workingDays: '0,1,2,3,4,5,6', tasks: [task('work')] }));
    expect(rec.window.endAt).toBe(new Date(end).toISOString()); expect(rec.window.availableMinutes).toBe(minutes);
  });
  it('stale calendar warning lowers confidence and disables recommended mutation buttons', () => {
    const rec = next(ctx({ contextWarnings: ['Calendar needs synchronization.'], tasks: [task('work')] }));
    expect(rec.nextAction?.confidence).toBe(.5); expect(rec.recommendedActions).toEqual([]);
  });
});

describe('signature do-now experience', () => {
  it('at 2:37 PM uses the 38-minute opening and recommends the due-soon presentation with two quick alternatives', () => {
    const rec = next(ctx({ now: at('14:37'), events: [meeting('15:30', '16:00')], tasks: [
      task('presentation', { title: 'Finish presentation', durationMin: 30, dueAt: at('17:00'), priority: 'HIGH' }),
      task('insurance', { title: 'Call insurance', durationMin: 10, priority: 'LOW' }),
      task('damien', { title: 'Reply to Damien', durationMin: 5, priority: 'LOW' }),
      ...Array.from({ length: 24 }, (_, i) => task(`long-${i}`, { durationMin: 120, splittable: false })),
    ] }));
    expect(rec.nextAction?.availableWindowMinutes).toBe(38);
    expect(rec.nextAction?.bestAction).toMatchObject({ taskId: 'presentation', focusMinutes: 30, partial: false });
    expect(rec.nextAction?.alternatives.map(t => t.taskId).sort()).toEqual(['damien', 'insurance']);
    expect(rec.recommendedActions[0]).toMatchObject({ type: 'START_FOCUS', durationMin: 30 });
  });
  it('does not offer a focus start while the user is already in a calendar appointment', () => {
    const rec = next(ctx({ now: at('14:37'), events: [meeting('14:30', '15:00')], tasks: [task('presentation')] }));
    expect(rec.nextAction?.availableWindowMinutes).toBe(0);
    expect(rec.nextAction?.bestAction).toBeNull();
    expect(rec.recommendedActions).toEqual([]);
  });
});
