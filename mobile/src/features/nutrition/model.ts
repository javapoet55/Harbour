import { dayKey } from '../../lib/taskQuery';
import type { NutritionMeal, NutritionNoAnswer, NutritionSettings, NutritionSummary, NutritionTotals } from '../../api/nutrition';

/**
 * The pure parts of the Daily Food Check-in (ios/App/CalorieTrackerView.swift). Nothing here touches
 * the network or the device.
 */

/** `CalorieStore.dayString(_:timeZone:)` (CalorieTrackerView.swift:207-214): `yyyy-MM-dd` in the zone. */
export function nutritionDay(at: number, timeZone: string): string {
  return dayKey(at, timeZone);
}

/** `userZone` (CalorieTrackerView.swift:295): the settings zone, else the device's. */
export function nutritionZone(settings: Pick<NutritionSettings, 'timeZone'> | null | undefined, fallback = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const zone = settings?.timeZone;
  if (!zone) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return fallback;
  }
}

/**
 * `CalorieStore.e164(_:)` (CalorieTrackerView.swift:216-227). "+…" with 8–15 digits not starting with 0;
 * a bare national number is read as +1 ONLY when the device region is the US.
 */
export function e164(raw: string, region: string | null | undefined): string | null {
  const trimmed = raw.trim();
  const digits = Array.from(trimmed).filter((char) => /\p{Nd}/u.test(char)).join('');
  if (trimmed.startsWith('+')) return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0') ? `+${digits}` : null;
  const us = region?.toUpperCase() === 'US';
  if (us && digits.length === 10) return `+1${digits}`;
  if (us && digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** The nutrient rows (CalorieTrackerView.swift:283-286), in Swift's order. Omega-3 is not tracked yet. */
export const NUTRIENTS = [
  { label: 'Protein', unit: 'g', goal: 150 },
  { label: 'Carbs', unit: 'g', goal: 250 },
  { label: 'Fats', unit: 'g', goal: 67 },
  { label: 'Fiber', unit: 'g', goal: 25 },
  { label: 'Calcium', unit: 'mg', goal: 1000 },
  { label: 'Iron', unit: 'mg', goal: 18 },
  { label: 'Vitamin D', unit: 'IU', goal: 800 },
  { label: 'Omega-3', unit: 'mg', goal: 1000 },
] as const;

/** Swift's `.rounded()`: half away from zero. */
function rounded(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** `intake(_:)` (CalorieTrackerView.swift:662-675): the day's amount for row `index`, or `null` when unknown. */
export function intake(totals: NutritionTotals | null | undefined, index: number): number | null {
  if (!totals) return null;
  const value = [totals.proteinG, totals.carbsG, totals.fatG, totals.fiberG, totals.calciumMg, totals.ironMg, totals.vitaminDIu][index];
  return value == null ? null : rounded(value);
}

/** Goals restored from settings (CalorieTrackerView.swift:391): saved values by label, else the default. */
export function goalsFrom(saved: Record<string, number> | null | undefined, current: number[] = NUTRIENTS.map((row) => row.goal)): number[] {
  return NUTRIENTS.map((row, index) => (saved?.[row.label] != null ? Math.trunc(saved[row.label]) : current[index]));
}

/** The `goals` object `SettingsUpdate` sends: every row by label, as whole numbers. */
export function goalsPayload(goals: number[]): Record<string, number> {
  return Object.fromEntries(NUTRIENTS.map((row, index) => [row.label, Math.trunc(goals[index] ?? row.goal)]));
}

export const MEALS: { key: NutritionMeal; title: string }[] = [
  { key: 'BREAKFAST', title: 'Breakfast' },
  { key: 'LUNCH', title: 'Lunch' },
  { key: 'SNACKS', title: 'Snacks' },
  { key: 'DINNER', title: 'Dinner' },
];

export const NO_ANSWER_CHOICES: { key: NutritionNoAnswer; title: string; detail: string }[] = [
  { key: 'NOTIFY', title: 'Notify me', detail: 'Send a notification with options.' },
  { key: 'RETRY_ONCE', title: 'Retry once', detail: 'Call again in 15 minutes.' },
  { key: 'SKIP', title: 'Skip for today', detail: 'No further action.' },
];

/** `commonZones` (CalorieTrackerView.swift:290), with the user's own zone first when it is not one of them. */
export const COMMON_ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Asia/Kolkata', 'UTC'];

export function zoneChoices(zone: string): string[] {
  return COMMON_ZONES.includes(zone) ? COMMON_ZONES : [zone, ...COMMON_ZONES];
}

/** `voiceChoices` before settings load (CalorieTrackerView.swift:302). */
export const DEFAULT_VOICES = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];

function weekdayOf(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * `chartValues` (CalorieTrackerView.swift:676-711), live data only.
 *
 * Week: one bar per day, labelled with its weekday letter (the server already sends Monday–Sunday).
 * Month: one bar per Monday–Sunday week, labelled `M/d` of its Monday, the integer average of the days
 * with something logged (0 when none). Days whose date does not parse are skipped, as Swift does.
 */
export function chartValues(summary: Pick<NutritionSummary, 'daily'> | null | undefined, period: 'Week' | 'Month'): { values: number[]; labels: string[] } {
  const daily = summary?.daily ?? [];
  if (period === 'Week') {
    return { values: daily.map((day) => day.kcal), labels: daily.map((day) => { const weekday = weekdayOf(day.date); return weekday === null ? '·' : LETTERS[weekday]; }) };
  }
  const labels: string[] = [];
  const grouped: number[][] = [];
  for (const day of daily) {
    const weekday = weekdayOf(day.date);
    if (weekday === null) continue;
    const [y, m, d] = day.date.split('-').map(Number);
    const monday = new Date(Date.UTC(y, m - 1, d - ((weekday + 6) % 7)));
    const label = `${monday.getUTCMonth() + 1}/${monday.getUTCDate()}`;
    if (labels[labels.length - 1] === label) grouped[grouped.length - 1].push(day.kcal);
    else {
      labels.push(label);
      grouped.push([day.kcal]);
    }
  }
  const values = grouped.map((week) => {
    const logged = week.filter((kcal) => kcal > 0);
    return logged.length === 0 ? 0 : Math.trunc(logged.reduce((sum, kcal) => sum + kcal, 0) / logged.length);
  });
  return { values, labels };
}

/** `NutritionEntry.needsReview` (CalorieTrackerView.swift:51). */
export function needsReview(entry: { status: string }): boolean {
  return entry.status !== 'CONFIRMED';
}
