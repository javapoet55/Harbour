import { isApiError } from '../../api/client';

/**
 * In-app bug reports (d511fef, a13461a, da57b57): `BugReportDraft`, `BugShakeGate` and
 * `BugReportFailure` (ios/Sources/NexdoCore/BugReport.swift), checked against `bugSchema`
 * (src/server/feedback/bugs.ts:11-21) and `POST /api/feedback/bugs`
 * (src/app/api/feedback/bugs/route.ts). The screen and the capture wait for reference captures.
 */

/** `bugSchema.metadata.screen` (bugs.ts:17) — any other label is a 400. Static labels only, never titles. */
export const BUG_SCREENS = ['today', 'tasks', 'calendar', 'askAI', 'shopping', 'moments', 'calories', 'pomodoro', 'wellness', 'settings', 'app'] as const;
export type BugScreen = (typeof BUG_SCREENS)[number];

/**
 * `BugDiagnostics` (BugReport.swift:3-15). The schema is `.strict()`, so no extra key is allowed, and
 * every field is regex-checked (bugs.ts:14-18). `iosVersion` is the server's name for the OS version;
 * Android sends its own release there (see `osVersionForServer`).
 */
export type BugDiagnostics = {
  appVersion: string;
  buildNumber: string;
  deviceModel: string;
  iosVersion: string;
  screen: BugScreen;
  /** ISO 8601, UTC. */
  timestamp: string;
  correlationID: string;
};

/**
 * `BugReportInput` (:16-22). `screenshot` is base64 of a JPEG or PNG with no `data:` prefix
 * (bugs.ts:33 checks `^[A-Za-z0-9+/]+={0,2}$`), and is OMITTED — never null — when there is none:
 * the field is a bare `.optional()` on a `.strict()` object.
 */
export type BugReportInput = {
  id: string;
  description: string;
  metadata: BugDiagnostics;
  screenshotConsent: boolean;
  screenshot?: string;
};

/** `BugReportReceipt` (:23): the six-digit reference, `BR-000000` to `BR-999999` (da57b57). */
export type BugReportReceipt = { reference: string };

export const BUG_REFERENCE = /^BR-\d{6}$/;

/** `valid` (:31) and the editor's clamp (BugReportView.swift:113-117): UTF-16 units, which is JS `length`. */
export const BUG_DESCRIPTION_LIMIT = 2000;

/**
 * The attachment caps, outermost first (route.ts:16, bugs.ts:20, bugs.ts:37):
 * - the whole request body may not pass 2,850,000 bytes — 413 "Screenshot is too large.";
 * - the base64 string may not pass 2,800,000 characters — 400;
 * - the DECODED image may not pass 2,000,000 bytes — 400 "Invalid report or screenshot.".
 * The last is the binding one (2,000,000 bytes is 2,666,668 base64 characters). The server then
 * re-encodes to a JPEG of at most 1170×2532 with no metadata, and keeps it 7 days; the report 90.
 */
export const BUG_SCREENSHOT_MAX_BYTES = 2_000_000;
export const BUG_SCREENSHOT_MAX_BASE64 = 2_800_000;
export const BUG_REQUEST_MAX_BYTES = 2_850_000;

/** Decoded size of a base64 string without decoding it. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Whether a capture fits the server. Swift does not check — its capture (a ≤1170-wide JPEG at 0.7,
 * BugReportCoordinator.swift:62-64) is always far under — but an Android capture at device
 * resolution could pass it, and the server's answer would read like a bad image.
 */
export function screenshotFits(base64: string): boolean {
  return base64.length <= BUG_SCREENSHOT_MAX_BASE64 && base64Bytes(base64) <= BUG_SCREENSHOT_MAX_BYTES;
}

/**
 * `BugReportDraft` (:24-44), immutable. `frozen` is the first request built; every retry reuses it
 * exactly, even after an ambiguous network failure, so the server's idempotency on `id` holds
 * (bugs.ts:57-61 answers a repeat of the same id with the first reference).
 */
export type BugReportDraft = {
  id: string;
  description: string;
  /** Base64, as it will be sent. */
  screenshot: string | null;
  screenshotConsent: boolean;
  frozen: BugReportInput | null;
};

export function newBugDraft(newId: () => string): BugReportDraft {
  return { id: newId(), description: '', screenshot: null, screenshotConsent: false, frozen: null };
}

export function bugDraftValid(draft: Pick<BugReportDraft, 'description'>): boolean {
  return draft.description.trim() !== '' && draft.description.length <= BUG_DESCRIPTION_LIMIT;
}

/** The editor drops whatever passes 2,000 units (BugReportView.swift:113-117). */
export function clampBugDescription(value: string): string {
  return value.length <= BUG_DESCRIPTION_LIMIT ? value : value.slice(0, BUG_DESCRIPTION_LIMIT);
}

/** `includeScreenshot(_:)`: a capture is consent. */
export function includeScreenshot(draft: BugReportDraft, base64: string): BugReportDraft {
  return { ...draft, screenshot: base64, screenshotConsent: true };
}

/** `removeScreenshot()`: removing it withdraws consent. */
export function removeScreenshot(draft: BugReportDraft): BugReportDraft {
  return { ...draft, screenshot: null, screenshotConsent: false };
}

/**
 * `submission(metadata:)` (:36-42). Returns the request and the draft that remembers it, or `null`
 * for an invalid first attempt. The screenshot goes only with consent, and is omitted otherwise.
 */
export function bugSubmission(draft: BugReportDraft, metadata: BugDiagnostics): { input: BugReportInput; draft: BugReportDraft } | null {
  if (draft.frozen) return { input: draft.frozen, draft };
  if (!bugDraftValid(draft)) return null;
  const input: BugReportInput = {
    id: draft.id,
    description: draft.description.trim(),
    metadata,
    screenshotConsent: draft.screenshotConsent,
    ...(draft.screenshotConsent && draft.screenshot !== null ? { screenshot: draft.screenshot } : {}),
  };
  return { input, draft: { ...draft, frozen: input } };
}

/**
 * `BugShakeGate` (:45-52): on, the app active, nothing presented, a jolt over 2.7 g, and at least 8
 * seconds since the last one. `now` is in seconds. The caller keeps `last`.
 */
export function acceptShake(
  last: number,
  { enabled, active, presenting, acceleration, now }: { enabled: boolean; active: boolean; presenting: boolean; acceleration: number; now: number },
): { accepted: boolean; last: number } {
  if (!enabled || !active || presenting || !(acceleration > 2.7) || now - last < 8) return { accepted: false, last };
  return { accepted: true, last: now };
}

/**
 * "Shake to report" is per account on the device: `UserDefaults` key `bug.shake.<profile id>`, off by
 * default, re-read whenever the signed-in account changes (BugReportCoordinator.swift:16-27).
 * Detecting the shake needs an accelerometer module the app does not have yet (expo-sensors).
 */
export function bugShakeKey(ownerId: string): string {
  return `bug.shake.${ownerId}`;
}

/** The gate's starting point: `-Double.infinity`, so the first shake always counts. */
export const SHAKE_NEVER = -Infinity;

export const BUG_FAILURE = {
  unavailable: 'Bug reporting is not available on this server yet. Please try again later.',
  signedOut: 'Your session has expired. Please sign in again before sending your report.',
  connection: 'Couldn’t send the report. Check your connection and try again.',
  other: 'Couldn’t send the report. Please try again later.',
  /** The capture failed (BugReportView.swift:181) — the report can still go without it. */
  screenshotUnavailable: 'Screenshot unavailable on this screen. You can still send your description.',
} as const;

/**
 * `BugReportFailure.message(for:)` (a13461a, BugReport.swift:54-70), mapped onto `ApiError`:
 * - a 404 (an older server without the route) → "not available";
 * - SIGNED_OUT → "sign in again before sending your report" (the generic sign-out text is not used);
 * - NETWORK — RN's `URLError`, timeouts included → "check your connection";
 * - any other API error → its own message, which is the server's text when it sent one ("Too many
 *   attempts. Please try again later." for the rate limits, "Screenshot is too large." for a 413) —
 *   Swift's `localizedDescription`;
 * - anything else → "try again later".
 */
export function bugFailureMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 404) return BUG_FAILURE.unavailable;
    if (error.code === 'SIGNED_OUT') return BUG_FAILURE.signedOut;
    if (error.code === 'NETWORK') return BUG_FAILURE.connection;
    return error.message;
  }
  return BUG_FAILURE.other;
}

const VERSION = /^[0-9.]{1,30}$/;
const DEVICE = /^[A-Za-z0-9, ._-]{1,60}$/;

/** A version the server's `^[0-9.]{1,30}$` accepts, or "0" — Swift's own fallback (BugReportCoordinator.swift:84-86). */
export function versionForServer(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return VERSION.test(text) ? text : '0';
}

/**
 * The device model, reduced to what `^[A-Za-z0-9, ._-]{1,60}$` accepts. Swift sends `utsname.machine`
 * ("iPhone18,2"), which always fits; Android's `Build.MODEL` can carry parentheses, `+` or non-Latin
 * letters, and one bad character would 400 the whole report with the consent message.
 */
export function deviceModelForServer(model: string | null | undefined): string {
  const cleaned = (model ?? '').replace(/[^A-Za-z0-9, ._-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
  return DEVICE.test(cleaned) ? cleaned : 'unknown';
}

/** `diagnostics(screen:)` (BugReportCoordinator.swift:80-87), from values the caller reads off the device. */
export function bugDiagnostics(
  device: { appVersion?: string | null; buildNumber?: string | number | null; model?: string | null; osVersion?: string | number | null },
  screen: BugScreen,
  now: number,
  newId: () => string,
): BugDiagnostics {
  return {
    appVersion: versionForServer(device.appVersion),
    buildNumber: versionForServer(device.buildNumber),
    deviceModel: deviceModelForServer(device.model),
    iosVersion: versionForServer(device.osVersion),
    screen,
    timestamp: new Date(Math.floor(now / 1000) * 1000).toISOString().replace('.000Z', 'Z'),
    correlationID: newId(),
  };
}

/**
 * TODO(screens): the capture. Swift draws the window behind its own overlay at ≤1170 px wide into a
 * JPEG at 0.7 (BugReportCoordinator.swift:52-65) and refuses when a secure text field is on screen.
 * On Android use react-native-view-shot (already a dependency): `captureRef` of the app root with
 * `{ format: 'jpg', quality: 0.7, result: 'base64', width: min(1170, window width) }`, hide the report
 * sheet first, refuse while a `secureTextEntry` input is mounted, and check `screenshotFits` before
 * `includeScreenshot`. No new native module is needed.
 */
