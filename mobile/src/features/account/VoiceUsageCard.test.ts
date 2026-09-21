import { voiceMinutes, voiceMonthLabel } from './VoiceUsageCard';

describe('voiceMinutes (ProfileView.swift:134-139)', () => {
  it.each([
    [0, '0 min'],
    [1, '<1 min'],
    [59, '<1 min'],
    [60, '1.0 min'],
    [492, '8.2 min'],
    [599, '10.0 min'],
    [600, '10 min'],
    [629, '10 min'],
    [630, '11 min'],
    [5508, '92 min'],
    [6000, '100 min'],
  ])('%i s reads "%s"', (seconds, text) => {
    expect(voiceMinutes(seconds)).toBe(text);
  });
});

describe('voiceMonthLabel (ProfileView.swift:141-144)', () => {
  it('names the month the server sent', () => {
    expect(voiceMonthLabel('2026-09')).toBe('September · updated today');
    expect(voiceMonthLabel('2026-01')).toBe('January · updated today');
    expect(voiceMonthLabel('2026-12')).toBe('December · updated today');
  });

  it('falls back to "This month" with no data or a month it cannot read', () => {
    expect(voiceMonthLabel(undefined)).toBe('This month · updated today');
    expect(voiceMonthLabel('2026-13')).toBe('This month · updated today');
    expect(voiceMonthLabel('September')).toBe('This month · updated today');
  });
});
