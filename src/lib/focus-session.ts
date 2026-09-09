import { z } from 'zod';
export const activeFocusSchema = z.object({ taskId: z.string(), startedAt: z.number().finite(), endsAt: z.number().finite() });
export type FocusSessionState = { taskId: string; title: string; remainingSeconds: number; endsAt: number | null; workSessionId?: string | null; focusToken?: string };
export function focusSecondsRemaining(session: FocusSessionState, now = Date.now()) {
  return session.endsAt === null ? session.remainingSeconds : Math.max(0, Math.ceil((session.endsAt - now) / 1000));
}
