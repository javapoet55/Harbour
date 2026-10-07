import type { GroceryItem, GroceryList, ShoppingAlternative } from '../../../api/shopping';
import { listInput, newItem } from '../model';
import {
  allergenLabels,
  comparison,
  difference,
  explanation,
  goalSupported,
  isOriginalItem,
  matchLabel,
  nutrientValue,
  priceLabel,
  rankedForGoal,
  sortedNutrients,
  swapAdding,
  swapReplacing,
  usages,
  type ShoppingGoal,
  type ShoppingProductFacts,
} from '../productFacts';

/** Port of ios/Tests/NexdoCoreTests/ShoppingAlternativeTests.swift and ShoppingNutritionSortTests.swift. */

function facts({ calories = 150, fat = 8, protein = 8, amount = 240, unit = 'ml' }: { calories?: number | null; fat?: number | null; protein?: number | null; amount?: number; unit?: string } = {}): ShoppingProductFacts {
  return {
    source: 'Test fixture only',
    nutrition: { servingSize: 'Test serving', servingAmount: amount, servingUnit: unit, calories, protein, totalFat: fat, saturatedFat: 5, sugar: 12 },
  };
}

function alternative(metadata: ShoppingProductFacts | null = null): ShoppingAlternative {
  return { name: '2% Milk', category: 'Dairy & Eggs', quantity: '1', size: '1 gallon', reason: 'Suggestion', detail: 'Compare labels', facts: metadata };
}

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return { ...newItem('item-1'), name: 'Milk', ...overrides };
}

function list(items: GroceryItem[], overrides: Partial<GroceryList> = {}): GroceryList {
  return { id: 'list', title: 'Store list', date: '2026-09-25', timeZone: 'UTC', weekly: true, revision: 4, items, ...overrides };
}

test('nutrition compares lower, higher, same and unknown', () => {
  const value = comparison(facts(), facts({ calories: 120, fat: 5, protein: 9 }));
  expect(difference(value, 'Calories')).toEqual({ kind: 'lower', amount: 30 });
  expect(difference(value, 'Total Fat')).toEqual({ kind: 'lower', amount: 3 });
  expect(difference(value, 'Protein')).toEqual({ kind: 'higher', amount: 1 });
  expect(difference(value, 'Sugar')).toEqual({ kind: 'same' });
  expect(difference(value, 'Calcium')).toEqual({ kind: 'unknown' });
  expect(difference(comparison(null, facts()), 'Total Fat')).toEqual({ kind: 'unknown' });
  // A change that the table would show as "↑ 0 g" is the same, and earns no goal.
  expect(difference(comparison(facts({ protein: 8 }), facts({ protein: 8.3 })), 'Protein')).toEqual({ kind: 'same' });
  expect(goalSupported('Higher protein', alternative(facts({ protein: 8.3 })), facts({ protein: 8 }))).toBe(false);
  expect(difference(comparison(facts({ protein: 8 }), facts({ protein: 8.6 })), 'Protein')).toEqual({ kind: 'higher', amount: expect.closeTo(0.6) });
});

test('nutrition normalises only compatible servings', () => {
  expect(difference(comparison(facts(), facts({ calories: 75, fat: 4, protein: 4, amount: 120 })), 'Total Fat')).toEqual({ kind: 'same' });
  expect(difference(comparison(facts(), facts({ unit: 'g' })), 'Total Fat')).toEqual({ kind: 'unknown' });
  expect(difference(comparison(facts(), facts({ amount: 0 })), 'Total Fat')).toEqual({ kind: 'unknown' });
  expect(difference(comparison(facts(), { ...facts(), source: '' }), 'Calories')).toEqual({ kind: 'unknown' });
  expect(nutrientValue('Total Fat', facts({ fat: -1 }).nutrition)).toBeNull();
});

test('goals require facts and keep unverified alternatives', () => {
  const metadata = facts({ calories: 120, fat: 5, protein: 9 });
  metadata.nutrition!.sugar = 10;
  metadata.dietary = ['Lactose-free', 'Plant-based'];
  const known = alternative(metadata);
  const unknown = alternative();
  for (const goal of ['Lower fat', 'Lower sugar', 'Lower calorie', 'Higher protein', 'Lactose-free', 'Plant-based'] as ShoppingGoal[]) {
    expect(goalSupported(goal, known, facts())).toBe(true);
    expect(goalSupported(goal, unknown, facts())).toBe(false);
    expect(rankedForGoal(goal, [unknown, known], facts())[0].facts).not.toBeNull();
  }
});

test('prices need a source, a currency and the same package', () => {
  const original = { ...facts(), price: 5, currency: 'USD', pricePackage: '1 gallon' };
  const cheaper = { ...facts(), price: 4, currency: 'USD', pricePackage: '1 gallon' };
  expect(goalSupported('Lower price', alternative(cheaper), original)).toBe(true);
  expect(goalSupported('Lower price', alternative({ ...cheaper, pricePackage: '1 quart' }), original)).toBe(false);
  expect(priceLabel({ ...cheaper, currency: null })).toBeNull();
  expect(priceLabel(cheaper, 'en-US')).toBe('Approx. $4.00');
});

test('allergens never infer absence or free-from', () => {
  const data: ShoppingProductFacts = { source: 'Label fixture', contains: ['Milk'] };
  expect(allergenLabels(data)).toEqual(['Contains Milk']);
  expect(allergenLabels(data)).not.toContain('Nuts-free');
  expect(allergenLabels({ source: 'Label fixture' })).toEqual([]);
  expect(allergenLabels({ source: '', freeFrom: ['Nuts'] })).toEqual([]);
  expect(allergenLabels({ source: 'Label fixture', freeFrom: ['Gluten'] })).toEqual(['Gluten-free']);
});

test('swaps preserve the item\'s own details and refuse duplicate adds', () => {
  const original = item({ name: 'Whole Milk', category: 'Dairy & Eggs', quantity: '2', size: '1 gallon', notes: 'For Saturday', checked: true, favorite: true, imageData: '/9j/AA==' });
  const before = list([original]);
  const replaced = swapReplacing(original.id, alternative(), before)!;
  expect(replaced.items).toHaveLength(1);
  expect(replaced.items[0]).toMatchObject({ id: original.id, name: '2% Milk', quantity: '2', size: '1 gallon', notes: 'For Saturday', checked: true, favorite: true, imageData: null });
  expect(replaced.weekly && replaced.id === 'list' && replaced.revision === 4).toBe(true);
  expect(JSON.parse(JSON.stringify(replaced))).toEqual(replaced);
  const added = swapAdding(alternative(), before, 'new-id')!;
  expect(added.items[0]).toEqual(original);
  expect(added.items).toHaveLength(2);
  expect(added.items[1].id).not.toBe(original.id);
  expect(swapAdding(alternative(), added, 'other-id')).toBeNull();
  expect(swapReplacing('gone', alternative(), before)).toBeNull();
});

test('legacy responses and missing metadata stay usable', () => {
  const decoded = JSON.parse(JSON.stringify({ ...alternative(), facts: undefined })) as ShoppingAlternative;
  expect(decoded.facts).toBeUndefined();
  expect(explanation(decoded, null)).toContain('Compare');
  expect(usages({ ...decoded, name: 'Bread' })).toEqual([]);
  expect(usages(decoded)).toEqual(['Cereal', 'Coffee', 'Cooking', 'Smoothies']);
  expect(priceLabel(decoded.facts)).toBeNull();
});

test('production facts keep their source and trace warnings, and swaps carry brand and barcode', () => {
  const metadata = JSON.parse(
    '{"source":"OPEN_FOOD_FACTS","name":"Example Milk","matchQuality":"exact_barcode","barcode":"0123456789012","brand":"Example","ingredientText":"Milk, vitamin D","contains":["Milk"],"mayContain":["Peanuts"],"allergenStatus":"declared","freshness":"stale","nutrition":{"servingSize":"100 g","servingAmount":100,"servingUnit":"g","totalFat":3.25}}',
  ) as ShoppingProductFacts;
  expect(matchLabel(metadata)).toBe('Exact barcode match');
  expect(metadata.mayContain).toEqual(['Peanuts']);
  expect(allergenLabels(metadata)).toEqual(['Contains Milk']);
  const choice = { ...alternative(metadata), whyThisSwap: 'A source-grounded explanation.' };
  const original = item({ name: 'Milk' });
  const swapped = swapReplacing(original.id, choice, list([original], { weekly: false, revision: 0 }))!;
  expect(swapped.items[0].brand).toBe('Example');
  expect(swapped.items[0].barcode).toBe('0123456789012');
  expect(swapAdding(choice, list([]), 'n')!.items[0]).toMatchObject({ brand: 'Example', barcode: '0123456789012', notes: 'Compare labels' });
});

test('extended goals require verified data', () => {
  const source = facts();
  source.nutrition = { ...source.nutrition!, fiber: 1, sodium: 100 };
  const changed = facts();
  changed.nutrition = { ...changed.nutrition!, fiber: 4, sodium: 50 };
  changed.dietary = ['Gluten-free', 'No artificial ingredients'];
  for (const goal of ['High fiber', 'Low sodium', 'Gluten-free', 'No artificial ingredients'] as ShoppingGoal[]) {
    expect(goalSupported(goal, alternative(changed), source)).toBe(true);
    expect(goalSupported(goal, alternative(), source)).toBe(false);
  }
});

test('nutrition sort uses normalised values and signed differences', () => {
  const original: ShoppingProductFacts = { source: 'test', nutrition: { servingSize: '100 g', servingAmount: 100, servingUnit: 'g', calories: 100, protein: 10, sugar: 20, sodium: 30 } };
  const other: ShoppingProductFacts = { source: 'test', nutrition: { servingSize: '50 g', servingAmount: 50, servingUnit: 'g', calories: 60, protein: 10, sugar: 5 } };
  const value = comparison(original, other);
  expect(sortedNutrients(value, 'Your item', false)).toEqual(['Calories', 'Sodium', 'Sugar', 'Protein']);
  expect(sortedNutrients(value, 'Alternative', true)).toEqual(['Sugar', 'Protein', 'Calories', 'Sodium']);
  expect(sortedNutrients(value, 'Difference', true)).toEqual(['Sugar', 'Protein', 'Calories', 'Sodium']);
  expect(sortedNutrients(value, null, true)).toEqual(['Calories', 'Protein', 'Sugar', 'Sodium']);
});

test('nutrition sort keeps unknown values and ties in a stable order', () => {
  const same: ShoppingProductFacts = { source: 'test', nutrition: { servingSize: '1 serving', servingAmount: null, servingUnit: null, protein: 1, sugar: 1 } };
  const value = comparison(same, same);
  expect(sortedNutrients(value, 'Difference', false)).toEqual(['Protein', 'Sugar']);
  expect(sortedNutrients(value, 'Your item', true)).toEqual(['Protein', 'Sugar']);
});

describe('listInput sends what ShoppingInput and GroceryItem.encode send', () => {
  it('brand, barcode and favourites only when set, never the chosen offer, and the store when set', () => {
    const offer = { id: 'o', product: 'Milk', store: 'Costco', sourceURL: 'https://example.com', expiresAt: '2026-10-10' };
    const input = listInput(
      list([item({ brand: 'Example', barcode: '12345678', favorite: true, favoriteAlternatives: ['a|b|c|d'], chosenOffer: offer }), item({ id: 'plain' })], {
        storeName: 'Costco',
        storeZip: '94526',
        storePlaceId: null,
      }),
    );
    expect(input.items[0]).toMatchObject({ brand: 'Example', barcode: '12345678', favorite: true, favoriteAlternatives: ['a|b|c|d'] });
    expect(input.items[0]).not.toHaveProperty('chosenOffer');
    expect(Object.keys(input.items[1]).sort()).toEqual(['category', 'checked', 'id', 'imageData', 'name', 'notes', 'quantity', 'size']);
    expect(input).toMatchObject({ storeName: 'Costco', storeZip: '94526' });
    expect(input).not.toHaveProperty('storePlaceId');
  });
});

it('does not offer the item itself as an alternative', () => {
  expect(isOriginalItem({ name: ' 2%  Milk ' }, { name: '2% milk' })).toBe(true);
  expect(isOriginalItem({ name: 'Lactose-free milk' }, { name: '2% milk' })).toBe(false);
});
