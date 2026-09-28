import type { FoodFacts, FoodQuery } from '@/server/shopping/food/model';
import type { Meal } from './config';

/** One item as extracted by the voice model or typed by the user. */
export type FoodItemInput = {
  meal: Meal;
  description: string;       // the user's own words, e.g. "two rotis with dal"
  foodName: string;          // a plain generic food name for lookup, e.g. "roti"
  quantity?: number;
  unit?: string;
  estimatedGrams?: number;   // the model's portion-weight estimate for non-weight units
  estimatedKcal?: number;    // used only when no database match exists
};

export type CalorieResult = {
  foodName: string;          // the generic lookup name, kept so later corrections look up the same food
  matchedName: string | null; // the database record it matched, for display
  grams: number | null; kcal: number;
  proteinG: number | null; carbsG: number | null; fatG: number | null;
  fiberG: number | null; calciumMg: number | null; ironMg: number | null; vitaminDIu: number | null;
  source: 'USDA' | 'OPEN_FOOD_FACTS' | 'ESTIMATE';
  sourceRef: string | null;
  needsReview: boolean; reviewReason: string | null;
};

export type FoodLookup = (query: FoodQuery) => Promise<FoodFacts | null>;

const GRAMS_PER_UNIT: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gm: 1, gms: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};
// Volume is converted at water density (1 g/ml). This is exact for water-like drinks and flagged otherwise.
const ML_PER_UNIT: Record<string, number> = { ml: 1, milliliter: 1, milliliters: 1, l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000 };

const round1 = (n: number) => Math.round(n * 10) / 10;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const MAX_ITEM_GRAMS = 3000;
export const MAX_ITEM_KCAL = 5000;

/** Portion weight in grams: explicit weight or volume units first, then the model's estimate. */
export function portionGrams(item: Pick<FoodItemInput, 'quantity' | 'unit' | 'estimatedGrams'>): { grams: number | null; fromVolume: boolean } {
  const unit = item.unit?.trim().toLowerCase().replace(/\.$/, '') ?? '';
  const quantity = finite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
  const clamp = (g: number) => (g > 0 && g <= MAX_ITEM_GRAMS ? round1(g) : null);
  if (GRAMS_PER_UNIT[unit]) return { grams: clamp(quantity * GRAMS_PER_UNIT[unit]), fromVolume: false };
  if (ML_PER_UNIT[unit]) return { grams: clamp(quantity * ML_PER_UNIT[unit]), fromVolume: true };
  if (finite(item.estimatedGrams) && item.estimatedGrams > 0) return { grams: clamp(item.estimatedGrams), fromVolume: false };
  return { grams: null, fromVolume: false };
}

/**
 * Calories are computed in code from database values per 100 g/ml, never taken from the voice model,
 * unless no database match exists. Model estimates are stored as ESTIMATE and flagged for review.
 */
export async function calculateCalories(item: FoodItemInput, lookup: FoodLookup): Promise<CalorieResult> {
  const { grams, fromVolume } = portionGrams(item);
  let facts: FoodFacts | null = null;
  try { facts = await lookup({ name: item.foodName }); } catch { facts = null; }
  const n = facts?.nutrition;
  if (facts && n && finite(n.calories) && grams !== null && n.servingAmount > 0) {
    const factor = grams / n.servingAmount;
    const scaled = (v: number | undefined) => (finite(v) ? round1(v * factor) : null);
    const kcal = Math.round(n.calories * factor);
    if (kcal <= MAX_ITEM_KCAL) {
      const volumeMismatch = fromVolume && n.servingUnit === 'g';
      return {
        foodName: item.foodName, matchedName: facts.name, grams, kcal, proteinG: scaled(n.protein), carbsG: scaled(n.carbohydrates), fatG: scaled(n.totalFat),
        fiberG: scaled(n.fiber), calciumMg: scaled(n.calcium), ironMg: scaled(n.iron), vitaminDIu: scaled(n.vitaminD),
        source: facts.source, sourceRef: facts.id,
        needsReview: volumeMismatch, reviewReason: volumeMismatch ? 'volume_converted_at_water_density' : null,
      };
    }
  }
  const estimate = finite(item.estimatedKcal) ? Math.min(Math.round(item.estimatedKcal), MAX_ITEM_KCAL) : 0;
  return {
    foodName: item.foodName, matchedName: null, grams, kcal: estimate, proteinG: null, carbsG: null, fatG: null,
    fiberG: null, calciumMg: null, ironMg: null, vitaminDIu: null,
    source: 'ESTIMATE', sourceRef: null, needsReview: true,
    reviewReason: facts ? (grams === null ? 'portion_unknown' : 'nutrition_unavailable') : 'no_database_match',
  };
}

/**
 * Keeps the phone conversation moving. A nutrition lookup that is already cached answers in a few
 * milliseconds; a first-time food can take one to two seconds at USDA. If the answer is not back within
 * the budget, the item is saved straight away with the model's estimate (reviewReason "lookup_pending")
 * and the database values replace it when the lookup finishes (fast-lookup.ts). The read-back always
 * uses current values.
 */
export const PENDING = 'lookup_pending';

export function lookupBudgetMs() {
  const value = Number(process.env.NUTRITION_LOOKUP_BUDGET_MS ?? 800);
  return Number.isFinite(value) && value >= 50 && value <= 10_000 ? value : 800;
}

export type TimedCalories = { result: CalorieResult; late: Promise<CalorieResult> | null };

export async function caloriesWithinBudget(item: FoodItemInput, lookup: FoodLookup, budgetMs = lookupBudgetMs()): Promise<TimedCalories> {
  const full = calculateCalories(item, lookup);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), budgetMs); });
  const first = await Promise.race([full, timeout]);
  clearTimeout(timer);
  if (first) return { result: first, late: null };
  const estimate = await calculateCalories(item, async () => null); // instant: the model's own estimate
  return { result: { ...estimate, reviewReason: PENDING }, late: full };
}
