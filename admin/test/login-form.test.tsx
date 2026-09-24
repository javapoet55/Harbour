// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLoginForm, RESEND_DELAY_SECONDS } from '@/app/login/admin-login-form';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/components/nexdo-logo', () => ({ NexdoLogo: () => <span>Nexdo</span> }));

const accepted = { ok: true, message: 'If this email can sign in to Nexdo Admin, a 6-digit code is on its way.' };
const api = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const bodies = () => api.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
// Lets the mocked fetch and the component's awaits settle inside act().
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const click = async (name: string | RegExp) => { fireEvent.click(screen.getByRole('button', { name })); await settle(); };

async function sendCodeFor(email: string) {
  fireEvent.change(screen.getByLabelText('Admin email'), { target: { value: email } });
  fireEvent.submit(screen.getByLabelText('Admin email').closest('form')!);
  await settle();
}
const typeCode = (value: string) => fireEvent.change(screen.getByLabelText('Sign-in code'), { target: { value } });

beforeEach(() => {
  // Only the countdown's clock is faked; setTimeout stays real so promises can settle.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  api.mockReset().mockImplementation(async () => Response.json(accepted));
  vi.stubGlobal('fetch', api);
  router.replace.mockReset(); router.refresh.mockReset();
  render(<AdminLoginForm appLoginUrl={null}/>);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('admin login form', () => {
  it('asks for an email first, with no password field', () => {
    expect(screen.getByLabelText('Admin email')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send code/ })).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByText(/password/i)).toBeNull();
  });

  it('requests a code, then signs in with it and opens the portal', async () => {
    await sendCodeFor('admin@nexdo.test');
    expect(api.mock.calls[0][0]).toBe('/api/admin/auth');
    expect(bodies()[0]).toEqual({ action: 'request', email: 'admin@nexdo.test' });
    expect(screen.getByText(/Enter the 6-digit code we sent to/).textContent).toBe('Enter the 6-digit code we sent to admin@nexdo.test.');
    const signIn = screen.getByRole('button', { name: /Sign in/ }) as HTMLButtonElement;
    typeCode('04 29-1');
    expect((screen.getByLabelText('Sign-in code') as HTMLInputElement).value).toBe('04291');
    expect(signIn.disabled).toBe(true);
    typeCode('042917');
    expect(signIn.disabled).toBe(false);
    api.mockImplementationOnce(async () => Response.json({ ok: true }));
    await click(/Sign in/);
    expect(bodies()[1]).toEqual({ action: 'verify', email: 'admin@nexdo.test', code: '042917' });
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('shows the same next step for any address the backend accepts', async () => {
    await sendCodeFor('not-an-admin@nexdo.test');
    expect(screen.getByText(/Enter the 6-digit code we sent to/).textContent).toBe('Enter the 6-digit code we sent to not-an-admin@nexdo.test.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the backend error for a rejected code and stays on the code step', async () => {
    await sendCodeFor('admin@nexdo.test');
    typeCode('000000');
    api.mockImplementationOnce(async () => Response.json({ error: 'That code is incorrect or has expired.' }, { status: 401 }));
    await click(/Sign in/);
    expect(screen.getByRole('alert').textContent).toBe('That code is incorrect or has expired.');
    expect(screen.getByLabelText('Sign-in code')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows a request error, such as a rate limit, on the email step', async () => {
    api.mockImplementationOnce(async () => Response.json({ error: 'Too many attempts. Please try again in 15 minutes.' }, { status: 429 }));
    await sendCodeFor('admin@nexdo.test');
    expect(screen.getByRole('alert').textContent).toBe('Too many attempts. Please try again in 15 minutes.');
    expect(screen.getByLabelText('Admin email')).toBeTruthy();
    api.mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });
    await sendCodeFor('admin@nexdo.test');
    expect(screen.getByRole('alert').textContent).toBe('Failed to fetch');
  });

  it('keeps Resend code disabled for 30 seconds, then sends a new code and restarts the wait', async () => {
    await sendCodeFor('admin@nexdo.test');
    const resend = () => screen.getByRole('button', { name: /Resend code/ }) as HTMLButtonElement;
    expect(resend().disabled).toBe(true);
    expect(resend().textContent).toBe(`Resend code in ${RESEND_DELAY_SECONDS}s`);
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(resend().textContent).toBe('Resend code in 20s');
    await act(async () => { vi.advanceTimersByTime(19_000); });
    expect(resend().disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(resend().disabled).toBe(false);
    expect(resend().textContent).toBe('Resend code');
    typeCode('123');
    await click('Resend code');
    expect(bodies()).toEqual([{ action: 'request', email: 'admin@nexdo.test' }, { action: 'request', email: 'admin@nexdo.test' }]);
    expect(screen.getByRole('status').textContent).toBe('A new code is on its way. Earlier codes no longer work.');
    expect((screen.getByLabelText('Sign-in code') as HTMLInputElement).value).toBe('');
    expect(resend().disabled).toBe(true);
  });

  it('goes back to the email step with "Use a different email"', async () => {
    await sendCodeFor('admin@nexdo.test');
    typeCode('123456');
    await click('Use a different email');
    expect((screen.getByLabelText('Admin email') as HTMLInputElement).value).toBe('admin@nexdo.test');
    expect(screen.queryByLabelText('Sign-in code')).toBeNull();
    await sendCodeFor('other@nexdo.test');
    expect(bodies().at(-1)).toEqual({ action: 'request', email: 'other@nexdo.test' });
    expect((screen.getByLabelText('Sign-in code') as HTMLInputElement).value).toBe('');
  });
});
