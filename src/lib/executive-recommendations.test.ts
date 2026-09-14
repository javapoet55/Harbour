import { describe, expect, it } from 'vitest';
import { buildExecutiveRecommendation, type ExecutiveContext, type ExecutiveTask } from './executive-recommendations';
import { parseIntent } from './intent';
import { buildReplan } from './replanning';
import { focusSecondsRemaining } from './focus-session';

const at = (hm: string, day = '2026-09-07') => new Date(`${day}T${hm}:00-07:00`);
const task = (id: string, values: Partial<ExecutiveTask> = {}): ExecutiveTask => ({ id, title: id, priority: 'NORMAL', status: 'PLANNED', startAt: null, dueAt: null, durationMin: 30, updatedAt: at('08:00'), ...values });
const event = (id: string, start: string, end: string, day = '2026-09-07') => ({ id, title: id, startAt: at(start, day), endAt: at(end, day) });
const context = (values: Partial<ExecutiveContext> = {}): ExecutiveContext => ({ now: at('13:00'), tasks: [], events: [], timeZone: 'America/Los_Angeles', workStart: '09:00', workEnd: '17:00', workingDays: '1,2,3,4,5', bufferMinutes: 15, ...values });

describe('current opening versus remaining day capacity', () => {
  const morning = () => context({ now: at('05:53'), tasks: [task('one', { startAt: at('09:00') }), task('two', { startAt: at('10:00') }), task('three', { startAt: at('11:00') })] });
  it('does not equate an early-morning zero opening with a full day', () => {
    const r = buildExecutiveRecommendation(morning(), 'NEXT_ACTION').recommendation;
    expect(r.nextAction).toMatchObject({ availableWindowMinutes: 0, outsideWorkingHours: true, remainingWorkingMinutesToday: 390 });
    expect(r.summary).toContain('This does not mean your day is full');
  });
  it('allows explicitly declared early-morning time and still observes appointments', () => {
    const ctx = { ...morning(), tasks: [task('quick')] };
    expect(buildExecutiveRecommendation(ctx, 'FREE_WINDOW', { minutes: 38 }).recommendation.nextAction).toMatchObject({ availableWindowMinutes: 38, outsideWorkingHours: false });
    const blocked = { ...ctx, events: [event('early meeting', '06:15', '07:00')] };
    expect(buildExecutiveRecommendation(blocked, 'FREE_WINDOW', { minutes: 38 }).recommendation.nextAction?.availableWindowMinutes).toBe(7);
  });
  it('does not count tomorrow as remaining today after hours or on a non-working day', () => {
    for (const ctx of [context({ now: at('18:00') }), context({ now: at('05:53'), workingDays: '2' })]) {
      expect(buildExecutiveRecommendation(ctx, 'NEXT_ACTION').recommendation.nextAction?.remainingWorkingMinutesToday).toBe(0);
    }
  });
});

describe('executive intent routing', () => {
  it.each(['What should I focus on today?', 'What should I do today?', 'What are my priorities?', "What's most important?"])('routes focus variation %s', (text) => expect(parseIntent(text).intent).toBe('FOCUS_TODAY'));
  it.each(['Fix my afternoon.', 'Optimize my afternoon.', 'Reorganize the rest of my day.', 'My afternoon is too busy.', 'Can you make everything fit?'])('routes optimization %s', (text) => expect(parseIntent(text).intent).toBe('FIX_SCHEDULE'));
  it.each(["I'm driving home. What do I need to know?", 'Give me my evening briefing.', 'Brief me on my day.', 'Anything important before I get home?', "What's left today?"])('routes audio briefing %s', (text) => expect(parseIntent(text).intent).toBe('DRIVING_BRIEFING'));
  it.each([['I have 15 minutes.', 15], ['I have 30 minutes free.', 30], ['I have 45 minutes.', 45], ['I have an hour.', 60], ['I have 1.5 hours free.', 90], ['I have half an hour.', 30]] as const)('parses arbitrary duration %s', (text, durationMin) => expect(parseIntent(text)).toMatchObject({ intent: 'FREE_WINDOW', durationMin }));
  it('understands the next-meeting window', () => expect(parseIntent('What can I get done before my next meeting?').intent).toBe('FREE_WINDOW'));
});

describe('grounded focus and available-window ranking', () => {
  it('preserves a declared 45-minute opening across midnight and still honors next-day meetings', () => {
    const ctx = context({ now: at('23:30'), tasks: [task('Forty-five-minute task', { durationMin: 45 })] });
    const result = buildExecutiveRecommendation(ctx, 'FREE_WINDOW', { minutes: 45 }).recommendation;
    expect(result.window.availableMinutes).toBe(45);
    expect(result.recommendedActions[0]?.durationMin).toBe(45);
    const blocked = buildExecutiveRecommendation({ ...ctx, events: [event('Midnight meeting', '00:10', '00:40', '2026-09-08')] }, 'FREE_WINDOW', { minutes: 45 }).recommendation;
    expect(blocked.window.availableMinutes).toBe(25);
  });
  it('ranks at most three actionable tasks, not the first three or completed/blocked/waiting work', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('trivial', { priority: 'LOW' }), task('done', { status: 'COMPLETED', priority: 'CRITICAL' }), task('blocked', { priority: 'CRITICAL', dependencyBlocked: true }), task('waiting', { status: 'WAITING' }), task('urgent', { priority: 'CRITICAL', dueAt: at('13:45'), durationMin: 90 }), task('late', { dueAt: at('12:00') }), task('normal')] }), 'FOCUS_TODAY');
    expect(recommendation.priorities).toHaveLength(3);
    expect(recommendation.priorities[0].taskId).toBe('urgent');
    expect(recommendation.priorities[0].slackMinutes).toBe(-75); // 90-minute urgent task plus 30 minutes already overdue share 45 minutes
    expect(recommendation.priorities.map((item) => item.taskId)).not.toEqual(expect.arrayContaining(['done', 'blocked', 'waiting']));
  });
  it('caps the declared window at the next appointment minus travel allowance', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ events: [event('meeting', '13:45', '14:30')], tasks: [task('quick')] }), 'FREE_WINDOW', { minutes: 45 });
    expect(recommendation.window.availableMinutes).toBe(30);
    expect(recommendation.recommendedActions[0].durationMin).toBe(30);
  });
  it('does not blindly select a long unsplittable critical task', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('critical long', { priority: 'CRITICAL', durationMin: 90 }), task('fits', { durationMin: 30 })] }), 'FREE_WINDOW', { minutes: 45 });
    expect(recommendation.priorities.map((item) => item.taskId)).toEqual(['fits']);
  });
  it('recommends a meaningful partial session without pretending the whole task is finished', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('presentation', { priority: 'CRITICAL', durationMin: 90, splittable: true, minFocusMin: 25, dueAt: at('10:00', '2026-09-08') }), task('minor', { durationMin: 10, priority: 'LOW' })] }), 'FREE_WINDOW', { minutes: 45 });
    expect(recommendation.priorities[0]).toMatchObject({ taskId: 'presentation', focusMinutes: 45, partial: true, durationMin: 90 });
    expect(recommendation.recommendedActions[0].label).toBe('Start 45-minute focus session');
  });
  it('respects a minimum useful chunk and an imminent deadline', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('too short', { durationMin: 90, splittable: true, minFocusMin: 30, dueAt: at('13:20') })] }), 'FREE_WINDOW', { minutes: 45 });
    expect(recommendation.priorities).toEqual([]);
  });
  it('treats an ongoing meeting as occupied, not free', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ events: [event('meeting', '12:30', '14:00')], tasks: [task('quick')] }), 'FREE_WINDOW', { minutes: 45 });
    expect(recommendation.window.availableMinutes).toBe(0);
    expect(recommendation.recommendedActions).toEqual([]);
  });
  it('protects another task already scheduled in the declared opening', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('reserved', { startAt: at('13:15') }), task('quick')] }), 'FREE_WINDOW', { minutes: 45 });
    expect(recommendation.window.availableMinutes).toBe(15);
  });
  it('returns an honest empty recommendation on a completely free day', () => {
    for (const intent of ['FOCUS_TODAY', 'FREE_WINDOW', 'DRIVING_BRIEFING', 'FIX_SCHEDULE'] as const) {
      const { recommendation } = buildExecutiveRecommendation(context(), intent, { minutes: 45 });
      expect(recommendation.priorities).toEqual([]);
      expect(recommendation.requiresApproval).toBe(false);
      expect(recommendation.spoken).not.toBe('');
    }
  });
});

describe('approval-safe optimization', () => {
  it('scopes to the afternoon, preserves appointments and proposes only task moves', () => {
    const input = context({ tasks: [task('proposal', { startAt: at('14:00'), priority: 'CRITICAL', dueAt: at('17:00'), durationMin: 60 })], events: [event('Dentist', '14:00', '15:00')] });
    const before = JSON.stringify(input);
    const { recommendation } = buildExecutiveRecommendation(input, 'FIX_SCHEDULE');
    expect(recommendation.proposedScheduleChanges).toHaveLength(1);
    expect(recommendation.proposedScheduleChanges[0].taskId).toBe('proposal');
    expect(recommendation.fixedCommitments[0].title).toBe('Dentist');
    expect(recommendation.requiresApproval).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('identifies the actual deficit on an overloaded day', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('work', { durationMin: 300, priority: 'CRITICAL', dueAt: at('17:00') })], events: [event('fixed', '13:00', '15:00')] }), 'FIX_SCHEDULE');
    expect(recommendation.window).toMatchObject({ availableMinutes: 105, requiredMinutes: 300, deficitMinutes: 195 }); // review allowance overlaps the existing meeting
    expect(recommendation.proposedScheduleChanges).toEqual([]);
    expect(recommendation.risks.length).toBeGreaterThan(0);
  });
  it('defers low-value flexible work to tomorrow while protecting urgent work', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('proposal', { priority: 'CRITICAL', durationMin: 180, dueAt: at('17:00') }), task('admin', { priority: 'LOW', startAt: at('13:00'), durationMin: 120 })] }), 'FIX_SCHEDULE');
    const proposal = recommendation.proposedScheduleChanges.find((item) => item.taskId === 'proposal')!;
    const admin = recommendation.proposedScheduleChanges.find((item) => item.taskId === 'admin')!;
    expect(proposal.after).toBe(at('13:05').toISOString());
    expect(admin.after).toBe(at('09:00', '2026-09-08').toISOString());
  });
  it('preserves a task explicitly protected in a follow-up', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('dentist task', { startAt: at('14:00') }), task('proposal', { durationMin: 60, priority: 'CRITICAL' })] }), 'FIX_SCHEDULE', { protectedTaskIds: ['dentist task'] });
    expect(recommendation.proposedScheduleChanges.some((item) => item.taskId === 'dentist task')).toBe(false);
    expect(recommendation.fixedCommitments.some((item) => item.id === 'dentist task')).toBe(true);
  });
  it('does not allocate working time through an all-day commitment', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ events: [{ ...event('Away', '00:00', '23:59'), allDay: true }], tasks: [task('urgent', { priority: 'CRITICAL' })] }), 'FIX_SCHEDULE');
    expect(recommendation.window.availableMinutes).toBe(0);
    expect(recommendation.proposedScheduleChanges).toHaveLength(0);
  });
  it('detects both overlapping meetings and insufficient transition time', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ events: [event('one', '14:00', '15:00'), event('two', '14:30', '15:30'), event('three', '15:35', '16:00')] }), 'FOCUS_TODAY');
    expect(recommendation.conflicts.map((item) => item.title)).toEqual(expect.arrayContaining(['Calendar overlap', 'A tight transition']));
  });
  it('orders long dependency chains and rejects cycles', () => {
    const plan = buildReplan({ ...context({ bufferMinutes: 0 }), tasks: [task('c', { dependsOnIds: ['b'], priority: 'CRITICAL' }), task('b', { dependsOnIds: ['a'] }), task('a'), task('x', { dependsOnIds: ['y'] }), task('y', { dependsOnIds: ['x'] })] });
    expect(plan.moves.map((move) => move.taskId)).toEqual(['a', 'b', 'c']);
    expect(plan.risks.map((risk) => risk.taskId).sort()).toEqual(['x', 'y']);
  });
});

describe('driving, time zones and timer', () => {
  it('speaks only meaningful, bounded evening facts and tomorrow’s first commitment', () => {
    const tasks = [task('Important completed', { priority: 'HIGH', status: 'COMPLETED', completedAt: at('12:00') }), task('Send proposal', { priority: 'CRITICAL' }), ...Array.from({ length: 40 }, (_, i) => task(`minor ${i}`, { priority: 'LOW' }))];
    const { recommendation } = buildExecutiveRecommendation(context({ tasks, events: [event('First meeting', '09:00', '10:00', '2026-09-08')] }), 'DRIVING_BRIEFING');
    expect(recommendation.spoken).toContain('completed 1 important task');
    expect(recommendation.spoken).toContain('Send proposal');
    expect(recommendation.spoken).toContain('First meeting');
    expect(recommendation.spoken).not.toContain('minor');
    expect(recommendation.spoken.split(/\s+/).length).toBeLessThan(160);
    expect(recommendation.recommendedActions).toEqual([]);
  });
  it('uses the user’s local afternoon, not server time', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ timeZone: 'America/New_York', now: new Date('2026-09-07T15:00:00Z') }), 'FIX_SCHEDULE');
    expect(recommendation.window.startAt).toBe('2026-09-07T16:00:00.000Z');
  });
  it.each([['2026-03-08T08:00:00Z', 180], ['2026-11-01T07:00:00Z', 300]] as const)('respects DST working capacity %s', (instant, minutes) => {
    const { recommendation } = buildExecutiveRecommendation(context({ now: new Date(instant), workingDays: '0', workStart: '00:00', workEnd: '04:00' }), 'FIX_SCHEDULE', { period: 'remaining' });
    expect(recommendation.window.availableMinutes).toBe(minutes - 5); // includes the approval review allowance
  });
  it('keeps the countdown accurate after backgrounding and supports pause', () => {
    const session = { taskId: 't', title: 'Test', remainingSeconds: 2700, endsAt: 1000 + 2700 * 1000 };
    expect(focusSecondsRemaining(session, 61_000)).toBe(2640);
    expect(focusSecondsRemaining(session, 3_000_000)).toBe(0);
    expect(focusSecondsRemaining({ ...session, endsAt: null }, 3_000_000)).toBe(2700);
  });
});

describe('production-readiness regressions', () => {
  it('counts competing unscheduled deadlines tomorrow, not the same hour twice', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ now: at('17:00'), tasks: [task('A', { durationMin: 60, dueAt: at('10:00', '2026-09-08') }), task('B', { durationMin: 60, dueAt: at('10:00', '2026-09-08') })] }), 'FOCUS_TODAY');
    expect(recommendation.risks).toHaveLength(2);
    expect(recommendation.priorities.every((item) => item.slackMinutes === -60)).toBe(true);
  });
  it('does not claim a distant deadline is impossible using only seven days of capacity', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('Long-term work', { durationMin: 3000, dueAt: at('17:00', '2026-10-08') })] }), 'FOCUS_TODAY');
    expect(recommendation.risks).toEqual([]);
    expect(recommendation.priorities[0].slackMinutes).toBeNull();
  });
  it('never proposes a move over the original block of an unplaceable task', () => {
    const plan = buildReplan({ ...context(), strictDeadlines: true, tasks: [task('impossible', { priority: 'CRITICAL', startAt: at('14:00'), durationMin: 60, dueAt: at('12:00') }), task('other', { durationMin: 120 })], events: [event('meeting', '13:00', '14:00')] });
    expect(plan.moves.some((move) => +new Date(move.toStartAt) < +at('15:00') && +new Date(move.toStartAt) + move.durationMin * 60000 > +at('14:00'))).toBe(false);
  });
  it('reports blocked work in the afternoon workload rather than claiming everything fits', () => {
    const { recommendation } = buildExecutiveRecommendation(context({ tasks: [task('Blocked proposal', { durationMin: 90, dueAt: at('16:00'), dependencyBlocked: true })] }), 'FIX_SCHEDULE');
    expect(recommendation.window.requiredMinutes).toBe(90);
    expect(recommendation.risks.some((risk) => risk.title === 'Blocked proposal')).toBe(true);
  });
});
