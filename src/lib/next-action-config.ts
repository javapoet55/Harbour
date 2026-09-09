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
