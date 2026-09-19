import { afterEach, describe, expect, it, vi } from 'vitest';
import { recommendShoppingAlternatives } from './alternatives';

describe('shopping alternatives', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('returns useful local alternatives when AI is unavailable', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const result = await recommendShoppingAlternatives('user', { name: 'Chicken breast', category: 'Meat & Seafood', quantity: '1', size: 'lb' });
    expect(result.usedAI).toBe(false);
    expect(result.alternatives).toHaveLength(5);
    expect(result.alternatives.map(item => item.name)).toContain('Turkey breast');
  });
  it('does not fail the feature when the AI request fails', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await recommendShoppingAlternatives('user', { name: 'Bread', category: 'Bakery' })).alternatives).toHaveLength(3);
    vi.unstubAllGlobals();
  });
});
