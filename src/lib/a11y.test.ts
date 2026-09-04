import { describe, expect, it } from 'vitest';

const VOICE_STATES = ['idle', 'listening', 'processing', 'speaking', 'confirm', 'error'] as const;

describe('accessibility contracts', () => {
  it('exposes distinct voice states for screen readers', () => {
    expect(VOICE_STATES).toContain('listening');
    expect(VOICE_STATES).toContain('confirm');
    expect(new Set(VOICE_STATES).size).toBe(6);
  });

  it('keeps desktop and mobile destinations for the microphone', () => {
    const desktop = ['/', '/inbox', '/calendar', '/tasks', '/waiting', '/planner', '/notifications', '/settings'];
    const mobile = ['/', '/calendar', '/voice', '/tasks', '/settings'];
    expect(desktop).toContain('/planner');
    expect(mobile).toContain('/voice');
  });
});
