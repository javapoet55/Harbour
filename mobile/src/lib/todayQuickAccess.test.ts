import {
  attentionRowSubtitle,
  commitmentCount,
  commitmentHeadline,
  showsAttentionRow,
  summaryLine,
} from './todayQuickAccess';

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

/** The attention row (RootView.swift:1146-1166). */
describe('the attention row', () => {
  it.each([
    [1, 0, '1 overdue task'],
    [3, 0, '3 overdue tasks'],
    [1, 2, '1 overdue task · 2 other'],
    [0, 1, '1 schedule check'],
    [0, 2, '2 schedule checks'],
  ])('overdue %i, other %i reads "%s"', (overdue, other, expected) => {
    expect(attentionRowSubtitle(overdue, other)).toBe(expected);
  });

  it('shows only when something needs attention', () => {
    expect(showsAttentionRow(0, 0)).toBe(false);
    expect(showsAttentionRow(1, 0)).toBe(true);
    expect(showsAttentionRow(0, 1)).toBe(true);
  });
});
