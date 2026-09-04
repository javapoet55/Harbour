const counters = new Map<string, number>();
const timings: Array<{ name: string; ms: number }> = [];

export function inc(name: string, by = 1) {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function observeMs(name: string, startedAt: number) {
  timings.push({ name, ms: Date.now() - startedAt });
  if (timings.length > 200) timings.shift();
}

export function snapshot() {
  return {
    counters: Object.fromEntries(counters),
    timings: timings.slice(-20),
  };
}
