import type { VoicePhase } from './conversation';
import { ACTIVE_VOICE_PHASES, VoiceUsageMeter, voiceUsageProgress } from './usageMeter';

/** Mirrors `AddTaskByVoiceView`'s clock handler and `onTelemetry` (ios/App/AddTaskByVoiceView.swift:125-138). */
function meter() {
  const record = jest.fn<Promise<unknown> | void, [string, number]>(async () => undefined);
  return { record, meter: new VoiceUsageMeter({ sessionId: 'S1', record }) };
}

function ticks(target: VoiceUsageMeter, phase: VoicePhase, count: number) {
  for (let index = 0; index < count; index += 1) target.tick(phase);
}

describe('VoiceUsageMeter', () => {
  it('counts only Swift’s active phases', () => {
    expect(ACTIVE_VOICE_PHASES).toEqual(['listening', 'userSpeaking', 'processing', 'toolExecution', 'assistantSpeaking']);
    const h = meter();
    for (const phase of ['idle', 'connecting', 'closing', 'disconnected', 'connectionLost'] as VoicePhase[]) ticks(h.meter, phase, 3);
    expect(h.meter.activeSeconds).toBe(0);
    for (const phase of ACTIVE_VOICE_PHASES) h.meter.tick(phase);
    expect(h.meter.activeSeconds).toBe(5);
  });

  it('reports the cumulative total every 15 active seconds, under one session id', () => {
    const h = meter();
    ticks(h.meter, 'listening', 14);
    expect(h.record).not.toHaveBeenCalled();
    h.meter.tick('assistantSpeaking');
    expect(h.record).toHaveBeenLastCalledWith('S1', 15);
    ticks(h.meter, 'closing', 20);
    ticks(h.meter, 'userSpeaking', 14);
    expect(h.record).toHaveBeenCalledTimes(1);
    h.meter.tick('processing');
    expect(h.record).toHaveBeenLastCalledWith('S1', 30);
    expect(h.record).toHaveBeenCalledTimes(2);
  });

  it('reports the total again when the session ends (onTelemetry)', () => {
    const h = meter();
    ticks(h.meter, 'listening', 22);
    h.meter.finish();
    expect(h.record.mock.calls).toEqual([
      ['S1', 15],
      ['S1', 22],
    ]);
  });

  it('sends nothing for a session that never went live', () => {
    const h = meter();
    ticks(h.meter, 'connecting', 30);
    h.meter.finish();
    expect(h.record).not.toHaveBeenCalled();
  });

  it('swallows a failed report and keeps counting', async () => {
    const record = jest.fn(async () => {
      throw new Error('offline');
    });
    const target = new VoiceUsageMeter({ sessionId: 'S1', record });
    ticks(target, 'listening', 15);
    await Promise.resolve();
    ticks(target, 'listening', 15);
    expect(record.mock.calls).toEqual([
      ['S1', 15],
      ['S1', 30],
    ]);
    const throwing = new VoiceUsageMeter({
      sessionId: 'S2',
      record: () => {
        throw new Error('sync');
      },
    });
    ticks(throwing, 'listening', 15);
    expect(() => throwing.finish()).not.toThrow();
  });
});

describe('voiceUsageProgress', () => {
  it('is used over the limit, clamped to 0...1 (Models.swift:29)', () => {
    expect(voiceUsageProgress({ usedSeconds: 1500, limitMinutes: 100 })).toBe(0.25);
    expect(voiceUsageProgress({ usedSeconds: 9000, limitMinutes: 100 })).toBe(1);
    expect(voiceUsageProgress({ usedSeconds: -5, limitMinutes: 100 })).toBe(0);
    expect(voiceUsageProgress({ usedSeconds: 30, limitMinutes: 0 })).toBe(1);
  });
});
