import { expect, it } from 'vitest';
import { voiceClock } from './time-context';
import { voiceSessionConfiguration, calendarVoiceSessionConfiguration } from './configuration';
import { zonedDateTime } from '@/lib/time';

it('keeps 6 AM ahead of 5:32 AM in Los Angeles despite a UTC server clock', () => {
  const now = new Date('2026-09-14T12:32:00Z');
  expect(voiceClock('America/Los_Angeles', now).localDateTime).toBe('2026-09-14T05:32:00-07:00');
  const six = zonedDateTime('2026-09-14', '06:00', 'America/Los_Angeles');
  expect(six.toISOString()).toBe('2026-09-14T13:00:00.000Z');
  expect((+six - +now) / 60000).toBe(28);
  for (const make of [voiceSessionConfiguration, calendarVoiceSessionConfiguration]) {
    const session = make('America/Los_Angeles', now);
    expect(session.instructions).toContain('2026-09-14T05:32:00-07:00');
    expect(session.instructions).toContain('6 AM is 06:00, never 18:00');
    expect(session.tools.some(t => t.name === 'get_current_time')).toBe(true);
  }
});
it('uses winter PST and preserves the local day near UTC midnight', () => {
  expect(voiceClock('America/Los_Angeles', new Date('2026-12-14T13:32:00Z')).localDateTime).toBe('2026-12-14T05:32:00-08:00');
  expect(voiceClock('America/Los_Angeles', new Date('2026-09-15T02:00:00Z')).localDateTime).toBe('2026-09-14T19:00:00-07:00');
});
it('follows another device location timezone without hardcoding Pacific', () => {
  expect(voiceClock('Asia/Kolkata', new Date('2026-09-14T12:32:00Z')).localDateTime).toBe('2026-09-14T18:02:00+05:30');
});
