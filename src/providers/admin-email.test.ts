import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminEmailConfigured, adminEmailProvider, adminEmailSender } from './admin-email';

const fetchMock = vi.fn();
const message = { to: 'admin@example.test', subject: 'Your Nexdo admin sign-in code', text: 'Your code is 123456.', html: '<p>123456</p>' };
beforeEach(() => {
  vi.stubEnv('SENDGRID_API_KEY', 'test-sendgrid-key');
  vi.stubEnv('EMAIL_FROM_ADDRESS', 'hello@nexdo.test');
  vi.stubEnv('EMAIL_FROM_NAME', 'Nexdo');
  vi.stubEnv('NEXDO_ADMIN_FROM_EMAIL', '');
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 202, headers: { 'x-message-id': 'sg-1' } }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const sent = () => ({ url: fetchMock.mock.calls[0][0], init: fetchMock.mock.calls[0][1], body: JSON.parse(fetchMock.mock.calls[0][1].body) });

describe('admin sign-in email delivery', () => {
  it('sends through SendGrid with the usual sender when no admin sender is set', async () => {
    expect(await adminEmailProvider.send(message)).toEqual({ id: 'sg-1', status: 'SENT' });
    expect(sent().url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(sent().init.headers).toMatchObject({ Authorization: 'Bearer test-sendgrid-key' });
    expect(sent().body).toMatchObject({ from: { email: 'hello@nexdo.test', name: 'Nexdo' }, subject: message.subject, personalizations: [{ to: [{ email: message.to }] }] });
    expect(sent().body.content).toEqual([{ type: 'text/plain', value: message.text }, { type: 'text/html', value: message.html }]);
  });

  it('uses NEXDO_ADMIN_FROM_EMAIL as the sender address when set', async () => {
    vi.stubEnv('NEXDO_ADMIN_FROM_EMAIL', ' admin-codes@nexdo.test ');
    expect(adminEmailSender()).toBe('admin-codes@nexdo.test');
    await adminEmailProvider.send(message);
    expect(sent().body.from).toEqual({ email: 'admin-codes@nexdo.test', name: 'Nexdo' });
  });

  it('fails closed without SendGrid or a sender, never using the development mock', async () => {
    vi.stubEnv('SENDGRID_API_KEY', '');
    expect(adminEmailConfigured()).toBe(false);
    expect((await adminEmailProvider.send(message)).status).toBe('FAILED');
    vi.stubEnv('SENDGRID_API_KEY', 'test-sendgrid-key'); vi.stubEnv('EMAIL_FROM_ADDRESS', ''); vi.stubEnv('SENDGRID_FROM_EMAIL', '');
    expect((await adminEmailProvider.send(message)).status).toBe('FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a SendGrid rejection as a failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    expect(await adminEmailProvider.send(message)).toMatchObject({ status: 'FAILED', reason: 'SendGrid 401' });
  });
});
