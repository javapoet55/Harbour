import { describe, expect, it } from 'vitest';
import { parseIntent } from './intent';
import { rangeForNextNDays } from './time';

describe('core journeys', () => {
  it('journey 1: ask about today', () => {
    expect(parseIntent('What do I have today?').intent).toBe('LIST_TODAY');
  });

  it('journey 2: next three days uses the user time zone', () => {
    expect(parseIntent('What is coming up during the next three days?').days).toBe(3);
    expect(rangeForNextNDays(3, 'America/Los_Angeles', new Date('2026-09-04T20:00:00Z')).days).toHaveLength(3);
  });

  it('journey 3: next five days important work', () => {
    expect(parseIntent('Show me everything important during the next five days.').days).toBe(5);
  });

  it('journey 4: voice-created dentist reminder', () => {
    const parsed = parseIntent('Remind me to call the dentist tomorrow at 9 AM.');
    expect(parsed.intent).toBe('CREATE_TASK');
    expect(parsed.confirmationRequired).toBe(true);
  });

  it('journey 7: planning question does not write by itself', () => {
    const parsed = parseIntent('Can I finish everything tomorrow?');
    expect(parsed.intent).toBe('PLAN_TOMORROW');
    expect(parsed.confirmationRequired).toBe(false);
  });
});
