import { getApi, type ApiClient } from './index';

/**
 * Daily Food Check-in wire types and endpoints (src/app/api/nutrition/*, src/server/nutrition/*), read
 * against the Swift decoders in ios/App/CalorieTrackerView.swift:5-68 and `CalorieStore` (`:70-215`).
 *
 * Errors are `{ code, error }` (src/server/nutrition/errors.ts:8-28); the client shows `error`, as Swift.
 * Every `date` is a local `yyyy-MM-dd` in the settings zone (`CalorieStore.dayString`).
 */

export type NutritionMeal = 'BREAKFAST' | 'LUNCH' | 'SNACKS' | 'DINNER';
export type NutritionNoAnswer = 'NOTIFY' | 'RETRY_ONCE' | 'SKIP';

/** `NutritionSettings` (CalorieTrackerView.swift:5-18; settings.ts:17-32). */
export type NutritionSettings = {
  enabled: boolean;
  phone?: string | null;
  phoneVerified: boolean;
  /** `HH:mm`. */
  localTime: string;
  timeZone: string;
  repeatDaily: boolean;
  noAnswer: NutritionNoAnswer | string;
  voice: string;
  calorieGoal: number;
  /** Keyed by the nutrient label ("Protein", "Fiber", …). */
  goals?: Record<string, number> | null;
  voices: string[];
  /** Absent from servers before insights. */
  insightsEnabled?: boolean | null;
};

/** `SettingsUpdate` (CalorieTrackerView.swift:88-98): only the keys that are set are sent. */
export type NutritionSettingsUpdate = Partial<{
  enabled: boolean;
  localTime: string;
  timeZone: string;
  repeatDaily: boolean;
  noAnswer: NutritionNoAnswer;
  voice: string;
  calorieGoal: number;
  goals: Record<string, number>;
  insightsEnabled: boolean;
}>;

/** `NutritionTotals` (CalorieTrackerView.swift:20-30). The key nutrients are absent from older servers. */
export type NutritionTotals = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
  calciumMg?: number | null;
  ironMg?: number | null;
  vitaminDIu?: number | null;
};

/** `NutritionEntry` (CalorieTrackerView.swift:43-52). The server sends more (food name, grams, nutrients); Swift reads these. */
export type NutritionEntry = {
  id: string;
  meal: NutritionMeal | string;
  description: string;
  kcal: number;
  source: 'MANUAL' | 'USDA' | 'OPEN_FOOD_FACTS' | 'ESTIMATE' | string;
  status: 'CONFIRMED' | 'NEEDS_REVIEW' | string;
  fromCall: boolean;
};

/** `NutritionDay` (CalorieTrackerView.swift:54-60): `GET /api/nutrition/log?date=`. */
export type NutritionDay = { date: string; calorieGoal: number; totals: NutritionTotals; needsReview: number; entries: NutritionEntry[] };

/**
 * `NutritionSummary` (CalorieTrackerView.swift:62-68). Week is the Monday–Sunday week containing `date`,
 * worked out ON THE SERVER (`mondayOf`, src/server/nutrition/log.ts:104-112); month is the 30 days ending
 * on `date`. `averageKcal` counts only days with something logged.
 */
export type NutritionSummary = {
  startDate?: string;
  endDate?: string;
  days?: number;
  calorieGoal: number;
  daily: { date: string; kcal: number }[];
  averageKcal: number;
  daysLogged: number;
};

/**
 * `NutritionInsight` (CalorieTrackerView.swift:32-41): today's one insight, with at most one action.
 * Computed on the server over the 7 days ending on `date` (src/server/nutrition/insights.ts).
 */
export type NutritionInsight = {
  key: string;
  kind: 'GAP' | 'STREAK' | 'NEED_DATA' | string;
  title: string;
  text: string;
  nutrient?: string | null;
  items: string[];
  listTitle?: string | null;
  state: 'open' | 'added' | 'dismissed' | string;
};

/** `NewEntry` (CalorieTrackerView.swift:103). Swift always sends `kcal`, so the server's food lookup never runs for it. */
export type NewNutritionEntry = { date: string; meal: NutritionMeal; description: string; kcal: number };

/** `EntryPatch` (CalorieTrackerView.swift:104). NOTE: sending `kcal` makes the entry MANUAL and clears its nutrients. */
export type NutritionEntryPatch = { meal?: NutritionMeal; description?: string; kcal?: number; confirm?: true };

/** `POST /api/nutrition/phone { action: "start" }`. Swift reads only `sent`. */
export type NutritionCodeSent = { sent: boolean; alreadyVerified?: boolean; phoneVerified?: boolean; channel?: 'voice' | 'sms'; message?: string };

/** `POST /api/nutrition/call-now` (202). Swift ignores `status`; `cancelled` means calls are switched off. */
export type NutritionCallStarted = { callId?: string; status: 'dialing' | 'failed' | 'cancelled' | 'not_claimed' | string };

export const nutritionApi = {
  settings: (client: ApiClient = getApi()) => client.get<NutritionSettings>('/api/nutrition/settings'),
  /** 409 `PHONE_NOT_VERIFIED` when `enabled: true` is sent without a verified phone. */
  saveSettings: (update: NutritionSettingsUpdate, client: ApiClient = getApi()) => client.put<NutritionSettings>('/api/nutrition/settings', update),
  day: (date: string, client: ApiClient = getApi()) => client.get<NutritionDay>(`/api/nutrition/log?date=${encodeURIComponent(date)}`),
  summary: (period: 'week' | 'month', date: string, client: ApiClient = getApi()) =>
    client.get<NutritionSummary>(`/api/nutrition/summary?period=${period}&date=${encodeURIComponent(date)}`),
  insight: (date: string, client: ApiClient = getApi()) => client.get<{ insight: NutritionInsight | null }>(`/api/nutrition/insight?date=${encodeURIComponent(date)}`),
  /** `add` writes the items onto a shopping list on the server ("Groceries" when there is none). */
  actOnInsight: (input: { date: string; key: string; action: 'add' | 'dismiss' }, client: ApiClient = getApi()) =>
    client.post<{ ok: true; added: string[]; listTitle?: string | null }>('/api/nutrition/insight', input),
  /** 400 `INVALID_PHONE`, 429 `CODE_THROTTLED` (60 s), 503 `CODE_UNAVAILABLE`. */
  sendCode: (phone: string, client: ApiClient = getApi()) => client.post<NutritionCodeSent>('/api/nutrition/phone', { action: 'start', phone }),
  /** 400 `INVALID_CODE`. Answers with the settings, now verified. */
  verifyCode: (code: string, client: ApiClient = getApi()) => client.post<NutritionSettings>('/api/nutrition/phone', { action: 'verify', code }),
  /** 503 not configured, 409 unverified or outside 08:00–21:30, 429 10-minute cooldown. */
  callNow: (client: ApiClient = getApi()) => client.post<NutritionCallStarted>('/api/nutrition/call-now'),
  addEntry: (entry: NewNutritionEntry, client: ApiClient = getApi()) => client.post<{ entry: NutritionEntry }>('/api/nutrition/log', entry),
  updateEntry: (id: string, patch: NutritionEntryPatch, client: ApiClient = getApi()) =>
    client.patch<{ entry: NutritionEntry }>(`/api/nutrition/log/${encodeURIComponent(id)}`, patch),
  deleteEntry: (id: string, client: ApiClient = getApi()) => client.del<{ deleted: boolean }>(`/api/nutrition/log/${encodeURIComponent(id)}`),
};
