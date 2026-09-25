import type { NextActionPreference, ProfilePreferences, ProfileSettingsInput } from '../api';

/**
 * The validation and normalisation `ProfileSettingsView.settingsInput()` runs before it PATCHes
 * (ios/App/ProfileView.swift:339-366), plus the clock helpers `clock(_:)` and `hours(_:start:end:)`
 * use (`:288-295`).
 *
 * All of it is Swift's, checked against the server's own schema in `src/app/api/settings/route.ts`
 * (the `clock` regex, `name` 1-80, `phoneNumber` preprocessing, and the `workEnd > workStart`
 * transaction guard). Where the two differ, Swift's is the stricter one and is what runs here, so a
 * value that passes locally always passes on the server.
 */

/** `guard !trimmed.isEmpty, trimmed.count <= 80` (ProfileView.swift:341). */
export const NAME_ERROR = 'Enter a display name of 1–80 characters.';
/** `guard preferences.workStart < preferences.workEnd` (`:342`). A plain string compare, as in Swift. */
export const WORK_HOURS_ERROR = 'Working hours must end after they start.';
/** `:344-347`. */
export const PHONE_ERROR = 'Enter a valid phone number, including country code (for example, +15551234567).';

/**
 * `normalizePhone(_:)` (ProfileView.swift:358-366) — "Accept friendly punctuation and US 10-digit
 * numbers, while sending the E.164 form required by the server and SMS providers."
 *
 * Returns `null` for an empty value AND for an invalid one; the caller tells them apart by looking at
 * whether the raw value was blank, exactly as `settingsInput()` does.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value.length === 0) return null;
  const digits = value.replace(/\D/g, '');
  if (value.startsWith('+')) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
    return `+${digits}`;
  }
  if (digits.length !== 10) return null;
  return `+1${digits}`;
}

export type SettingsDraft = {
  name: string;
  preferences: ProfilePreferences;
  nextAction: NextActionPreference;
  /** `TimeZone.autoupdatingCurrent.identifier` — always the device zone, never the stored one. */
  deviceTimeZone: string;
};

export type SettingsValidation =
  | { ok: true; input: ProfileSettingsInput }
  | { ok: false; failure: string };

/**
 * `settingsInput()` (ProfileView.swift:339-356).
 *
 * Order matters and is Swift's: name, then working hours, then the phone number. The phone number is
 * NOT editable anywhere in `body` — it is whatever the server last stored — but Swift still
 * normalises it on every save, so a legacy value the server would now reject blocks the save with
 * the phone message. That is reproduced rather than quietly dropped.
 *
 * `timeZone` is ALWAYS the device zone (`:355`), so saving settings also re-asserts it.
 */
export function validateSettings(draft: SettingsDraft): SettingsValidation {
  const trimmed = draft.name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return { ok: false, failure: NAME_ERROR };
  if (!(draft.preferences.workStart < draft.preferences.workEnd)) return { ok: false, failure: WORK_HOURS_ERROR };

  const phone = normalizePhone(draft.preferences.phoneNumber);
  const rawWasBlank = (draft.preferences.phoneNumber ?? '').trim().length === 0;
  if (phone === null && !rawWasBlank) return { ok: false, failure: PHONE_ERROR };

  return {
    ok: true,
    input: {
      name: trimmed,
      timeZone: draft.deviceTimeZone,
      preference: { ...draft.preferences, phoneNumber: phone },
      nextAction: draft.nextAction,
    },
  };
}

/**
 * `clock(_:)` (ProfileView.swift:288-292) reads "HH:mm" into hour and minute, defaulting to 09:00
 * when a part is missing, and writes back with `String(format: "%02d:%02d")`.
 */
export function parseClock(value: string): { hour: number; minute: number } {
  const parts = value.split(':').map((part) => Number.parseInt(part, 10));
  const numbers = parts.filter((part) => Number.isFinite(part));
  return { hour: numbers[0] ?? 9, minute: numbers[numbers.length - 1] ?? 0 };
}

export function formatClock(hour: number, minute: number): string {
  const wrapped = ((hour % 24) + 24) % 24;
  const wrappedMinute = ((minute % 60) + 60) % 60;
  return `${String(wrapped).padStart(2, '0')}:${String(wrappedMinute).padStart(2, '0')}`;
}

/**
 * `TimeZone.autoupdatingCurrent.identifier.replacingOccurrences(of: "_", with: " ")`
 * (ProfileView.swift:195): the read-only value beside "Time zone (Automatic)".
 */
export function timeZoneLabel(identifier: string): string {
  return identifier.replace(/_/g, ' ');
}

/** The device zone Swift reads from `TimeZone.autoupdatingCurrent`. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** `Picker("AI confirmation", …)` (ProfileView.swift:200-204), in Swift's order. */
export const CONFIRMATION_LEVELS = [
  { value: 'ALWAYS', title: 'Always confirm' },
  { value: 'CHANGES_AND_DELETES', title: 'Confirm changes and deletions' },
  { value: 'ROUTINE_AUTO', title: 'Execute routine actions' },
] as const;

/** `Picker("Protect my current focus", …)` (ProfileView.swift:212-214). */
export const SWITCHING_THRESHOLDS = [
  { value: 5, title: 'Flexible' },
  { value: 10, title: 'Balanced' },
  { value: 25, title: 'Strong' },
] as const;

/** `AppAppearance` (ios/App/AppAppearance.swift:19-37), in `allCases` order. */
export const APPEARANCES = [
  { value: 'system', title: 'System' },
  { value: 'day', title: 'Day' },
  { value: 'night', title: 'Night' },
] as const;

/**
 * `LegalLinks` (ios/Sources/NexdoCore/ProfileSettings.swift, commit 27798c5): Nexdo's public legal
 * pages on the marketing site. App routes such as /privacy on the API host redirect to sign-in, so
 * Settings links here instead.
 */
export const LEGAL_LINKS = {
  privacyPolicyTitle: 'Privacy policy',
  privacyPolicy: 'https://nexdoapp.com/privacy',
  termsOfServiceTitle: 'Terms of service',
  termsOfService: 'https://nexdoapp.com/terms',
} as const;
