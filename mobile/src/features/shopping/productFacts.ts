import type { GroceryItem, GroceryList, ShoppingAlternative } from '../../api/shopping';
import { alternativeItem } from './model';

/**
 * Port of ios/Sources/NexdoCore/ShoppingProductFacts.swift: the product facts a structured source
 * supplies ("never by the recommendation LLM"), the nutrition comparison, the shopping goals, and
 * `ShoppingSwap`. Everything here refuses to claim what the source did not state: no facts, no
 * comparison; no source, no allergen or price label.
 */

/** `ShoppingNutrition`. kcal, grams for macros, mg for sodium and calcium. `servingUnit` is g or ml. */
export type ShoppingNutrition = {
  servingSize: string;
  servingAmount?: number | null;
  servingUnit?: string | null;
  calories?: number | null;
  protein?: number | null;
  totalFat?: number | null;
  saturatedFat?: number | null;
  carbohydrates?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  calcium?: number | null;
  fiber?: number | null;
};

/** `ShoppingProductFacts`. */
export type ShoppingProductFacts = {
  source: string;
  sourceURL?: string | null;
  lastUpdated?: string | null;
  name?: string | null;
  brand?: string | null;
  barcode?: string | null;
  imageURL?: string | null;
  matchQuality?: string | null;
  retrievedAt?: string | null;
  expiresAt?: string | null;
  freshness?: string | null;
  ingredientText?: string | null;
  mayContain?: string[] | null;
  allergenStatus?: string | null;
  nutrition?: ShoppingNutrition | null;
  contains?: string[] | null;
  freeFrom?: string[] | null;
  dietary?: string[] | null;
  bestFor?: string[] | null;
  price?: number | null;
  currency?: string | null;
  pricePackage?: string | null;
};

/** `hasSource`. */
export function hasSource(facts: Pick<ShoppingProductFacts, 'source'> | null | undefined): boolean {
  return (facts?.source ?? '').trim().length > 0;
}

/** `matchLabel`. */
export function matchLabel(facts: Pick<ShoppingProductFacts, 'matchQuality'>): string | null {
  switch (facts.matchQuality) {
    case 'representative_generic':
      return 'Representative food — not an exact product';
    case 'exact_barcode':
      return 'Exact barcode match';
    case 'branded_match':
      return 'Branded product match';
    default:
      return null;
  }
}

/** `allergenLabels`: only what the source declares; absence is never inferred. */
export function allergenLabels(facts: ShoppingProductFacts): string[] {
  if (!hasSource(facts)) return [];
  return [...(facts.contains ?? []).map((value) => `Contains ${value}`), ...(facts.freeFrom ?? []).map((value) => `${value}-free`)];
}

/**
 * `priceLabel`: "Approx. " and the price in its own currency. `locale` stands in for Swift's
 * `.formatted(.currency(code:))`, which uses the device locale.
 */
export function priceLabel(facts: ShoppingProductFacts | null | undefined, locale?: string): string | null {
  if (!facts || !hasSource(facts)) return null;
  const { price, currency } = facts;
  if (price == null || !Number.isFinite(price) || price < 0 || !currency || currency.length !== 3) return null;
  try {
    return `Approx. ${new Intl.NumberFormat(locale, { style: 'currency', currency }).format(price)}`;
  } catch {
    return null;
  }
}

/** `ShoppingNutrient`, in `allCases` order; the value is the row's title. */
export const SHOPPING_NUTRIENTS = ['Calories', 'Protein', 'Total Fat', 'Saturated Fat', 'Carbohydrates', 'Sugar', 'Sodium', 'Calcium', 'Fiber'] as const;
export type ShoppingNutrient = (typeof SHOPPING_NUTRIENTS)[number];

const NUTRIENT_KEY: Record<ShoppingNutrient, keyof ShoppingNutrition> = {
  Calories: 'calories',
  Protein: 'protein',
  'Total Fat': 'totalFat',
  'Saturated Fat': 'saturatedFat',
  Carbohydrates: 'carbohydrates',
  Sugar: 'sugar',
  Sodium: 'sodium',
  Calcium: 'calcium',
  Fiber: 'fiber',
};

/** `ShoppingNutrient.unit`. */
export function nutrientUnit(nutrient: ShoppingNutrient): string {
  if (nutrient === 'Calories') return '';
  return nutrient === 'Sodium' || nutrient === 'Calcium' ? 'mg' : 'g';
}

/** `ShoppingNutrient.value(_:)`: finite and not negative, else unknown. */
export function nutrientValue(nutrient: ShoppingNutrient, facts: ShoppingNutrition | null | undefined): number | null {
  const value = facts?.[NUTRIENT_KEY[nutrient]];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export type ShoppingDifference = { kind: 'lower'; amount: number } | { kind: 'same' } | { kind: 'higher'; amount: number } | { kind: 'unknown' };

/** `ShoppingComparison`: the two nutrition panels, each only when its facts have a source. */
export type ShoppingComparison = { original: ShoppingNutrition | null; alternative: ShoppingNutrition | null };

export function comparison(original: ShoppingProductFacts | null | undefined, alternative: ShoppingProductFacts | null | undefined): ShoppingComparison {
  return {
    original: hasSource(original) ? (original?.nutrition ?? null) : null,
    alternative: hasSource(alternative) ? (alternative?.nutrition ?? null) : null,
  };
}

/** `factor`: scales the alternative to the original's serving, only for the same g or ml unit. */
export function comparisonFactor({ original, alternative }: ShoppingComparison): number | null {
  const a = original?.servingAmount;
  const b = alternative?.servingAmount;
  const unit = original?.servingUnit;
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  if (!unit || !['g', 'ml'].includes(unit) || unit !== alternative?.servingUnit) return null;
  const ratio = a / b;
  return Number.isFinite(ratio) ? ratio : null;
}

/** `alternativeValue(_:)`. */
export function alternativeValue(value: ShoppingComparison, nutrient: ShoppingNutrient): number | null {
  const factor = comparisonFactor(value);
  const raw = nutrientValue(nutrient, value.alternative);
  if (factor === null || raw === null) return null;
  const normalized = raw * factor;
  return Number.isFinite(normalized) ? normalized : null;
}

/** `difference(_:)`. */
export function difference(value: ShoppingComparison, nutrient: ShoppingNutrient): ShoppingDifference {
  const a = nutrientValue(nutrient, value.original);
  const b = alternativeValue(value, nutrient);
  if (a === null || b === null) return { kind: 'unknown' };
  const delta = b - a;
  // Android ahead of iOS: Swift counts any change over 0.0001, so a fraction of a gram showed as "↑ 0 g" and
  // earned "Higher protein". A change that rounds to 0 in the table (whole units) is the same.
  if (Math.round(Math.abs(delta)) === 0) return { kind: 'same' };
  return delta < 0 ? { kind: 'lower', amount: -delta } : { kind: 'higher', amount: delta };
}

/** `ShoppingGoal`, in `allCases` order. */
export const SHOPPING_GOALS = [
  'Lower fat',
  'Lower sugar',
  'Lower calorie',
  'Higher protein',
  'Lactose-free',
  'Plant-based',
  'Lower price',
  'Gluten-free',
  'High fiber',
  'Low sodium',
  'No artificial ingredients',
] as const;
export type ShoppingGoal = (typeof SHOPPING_GOALS)[number];

function is(kind: ShoppingDifference['kind'], value: ShoppingComparison, nutrient: ShoppingNutrient): boolean {
  return difference(value, nutrient).kind === kind;
}

function hasDiet(item: ShoppingAlternative, diet: string): boolean {
  return hasSource(item.facts) && (item.facts?.dietary ?? []).includes(diet);
}

/** `ShoppingGoal.supported(by:original:)`: only when the source data shows it. */
export function goalSupported(goal: ShoppingGoal, item: ShoppingAlternative, original: ShoppingProductFacts | null | undefined): boolean {
  const value = comparison(original, item.facts);
  switch (goal) {
    case 'Lower fat':
      return is('lower', value, 'Total Fat');
    case 'Lower sugar':
      return is('lower', value, 'Sugar');
    case 'Lower calorie':
      return is('lower', value, 'Calories');
    case 'Higher protein':
      return is('higher', value, 'Protein');
    case 'High fiber':
      return is('higher', value, 'Fiber');
    case 'Low sodium':
      return is('lower', value, 'Sodium');
    case 'Lactose-free':
    case 'Plant-based':
    case 'Gluten-free':
    case 'No artificial ingredients':
      return hasDiet(item, goal);
    case 'Lower price': {
      const a = original;
      const b = item.facts;
      if (!a || !b || !hasSource(a) || !hasSource(b) || priceLabel(a) === null || priceLabel(b) === null) return false;
      if (a.currency !== b.currency || !a.pricePackage || a.pricePackage !== b.pricePackage) return false;
      return a.price != null && b.price != null && b.price < a.price;
    }
  }
}

/** `ranked(_:original:)`: the supported alternatives first, each group in its original order. */
export function rankedForGoal(goal: ShoppingGoal, items: ShoppingAlternative[], original: ShoppingProductFacts | null | undefined): ShoppingAlternative[] {
  return [...items.filter((item) => goalSupported(goal, item, original)), ...items.filter((item) => !goalSupported(goal, item, original))];
}

/** `ShoppingAlternative.explanation(comparedTo:)`. */
export function explanation(item: ShoppingAlternative, original: ShoppingProductFacts | null | undefined): string {
  const matches = SHOPPING_GOALS.filter((goal) => goalSupported(goal, item, original));
  return matches.length === 0
    ? 'A suggested swap for your list. Compare the package label, ingredients, size and price before choosing.'
    : `Available product data supports: ${matches.join(', ').toLowerCase()}. Compare taste and suitability for your intended use.`;
}

/** `ShoppingAlternative.usages`: the source's own list, else general culinary uses for milk only. */
export function usages(item: ShoppingAlternative): string[] {
  if (hasSource(item.facts) && item.facts?.bestFor) return item.facts.bestFor;
  // General culinary uses only; never infers allergens, nutritional values or dietary safety.
  if (item.name.toLowerCase().includes('milk')) return ['Cereal', 'Coffee', 'Cooking', 'Smoothies'];
  return [];
}

/**
 * `ShoppingSwap.replacing(_:with:in:)`: the original keeps its slot, id, quantity, size, notes, checked
 * state and favourites; only the name, category, brand and barcode change, and the photo is dropped
 * ("The original item's photo must not misrepresent the replacement"). `null` when the item is gone.
 */
export function swapReplacing(originalId: string, alternative: ShoppingAlternative, list: GroceryList): GroceryList | null {
  const index = list.items.findIndex((item) => item.id === originalId);
  if (index === -1) return null;
  const items = [...list.items];
  items[index] = {
    ...items[index],
    name: alternative.name,
    category: alternative.category,
    barcode: alternative.facts?.barcode ?? null,
    brand: alternative.facts?.brand ?? null,
    imageData: null,
  };
  return { ...list, items };
}

/**
 * `ShoppingSwap.adding(_:to:)`: appended as a new item (with the source's brand and barcode), unless an
 * item of the same name and size is already there — then `null`.
 */
export function swapAdding(alternative: ShoppingAlternative, list: GroceryList, id: string): GroceryList | null {
  const name = alternative.name.trim().toLowerCase();
  const size = alternative.size.toLowerCase();
  if (list.items.some((item) => item.name.trim().toLowerCase() === name && item.size.toLowerCase() === size)) return null;
  const added: GroceryItem = { ...alternativeItem(alternative, id), brand: alternative.facts?.brand ?? null, barcode: alternative.facts?.barcode ?? null };
  return { ...list, items: [...list.items, added] };
}

/** `ShoppingNutritionSortColumn`. */
export type ShoppingNutritionSortColumn = 'Your item' | 'Alternative' | 'Difference';

/**
 * `sortedNutrients(by:ascending:)`: the rows either side knows, sorted on whole numbers; unknown values
 * sink to the end and ties keep the `allCases` order.
 */
export function sortedNutrients(value: ShoppingComparison, column: ShoppingNutritionSortColumn | null, ascending: boolean): ShoppingNutrient[] {
  const rows = SHOPPING_NUTRIENTS.filter((nutrient) => nutrientValue(nutrient, value.original) !== null || nutrientValue(nutrient, value.alternative) !== null);
  if (column === null) return rows;
  const round = (n: number) => Math.sign(n) * Math.round(Math.abs(n));
  const number = (nutrient: ShoppingNutrient): number | null => {
    if (column === 'Your item') {
      const a = nutrientValue(nutrient, value.original);
      return a === null ? null : round(a);
    }
    if (column === 'Alternative') {
      const b = alternativeValue(value, nutrient);
      return b === null ? null : round(b);
    }
    const a = nutrientValue(nutrient, value.original);
    const b = alternativeValue(value, nutrient);
    return a === null || b === null ? null : round(b - a);
  };
  return rows
    .map((nutrient, offset) => ({ nutrient, offset, key: number(nutrient) }))
    .sort((left, right) => {
      if (left.key === right.key) return left.offset - right.offset;
      if (left.key === null) return 1;
      if (right.key === null) return -1;
      return ascending ? left.key - right.key : right.key - left.key;
    })
    .map((row) => row.nutrient);
}
