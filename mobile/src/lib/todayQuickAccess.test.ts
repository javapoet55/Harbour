import { attentionDescription, commitmentCount, commitmentHeadline, summaryLine } from './todayQuickAccess';

/** `TodayIntelligenceCard` summary (RootView.swift:1403-1413, e0a7bcd). */
describe('the "Your day, in focus" summary', () => {
  it('composes "X Tasks · Y Appointments · Z Moments", singularising each', () => {
    expect(summaryLine(0, 0, 0)).toBe('0 Tasks · 0 Appointments · 0 Moments');
    expect(summaryLine(1, 1, 1)).toBe('1 Task · 1 Appointment · 1 Moment');
    expect(summaryLine(3, 2, 4)).toBe('3 Tasks · 2 Appointments · 4 Moments');
  });

  it('counts moments into the commitment total', () => {
    expect(commitmentCount(2, 1, 3)).toBe(6);
    expect(commitmentHeadline(commitmentCount(0, 1, 0), true)).toBe('1 commitment today');
    expect(commitmentHeadline(commitmentCount(2, 1, 3), false)).toBe('6 commitments ahead');
  });
});

/** The attention card's line (RootView.swift:1517-1522, Phase 13). */
describe('the attention card', () => {
  it.each([
    [1, 0, '1 overdue task'],
    [3, 0, '3 overdue tasks'],
    [1, 2, '1 overdue task · 2 schedule checks'],
    [3, 1, '3 overdue tasks · 1 schedule check'],
    [0, 1, '1 schedule check'],
    [0, 0, ''],
  ])('overdue %i, checks %i reads "%s"', (overdue, other, expected) => {
    expect(attentionDescription(overdue, other)).toBe(expected);
  });
});
