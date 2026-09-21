import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSignInMessage, passwordResetMessage, reminderMessage, testNotificationMessage, verifyEmailMessage } from './messages';
import { emailAppUrl, renderEmail } from './template';

const LOGO = 'https://app.nexdo.test/email/nexdo-logo-email.png';

describe('transactional email template', () => {
  beforeEach(() => {
    vi.stubEnv('APP_URL', 'https://app.nexdo.test/');
    vi.stubEnv('EMAIL_SUPPORT_ADDRESS', 'support@nexdo.test');
  });
  afterEach(() => vi.unstubAllEnvs());

  const codeEmails = [
    ['verify email', () => verifyEmailMessage('042917', '24 hours'), 'Verify your Nexdo email', '24 hours'],
    ['password reset', () => passwordResetMessage('042917', '15 minutes'), 'Your Nexdo password reset code', '15 minutes'],
    ['admin sign-in', () => adminSignInMessage('042917', '10 minutes'), 'Your NEXDO Admin sign-in code', '10 minutes'],
  ] as const;

  it.each(codeEmails)('renders the %s email with code, expiry and logo', (_name, render, subject, expiry) => {
    const email = render();
    expect(email.subject).toBe(subject);
    // The code stays one contiguous, copyable run of digits in both parts.
    expect(email.html).toContain('>042917</div>');
    expect(email.text).toContain('Your code is 042917.');
    expect(email.html).toContain(`Expires in ${expiry} &middot; single use`);
    expect(email.text).toContain(`Expires in ${expiry} · single use`);
    expect(email.html).toContain(`<img src="${LOGO}" width="206" height="48" alt="Nexdo"`);
    expect(email.html).toContain('mailto:support@nexdo.test');
    expect(email.html).toMatchSnapshot('html');
    expect(email.text).toMatchSnapshot('text');
  });

  it.each([
    ['test notification', () => testNotificationMessage()],
    ['reminder', () => reminderMessage('Send the board deck', '1 hour before')],
  ])('renders the %s email without a code block', (_name, render) => {
    const email = render();
    expect(email.html).toContain(LOGO);
    expect(email.html).not.toContain('single use');
    expect(email.html).toMatchSnapshot('html');
    expect(email.text).toMatchSnapshot('text');
  });

  it('escapes every user-visible string', () => {
    const hostile = '<script>alert("x")</script> & \'q\'';
    const email = renderEmail({ preheader: hostile, heading: hostile, intro: hostile, body: [hostile], footerNote: hostile, ignoreNote: hostile, code: { value: hostile, expiresIn: hostile } });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;');
    vi.stubEnv('EMAIL_SUPPORT_ADDRESS', '"><img src=x>@nexdo.test');
    expect(renderEmail({ preheader: 'p', heading: 'h', intro: 'i', footerNote: 'f' }).html).not.toContain('"><img src=x>');
  });

  it('hides the preheader and keeps the layout table-based without scripts or external CSS', () => {
    const { html } = verifyEmailMessage('042917', '24 hours');
    expect(html).toMatch(/<div style="display:none;[^"]*mso-hide:all;[^"]*">Your Nexdo verification code expires in 24 hours\./);
    expect(html).not.toMatch(/<script|<link|<style|@import|fonts\.googleapis/i);
    expect(html).toContain('max-width:560px');
  });

  it('never logs the code while rendering', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    passwordResetMessage('913570', '15 minutes');
    expect(JSON.stringify(spies.map((spy) => spy.mock.calls))).not.toContain('913570');
    spies.forEach((spy) => spy.mockRestore());
  });

  it('falls back to the production origin when APP_URL is missing or invalid', () => {
    vi.stubEnv('APP_URL', '');
    expect(emailAppUrl()).toBe('https://harbour-production-f8a0.up.railway.app');
    vi.stubEnv('APP_URL', 'javascript:alert(1)');
    expect(emailAppUrl()).toBe('https://harbour-production-f8a0.up.railway.app');
  });
});
