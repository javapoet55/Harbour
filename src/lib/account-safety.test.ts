import { describe, expect, it } from 'vitest';
import { bugIssue, canDeleteAccount, passwordIssue, webBugReport } from './account-safety';

describe('passwordIssue', () => {
  it('names the first problem', () => {
    expect(passwordIssue('', 'new', 'new')).toBe('Enter your current password.');
    expect(passwordIssue('old', '', '')).toBe('Enter a new password.');
    expect(passwordIssue('old', 'old', 'old')).toBe('Choose a different new password.');
    expect(passwordIssue('old', 'new1', 'new2')).toBe('The new passwords do not match.');
    expect(passwordIssue('old', 'é'.repeat(37), 'é'.repeat(37))).toMatch(/too long/);
    expect(passwordIssue('old', 'a'.repeat(72), 'a'.repeat(72))).toBeNull();
    expect(passwordIssue('old', 'new', 'new')).toBeNull();
  });
});

describe('bug reports', () => {
  it('validates the description', () => {
    expect(bugIssue('  ')).toBe('Describe what went wrong.');
    expect(bugIssue('x'.repeat(2001))).toMatch(/under 2,000/);
    expect(bugIssue('it broke')).toBeNull();
  });
  it('builds a body in the shape the server accepts', () => {
    const body = webBugReport('  broke  ', 'id', 'corr', Date.parse('2026-11-21T10:00:00.789Z'));
    expect(body).toMatchObject({ id: 'id', description: 'broke', screenshotConsent: false, metadata: { screen: 'settings', correlationID: 'corr', timestamp: '2026-11-21T10:00:00.000Z' } });
    expect(body.metadata.appVersion).toMatch(/^[0-9.]{1,30}$/);
    expect(body.metadata.iosVersion).toMatch(/^[0-9.]{1,30}$/);
    expect(body.metadata.deviceModel).toMatch(/^[A-Za-z0-9, ._-]{1,60}$/);
    expect('screenshot' in body).toBe(false);
  });
});

describe('delete account', () => {
  it('needs the exact word', () => {
    expect(canDeleteAccount('DELETE')).toBe(true);
    expect(canDeleteAccount(' DELETE ')).toBe(true);
    expect(canDeleteAccount('delete')).toBe(false);
    expect(canDeleteAccount('')).toBe(false);
  });
});
