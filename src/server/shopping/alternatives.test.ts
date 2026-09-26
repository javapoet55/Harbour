import { afterEach, describe, expect, it, vi } from 'vitest';
import { recommendShoppingAlternatives } from './alternatives';
import { itemInput } from './domain';

describe('shopping alternatives', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('preserves favorites through the existing item save schema', () => {
    const item = { id: '620f5ea6-6bb3-45d6-b07c-f14df7235a88', name: 'Milk', favorite: true, favoriteAlternatives: ['2% Milk|gallon'] };
    expect(itemInput.parse(item)).toMatchObject(item);
    expect(itemInput.parse({ id: item.id, name: item.name }).favorite).toBeUndefined();
  });
  it('does not accept model-generated nutrition or allergen facts', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const alternatives = ['A', 'B', 'C'].map(name => ({ name, category: 'Dairy & Eggs', quantity: '1', size: 'gallon', reason: 'Compare labels', detail: 'Suggested swap', facts: { source: 'invented', calories: 120, freeFrom: ['Nuts'] } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ alternatives, tip: 'Check labels' }) }), { status: 200 })));
    const result = await recommendShoppingAlternatives('user', { name: 'Milk' });
    expect(result.usedAI).toBe(false);
    expect(result.alternatives[0]).not.toHaveProperty('facts');
  });
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
    expect((await recommendShoppingAlternatives('user', { name: 'Bread', category: 'Bakery' })).alternatives).toHaveLength(5);
    vi.unstubAllGlobals();
  });
});
