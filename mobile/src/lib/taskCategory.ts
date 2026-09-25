/**
 * Port of `ios/Sources/NexdoCore/TaskCategoryAppearance.swift`.
 *
 * Presentation only: an inferred category never changes persisted task data.
 */

export const CATEGORY_KINDS = [
  'fitness',
  'dental',
  'health',
  'school',
  'work',
  'shopping',
  'food',
  'travel',
  'finance',
  'home',
  'social',
  'general',
] as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export type TaskCategoryAppearance = {
  kind: CategoryKind;
  label: string;
};

/** `Kind.defaultLabel` (TaskCategoryAppearance.swift:40-54). Several kinds share a label. */
const DEFAULT_LABEL: Record<CategoryKind, string> = {
  fitness: 'Health',
  health: 'Health',
  dental: 'Personal',
  school: 'School',
  work: 'Work',
  shopping: 'Shopping',
  food: 'Food',
  travel: 'Travel',
  finance: 'Finance',
  home: 'Home',
  social: 'Personal',
  general: 'Tasks',
};

/**
 * The two-colour ramp each kind draws with (TaskCategoryBadge.swift:7-21), as the SwiftUI system
 * colours resolve in light mode.
 */
export const CATEGORY_COLORS: Record<CategoryKind, [string, string]> = {
  fitness: ['#AF52DE', '#007AFF'], // purple, blue
  dental: ['#FF2D55', '#AF52DE'], // pink, purple
  health: ['#FF3B30', '#FF2D55'], // red, pink
  school: ['#30B0C7', '#34C759'], // teal, green
  work: ['#007AFF', '#32ADE6'], // blue, cyan
  shopping: ['#FF9500', '#FF2D55'], // orange, pink
  food: ['#FF9500', '#FF3B30'], // orange, red
  travel: ['#32ADE6', '#007AFF'], // cyan, blue
  finance: ['#34C759', '#30B0C7'], // green, teal
  home: ['#5856D6', '#AF52DE'], // indigo, purple
  social: ['#FF2D55', '#FF9500'], // pink, orange
  general: ['#5856D6', '#007AFF'], // indigo, blue
};

/**
 * The keyword rules, in order (TaskCategoryAppearance.swift:20-33). Order matters: "passport" is
 * travel even though "buy a passport holder" also contains a shopping word, because travel is
 * checked first only if it appears earlier in this list — it does not, so shopping would win. The
 * list is reproduced exactly, top to bottom, so the same title resolves the same way as in Swift.
 */
const RULES: [CategoryKind, string[]][] = [
  ['dental', ['dentist', 'dental', 'tooth', 'teeth', 'orthodontist', 'orthodontic']],
  ['school', ['school', 'homework', 'study', 'studying', 'exam', 'assignment', 'class', 'lecture', 'tuition', 'course']],
  ['finance', ['payroll', 'invoice', 'invoices', 'tax', 'taxes', 'budget', 'bank', 'banking', 'mortgage', 'rent', 'expense', 'expenses', 'bills']],
  ['fitness', ['fitness', 'gym', 'workout', 'workouts', 'weightlifting', 'exercise', 'yoga', 'pilates', 'running', 'jogging', 'swimming', 'cycling', 'go for a run', 'lift weights']],
  ['health', ['health', 'doctor', 'hospital', 'medical', 'medicine', 'medication', 'pharmacy', 'therapy', 'checkup', 'check up', 'vaccination']],
  ['shopping', ['groceries', 'grocery', 'shopping', 'supermarket', 'buy', 'purchase']],
  ['food', ['breakfast', 'lunch', 'dinner', 'cook', 'cooking', 'restaurant', 'meal', 'baking']],
  ['travel', ['travel', 'flight', 'airport', 'hotel', 'vacation', 'trip', 'train', 'passport']],
  ['work', ['work', 'meeting', 'sync', 'presentation', 'report', 'project', 'client', 'office', 'email', 'call', 'deadline', 'interview']],
  ['home', ['home', 'house', 'laundry', 'clean', 'cleaning', 'garden', 'gardening', 'repair', 'plumber']],
  ['social', ['birthday', 'party', 'friends', 'family', 'wedding', 'anniversary', 'visit']],
];

/**
 * `infer` (TaskCategoryAppearance.swift:16-35). Single words match whole tokens; multi-word phrases
 * match against the re-joined string with surrounding spaces, so "go for a run" needs the phrase but
 * "run" alone does not match `fitness`.
 */
function infer(text: string): CategoryKind | null {
  const words = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-US')
    // `split { !$0.isLetter && !$0.isNumber }`
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const tokens = new Set(words);
  const normalized = ` ${words.join(' ')} `;

  for (const [kind, keywords] of RULES) {
    const hit = keywords.some((keyword) => (keyword.includes(' ') ? normalized.includes(` ${keyword} `) : tokens.has(keyword)));
    if (hit) return kind;
  }
  return null;
}

/**
 * `TaskCategoryAppearance.resolve` (TaskCategoryAppearance.swift:11-15).
 *
 * The TITLE is inferred first and wins; the server's category name is only consulted if the title
 * says nothing. The label, though, prefers the server's name whenever it is non-empty — so a task
 * can show the label "Errands" while drawing with the inferred `work` ramp.
 */
export function resolveCategory(title: string, categoryName?: string | null): TaskCategoryAppearance {
  const explicit = categoryName?.trim();
  const kind = infer(title) ?? (explicit ? infer(explicit) : null) ?? 'general';
  return { kind, label: explicit && explicit.length > 0 ? explicit : DEFAULT_LABEL[kind] };
}
