import { afterEach, describe, expect, it } from 'vitest';
import { adminEmails, isAdminEmail } from './admin-auth';

const original = process.env.NEXDO_ADMIN_EMAILS;

afterEach(() => {
  if (original === undefined) delete process.env.NEXDO_ADMIN_EMAILS;
  else process.env.NEXDO_ADMIN_EMAILS = original;
});

describe('admin authorization', () => {
  it('has no built-in administrators', () => {
    delete process.env.NEXDO_ADMIN_EMAILS;
    expect(adminEmails().size).toBe(0);
    expect(isAdminEmail('jsriramk@gmail.com')).toBe(false);
    expect(isAdminEmail('jsriramk@mail.com')).toBe(false);
    process.env.NEXDO_ADMIN_EMAILS = ' , ';
    expect(adminEmails().size).toBe(0);
  });

  it('allows only NEXDO_ADMIN_EMAILS, trimmed and case-insensitively', () => {
    process.env.NEXDO_ADMIN_EMAILS = ' Ops@NexdoApp.com, owner@nexdoapp.com ';
    expect([...adminEmails()]).toEqual(['ops@nexdoapp.com', 'owner@nexdoapp.com']);
    expect(isAdminEmail(' OPS@nexdoapp.com ')).toBe(true);
    expect(isAdminEmail('owner@nexdoapp.com')).toBe(true);
    expect(isAdminEmail('someone@example.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});
