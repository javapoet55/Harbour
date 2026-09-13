/** Product policy, kept outside ranking arithmetic. All factors are on a 0–100 scale. */
export const NEXT_ACTION_POLICY = {
  weights: { importance: .30, urgency: .20, deadlineRisk: .20, windowFit: .15, dependencyImpact: .10, context: .05 },
  switchingThreshold: 10,
  setupMinutes: 5,
  investedPenaltyCap: 10,
  projectSwitchPenalty: 5,
  cooldownMinutes: 30,
  repeatSuppressionMinutes: 480,
  minimumProactiveWindow: 15,
} as const;
export type NextActionWeights = { [K in keyof typeof NEXT_ACTION_POLICY.weights]: number };

/** Completing or cancelling the previous choice must not delay the next useful suggestion. */
export function suppressNextAction(state: { taskId?: string; score?: number; shownAt?: number; dismissed?: boolean }, best: { taskId: string; score: number }, previousStillActionable: boolean, now: number) {
  const elapsed = now - (state.shownAt ?? 0);
  return (state.dismissed && previousStillActionable && elapsed < NEXT_ACTION_POLICY.cooldownMinutes * 60000)
    || (state.taskId === best.taskId && best.score < (state.score ?? 0) + 20 && elapsed < NEXT_ACTION_POLICY.repeatSuppressionMinutes * 60000);
}
