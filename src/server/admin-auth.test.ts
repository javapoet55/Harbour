import { afterEach, describe, expect, it } from 'vitest';
import { adminEmails, isAdminEmail } from './admin-auth';

const original = process.env.NEXDO_ADMIN_EMAILS;

afterEach(() => {
  if (original === undefined) delete process.env.NEXDO_ADMIN_EMAILS;
  else process.env.NEXDO_ADMIN_EMAILS = original;
});

describe('admin authorization', () => {
  it('allows the configured Nexdo administrator case-insensitively', () => {
    expect(isAdminEmail(' JSRIRAMK@MAIL.COM ')).toBe(true);
    expect(isAdminEmail('someone@example.com')).toBe(false);
  });

  it('supports additional administrators from the environment', () => {
    process.env.NEXDO_ADMIN_EMAILS = 'ops@nexdoapp.com, owner@nexdoapp.com';
    expect(adminEmails().has('ops@nexdoapp.com')).toBe(true);
    expect(isAdminEmail('owner@nexdoapp.com')).toBe(true);
  });
});
