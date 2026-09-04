import { describe, expect, it } from 'vitest';
import { needsConfirmation, parseIntent } from './intent';

describe('intent parsing', () => {
  it('understands today', () => {
    expect(parseIntent('What do I have today?').intent).toBe('LIST_TODAY');
  });

  it('understands the next three and five days', () => {
    expect(parseIntent('What is coming up during the next three days?')).toMatchObject({ intent: 'LIST_NEXT_N_DAYS', days: 3 });
    expect(parseIntent('Show me everything important during the next five days.')).toMatchObject({ intent: 'LIST_NEXT_N_DAYS', days: 5 });
  });

  it('extracts a voice-created reminder', () => {
    const parsed = parseIntent('Remind me to call the dentist tomorrow at 9 AM.');
    expect(parsed.intent).toBe('CREATE_TASK');
    expect(parsed.title?.toLowerCase()).toContain('dentist');
    expect(parsed.whenText).toBe('tomorrow');
    expect(parsed.timeText).toBe('09:00');
    expect(parsed.confirmationRequired).toBe(true);
  });

  it('classifies planning, overdue, and completion', () => {
    expect(parseIntent('Can I finish everything tomorrow?').intent).toBe('PLAN_TOMORROW');
    expect(parseIntent('Do I have any overdue tasks?').intent).toBe('LIST_OVERDUE');
    expect(parseIntent('Mark the plumbing payment task as complete').intent).toBe('COMPLETE_TASK');
  });

  it('requires confirmation for deletions under the default setting', () => {
    const parsed = parseIntent('Cancel my reminder for the dentist appointment.');
    expect(needsConfirmation(parsed, 'CHANGES_AND_DELETES')).toBe(true);
  });
});
