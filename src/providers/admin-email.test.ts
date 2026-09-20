import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminEmailConfigured, adminEmailProvider } from './admin-email';

const fetchMock = vi.fn();
const message = { to: 'admin@example.test', subject: 'Admin sign-in', text: 'Test code' };
beforeEach(() => {
  vi.stubEnv('HOSTINGER_MAIL_API_KEY', 'test-key');
  vi.stubEnv('NEXDO_ADMIN_FROM_EMAIL', 'support@nexdoapp.com');
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const account = (address = 'support@nexdoapp.com') => new Response(JSON.stringify({ data: { mailboxes: [{ address, resourceId: 'ACtest123' }] } }));

describe('Hostinger admin email', () => {
  it('sends from the exact authenticated mailbox with NEXDO display name', async () => {
    fetchMock.mockResolvedValueOnce(account()).mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await adminEmailProvider.send(message)).status).toBe('SENT');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.mail.hostinger.com/api/v1/mailboxes/ACtest123/send');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ...message, to: [message.to], displayName: 'NEXDO' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer test-key' } });
  });
  it('fails closed without credentials even if SendGrid is configured', async () => {
    vi.stubEnv('HOSTINGER_MAIL_API_KEY', ''); vi.stubEnv('SENDGRID_API_KEY', 'rental-app-key');
    expect(adminEmailConfigured()).toBe(false);
    expect((await adminEmailProvider.send(message)).status).toBe('FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a key for a different mailbox without sending', async () => {
    fetchMock.mockResolvedValueOnce(account('support@pgrentalapp.com'));
    expect((await adminEmailProvider.send(message)).status).toBe('FAILED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('fails safely on authentication errors and malformed discovery data', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await adminEmailProvider.send(message)).status).toBe('FAILED');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} })));
    expect((await adminEmailProvider.send(message)).status).toBe('FAILED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not retry failed or timed-out sends, or leak response content', async () => {
    fetchMock.mockResolvedValueOnce(account()).mockResolvedValueOnce(new Response('sensitive provider payload', { status: 502 }));
    const result = await adminEmailProvider.send(message);
    expect(result.status).toBe('FAILED'); expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValueOnce(account()).mockRejectedValueOnce(new Error('test-key'));
    expect(await adminEmailProvider.send(message)).toMatchObject({ status: 'FAILED', reason: 'Hostinger email request failed' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
