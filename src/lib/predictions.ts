export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function smoothedRate(successes: number, samples: number, prior = 0.7, priorWeight = 4) {
  return (successes + prior * priorWeight) / (samples + priorWeight);
}

export function confidence(samples: number) {
  if (samples >= 30) return 'high' as const;
  if (samples >= 10) return 'medium' as const;
  return 'low' as const;
}

export function completionProbability(input: {
  overall: { successes: number; samples: number };
  priority?: { successes: number; samples: number };
  timeBucket?: { successes: number; samples: number };
  postponements: number;
}) {
  const groups = [input.overall, input.priority, input.timeBucket].filter((group): group is { successes: number; samples: number } => Boolean(group?.samples));
  const weighted = groups.reduce((sum, group) => sum + smoothedRate(group.successes, group.samples) * Math.min(group.samples, 20), 0);
  const weight = groups.reduce((sum, group) => sum + Math.min(group.samples, 20), 0);
  const base = weight ? weighted / weight : 0.7;
  return Math.max(0.05, Math.min(0.98, base * 0.88 ** input.postponements));
}

export function localHour(date: Date, timeZone: string) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date));
}

export function timeBucket(hour: number) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 20) return 'after 4 PM';
  return 'outside core hours';
}
