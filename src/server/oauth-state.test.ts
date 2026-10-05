import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOAuthState, verifyOAuthState, isNativeOAuthState, createConnectToken, verifyConnectToken } from './oauth-state';
afterEach(() => vi.useRealTimers());
describe('OAuth state and native connect tokens', () => {
  it('creates distinct browser states and validates user/provider/purpose', async () => {
    const state = await createOAuthState('u1', 'google', true);
    expect(state).not.toBe(await createOAuthState('u1', 'google', true));
    expect(await verifyOAuthState(state, 'google')).toBe('u1');
    expect(await isNativeOAuthState(state, 'google')).toBe(true);
    await expect(verifyOAuthState(state, 'microsoft')).rejects.toThrow();
    await expect(verifyOAuthState(state + 'x', 'google')).rejects.toThrow();
    await expect(verifyOAuthState(await createConnectToken('u1', 'google'), 'google')).rejects.toThrow();
    await expect(verifyConnectToken(state, 'google')).rejects.toThrow();
  });
  it('expires state after ten minutes and connect tokens after five', async () => {
    vi.useFakeTimers();
    const state = await createOAuthState('u1', 'google');
    const token = await createConnectToken('u1', 'google');
    vi.advanceTimersByTime(6 * 60000);
    await expect(verifyConnectToken(token, 'google')).rejects.toThrow();
    expect(await verifyOAuthState(state, 'google')).toBe('u1');
    vi.advanceTimersByTime(5 * 60000);
    await expect(verifyOAuthState(state, 'google')).rejects.toThrow();
  });
});
