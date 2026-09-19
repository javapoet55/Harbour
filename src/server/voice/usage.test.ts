import { describe, expect, it } from 'vitest';
import { normalizeVoiceSeconds, voiceUsageMonth } from './usage';

describe('voice usage accounting', () => {
  it('uses the account month at timezone boundaries', () => {
    const instant = new Date('2026-10-01T01:30:00Z');
    expect(voiceUsageMonth('America/Los_Angeles', instant)).toBe('2026-09');
    expect(voiceUsageMonth('Asia/Kolkata', instant)).toBe('2026-10');
  });
  it('rounds seconds and rejects invalid or excessive session durations', () => {
    expect(normalizeVoiceSeconds(72.6)).toBe(73);
    expect(normalizeVoiceSeconds(-10)).toBe(0);
    expect(normalizeVoiceSeconds('bad')).toBe(0);
    expect(normalizeVoiceSeconds(99_999)).toBe(14_400);
  });
});
