import { describe, expect, it } from 'vitest';
import { normalizeOFF, normalizeUSDA } from '@/server/shopping/food/providers';
import { chooseInsight } from './insights';
import { mondayOf } from './log';

type E = Parameters<typeof chooseInsight>[1][number];
const entry = (localDate: string, meal: string, kcal: number, n: Partial<E> = {}): E =>
  ({ localDate, meal, kcal, proteinG: 20, fiberG: 8, calciumMg: 400, ironMg: 6, vitaminDIu: 300, ...n });
const days = ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];

describe('daily insight', () => {
  it('asks for more data until three days are logged', () => {
    const i = chooseInsight('2026-09-28', [entry('2026-09-27', 'LUNCH', 600), entry('2026-09-28', 'LUNCH', 600)], {}, new Set());
    expect(i).toMatchObject({ kind: 'NEED_DATA', text: 'Log 1 more day this week to unlock your daily insight.', items: [] });
    expect(chooseInsight('2026-09-28', [], {}, new Set())).toBeNull();
  });
  it('finds a protein pattern tied to skipped breakfasts and suggests only foods not already on the list', () => {
    const log = days.flatMap((d, i) => i < 4
      ? [entry(d, 'LUNCH', 700, { proteinG: 25 }), entry(d, 'DINNER', 800, { proteinG: 30 })]            // 55 g, no breakfast
      : [entry(d, 'BREAKFAST', 400, { proteinG: 40 }), entry(d, 'DINNER', 900, { proteinG: 80 })]);     // 120 g
    const i = chooseInsight('2026-09-28', log, { Protein: 150, Fiber: 20, Calcium: 500, Iron: 10, 'Vitamin D': 400 }, new Set(['eggs']));
    expect(i).toMatchObject({ kind: 'GAP', nutrient: 'protein', key: '2026-09-28:protein', items: ['Greek yogurt', 'Lentils'] });
    expect(i?.text).toBe('Protein was under 90 g on 4 of your last 7 logged days, mostly on days without breakfast. Add Greek yogurt and Lentils to your shopping list?');
  });
  it('never treats missing nutrient data as a shortfall', () => {
    const log = days.map(d => entry(d, 'LUNCH', 900, { fiberG: null, proteinG: 150, calciumMg: 1000, ironMg: 18, vitaminDIu: 800 }));  // fiber unknown everywhere
    expect(chooseInsight('2026-09-28', log, { Protein: 150 }, new Set())).toMatchObject({ kind: 'STREAK' });
  });
  it('only ever suggests adding foods: calorie totals above the goal never produce an insight', () => {
    const log = days.map(d => entry(d, 'DINNER', 4000, { proteinG: 200, fiberG: 40, calciumMg: 1500, ironMg: 20, vitaminDIu: 900 }));
    const i = chooseInsight('2026-09-28', log, {}, new Set());
    expect(i).toMatchObject({ kind: 'STREAK', text: 'You’ve logged 7 days in a row and stayed close to your nutrient goals.' });
  });
});

describe('weeks and nutrients', () => {
  it('finds Monday for any day of the week', () => {
    expect(['2026-09-21', '2026-09-24', '2026-09-27'].map(mondayOf)).toEqual(['2026-09-21', '2026-09-21', '2026-09-21']);
    expect(mondayOf('2026-09-28')).toBe('2026-09-28');
  });
  it('reads iron and vitamin D from USDA (IU or µg) and Open Food Facts (grams per 100 g)', () => {
    const usda = normalizeUSDA({ fdcId: 1, description: 'Salmon', foodNutrients: [
      { amount: 0.8, nutrient: { id: 1089, unitName: 'MG' } }, { amount: 11, nutrient: { id: 1114, unitName: 'µg' } }, { amount: 12, nutrient: { id: 1079, unitName: 'G' } },
    ] }, 'representative_generic');
    expect(usda?.nutrition).toMatchObject({ iron: 0.8, vitaminD: 440, fiber: 12 });
    const off = normalizeOFF({ code: '3017620422003', product_name: 'Cereal', nutrition_data_per: '100g', nutriments: { 'iron_100g': 0.012, 'vitamin-d_100g': 0.0000025, 'energy-kcal_100g': 380 } }, 'exact_barcode');
    expect(off?.nutrition?.iron).toBeCloseTo(12);
    expect(off?.nutrition?.vitaminD).toBeCloseTo(100);
  });
});
