/** Pure helpers for the web Account & Safety cards: change password, report a bug, delete account. */

const MAX_PASSWORD_BYTES = 72;

/** The first thing wrong with a password change, or null. The server checks all of it again. */
export function passwordIssue(current: string, next: string, confirm: string): string | null {
  if (current === '') return 'Enter your current password.';
  if (next === '') return 'Enter a new password.';
  if (new TextEncoder().encode(next).length > MAX_PASSWORD_BYTES) return 'The new password is too long (72 bytes at most).';
  if (next === current) return 'Choose a different new password.';
  if (next !== confirm) return 'The new passwords do not match.';
  return null;
}

export const BUG_MAX = 2000;

/** The report body the server accepts (src/server/feedback/bugs.ts). The web sends no screenshot. */
export function webBugReport(description: string, id: string, correlationID: string, now: number) {
  return {
    id,
    description: description.trim(),
    metadata: {
      appVersion: '1.0',
      buildNumber: '1',
      deviceModel: 'Web browser',
      iosVersion: '0',
      screen: 'settings' as const,
      timestamp: new Date(Math.floor(now / 1000) * 1000).toISOString(),
      correlationID,
    },
    screenshotConsent: false,
  };
}

export function bugIssue(description: string): string | null {
  const text = description.trim();
  if (text === '') return 'Describe what went wrong.';
  if (text.length > BUG_MAX) return `Keep the description under ${BUG_MAX.toLocaleString('en-US')} characters.`;
  return null;
}

/** Deleting an account needs the exact word, so it cannot happen by a stray click. */
export const DELETE_WORD = 'DELETE';
export function canDeleteAccount(typed: string): boolean {
  return typed.trim() === DELETE_WORD;
}

export type BugReportRow = { id: string; description: string; createdAt: string; reference: string; status: 'open' | 'closed'; detailedStatus: string };
