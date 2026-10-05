import type { NutritionDay, NutritionEntry, NutritionSummary } from '../../api/nutrition';

/**
 * `CalorieStore.sampleDay` / `sampleSummary` (CalorieTrackerView.swift:229-243) and the view's
 * `sampleIntake` (`:288`): what the Calorie Tracker shows when it is not live — the design preview.
 */

const SAMPLE_ENTRIES: [string, number, string][] = [
  ['🥚  2 eggs', 140, 'BREAKFAST'],
  ['🍞  Whole wheat toast (2 slices)', 160, 'BREAKFAST'],
  ['☕  Coffee with a little milk', 25, 'BREAKFAST'],
  ['🍌  Banana', 105, 'BREAKFAST'],
  ['🍲  Chicken biryani (1.5 cups)', 650, 'LUNCH'],
  ['🥜  Almonds (small handful)', 170, 'SNACKS'],
  ['🐟  Grilled salmon', 180, 'DINNER'],
];

/** `sampleDay`. Ids are fixed here (Swift: a fresh UUID each); the date is empty, as Swift's. */
export function sampleDay(): NutritionDay {
  const entries: NutritionEntry[] = SAMPLE_ENTRIES.map(([description, kcal, meal], index) => ({
    id: `sample-${index}`,
    meal,
    description,
    kcal,
    source: 'MANUAL',
    status: 'CONFIRMED',
    fromCall: false,
  }));
  return {
    date: '',
    calorieGoal: 2000,
    totals: { kcal: entries.reduce((sum, entry) => sum + entry.kcal, 0), proteinG: 82, carbsG: 180, fatG: 52 },
    needsReview: 0,
    entries,
  };
}

/** `sampleSummary`: seven days whose dates do not parse, so the month view falls back to chunks. */
export const SAMPLE_SUMMARY: NutritionSummary = {
  calorieGoal: 2000,
  daily: [1500, 2080, 1850, 2400, 1950, 1760, 1620].map((kcal, index) => ({ date: `sample-${index}`, kcal })),
  averageKcal: 1880,
  daysLogged: 7,
};

/** `sampleIntake`, by `NUTRIENTS` row. */
export const SAMPLE_INTAKE = [82, 180, 52, 12, 600, 10, 400, 300];

/** `recomputePreviewTotal()` (:200-205): the day's kcal and review count from its entries. */
export function recomputed(day: NutritionDay): NutritionDay {
  return {
    ...day,
    totals: { ...day.totals, kcal: day.entries.reduce((sum, entry) => sum + entry.kcal, 0) },
    needsReview: day.entries.filter((entry) => entry.status !== 'CONFIRMED').length,
  };
}
