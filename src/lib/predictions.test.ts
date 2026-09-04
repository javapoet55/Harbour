import { describe, expect, it } from 'vitest';
import { completionProbability, confidence, median, smoothedRate, timeBucket } from './predictions';

describe('interpretable prediction helpers', () => {
  it('uses a robust median for duration and capacity estimates', () => {
    expect(median([30, 45, 52, 55, 300])).toBe(52);
    expect(median([30, 50])).toBe(40);
  });

  it('smooths sparse rates and reports sample confidence', () => {
    expect(smoothedRate(0, 1)).toBeGreaterThan(0);
    expect(confidence(4)).toBe('low');
    expect(confidence(12)).toBe('medium');
    expect(confidence(30)).toBe('high');
  });

  it('reduces completion probability after repeated postponements', () => {
    const base = { overall: { successes: 8, samples: 10 }, priority: { successes: 4, samples: 5 }, timeBucket: { successes: 3, samples: 4 } };
    expect(completionProbability({ ...base, postponements: 3 })).toBeLessThan(completionProbability({ ...base, postponements: 0 }));
  });

  it('creates explainable time buckets', () => {
    expect(timeBucket(9)).toBe('morning');
    expect(timeBucket(17)).toBe('after 4 PM');
  });
});
