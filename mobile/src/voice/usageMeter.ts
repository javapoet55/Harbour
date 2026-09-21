import type { VoiceUsage } from '../api/types';
import type { VoicePhase } from './conversation';

/**
 * Real-time voice metering: the `usageSessionID` / `activeVoiceSeconds` / `lastReportedVoiceSeconds`
 * state of `AddTaskByVoiceView` (ios/App/AddTaskByVoiceView.swift:38-40, `:125`, `:128-138`).
 *
 * - Every one-second clock tick, AFTER `voice.tick()`, adds one second if the session is in an
 *   active phase. Connecting, paused, closing and the finished phases are not billed.
 * - Each time the whole seconds reach 15 past the last report, it POSTs the CUMULATIVE total.
 * - `onTelemetry`, which the conversation fires exactly once from `close()`, POSTs the total again.
 * - `recordVoiceUsage` skips a zero duration (NexdoApp.swift:535), so a session that never went live
 *   sends nothing.
 *
 * One session id per meter, reused by every report. The server keeps the larger of each report per
 * `sessionId` (src/server/voice/usage.ts:28), so overlapping or out-of-order requests cannot
 * double-count, and a failed report is covered by the next one. Failures are swallowed, as Swift's
 * `try?` swallows them.
 */

/** The phases `AddTaskByVoiceView.swift:130` counts as active. */
export const ACTIVE_VOICE_PHASES: readonly VoicePhase[] = ['listening', 'userSpeaking', 'processing', 'toolExecution', 'assistantSpeaking'];

/** `completed-lastReportedVoiceSeconds>=15` (AddTaskByVoiceView.swift:133). */
export const VOICE_USAGE_REPORT_SECONDS = 15;

export type VoiceUsageRecorder = (sessionId: string, durationSeconds: number) => Promise<unknown> | void;

export class VoiceUsageMeter {
  readonly sessionId: string;
  private readonly record: VoiceUsageRecorder;
  private active = 0;
  private lastReported = 0;

  constructor(options: { sessionId: string; record: VoiceUsageRecorder }) {
    this.sessionId = options.sessionId;
    this.record = options.record;
  }

  /** Whole seconds spent in an active phase so far. */
  get activeSeconds(): number {
    return this.active;
  }

  /** One clock tick, given the phase the conversation is in after its own `tick()`. */
  tick(phase: VoicePhase): void {
    if (!ACTIVE_VOICE_PHASES.includes(phase)) return;
    this.active += 1;
    if (this.active - this.lastReported >= VOICE_USAGE_REPORT_SECONDS) {
      this.lastReported = this.active;
      this.report();
    }
  }

  /** `voice.onTelemetry` (AddTaskByVoiceView.swift:125): the session ended; report the total. */
  finish(): void {
    this.report();
  }

  private report(): void {
    if (this.active <= 0) return;
    try {
      void Promise.resolve(this.record(this.sessionId, this.active)).catch(() => undefined);
    } catch {
      // A throwing recorder is as silent as a rejecting one.
    }
  }
}

/** `VoiceUsage.progress` (Models.swift:29): used over limit, clamped to 0...1. */
export function voiceUsageProgress(usage: Pick<VoiceUsage, 'usedSeconds' | 'limitMinutes'>): number {
  return Math.min(1, Math.max(0, usage.usedSeconds / Math.max(1, usage.limitMinutes * 60)));
}
