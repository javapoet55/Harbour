import { act, render } from '@testing-library/react-native';

import { redirectSystemPath } from '../../app/+native-intent';
import {
  beginOAuthSession,
  deliverOAuthCallback,
  oauthCallbackKind,
  redirectOAuthCallback,
  resetOAuthCallbacks,
  takeOAuthCallback,
  useOAuthCallback,
  waitForOAuthCallback,
  type OAuthCallbackKind,
} from './oauthCallbacks';

// The exact redirects the server sends (src/app/api/calendar/oauth/[provider]/callback/route.ts:10,
// src/app/api/moments/email/callback/route.ts:7).
const CALENDAR_OK = 'nexdo://calendar-connected?calendar=google-connected';
const CALENDAR_ERROR = 'nexdo://calendar-connected?calendar=error&detail=token+expired';
const EMAIL_OK = 'nexdo://moments-email?status=connected';

beforeEach(() => resetOAuthCallbacks());

describe('oauthCallbackKind', () => {
  it('recognises both callback links, and nothing else', () => {
    expect(oauthCallbackKind(CALENDAR_OK)).toBe('calendar');
    expect(oauthCallbackKind(CALENDAR_ERROR)).toBe('calendar');
    expect(oauthCallbackKind('nexdo:///calendar-connected?calendar=google-connected')).toBe('calendar');
    expect(oauthCallbackKind(EMAIL_OK)).toBe('moments-email');
    expect(oauthCallbackKind('nexdo://moments-email?status=error')).toBe('moments-email');
    expect(oauthCallbackKind('nexdo://task/abc')).toBeNull();
    expect(oauthCallbackKind('/account/settings')).toBeNull();
    expect(oauthCallbackKind('https://example.com/calendar-connected')).toBeNull();
  });
});

describe('redirectSystemPath (+native-intent)', () => {
  it('passes every other link through untouched', () => {
    expect(redirectSystemPath({ path: 'nexdo://task/abc', initial: false })).toBe('nexdo://task/abc');
    expect(redirectSystemPath({ path: '/calendar', initial: true })).toBe('/calendar');
  });

  it('does not navigate while the session that asked for the callback is open, and parks it for that session', () => {
    const end = beginOAuthSession('calendar');
    expect(redirectSystemPath({ path: CALENDAR_OK, initial: false })).toBeNull();
    expect(takeOAuthCallback('calendar')).toBe(CALENDAR_OK);
    end();
  });

  it('lands on the flow’s own screen when no session is open (the app was restarted)', () => {
    expect(redirectSystemPath({ path: CALENDAR_OK, initial: true })).toBe('/account/settings');
    expect(takeOAuthCallback('calendar')).toBe(CALENDAR_OK);
    expect(redirectSystemPath({ path: EMAIL_OK, initial: false })).toBe('/moments/settings');
    expect(takeOAuthCallback('moments-email')).toBe(EMAIL_OK);
  });

  it('a calendar session does not swallow the Gmail callback', () => {
    const end = beginOAuthSession('calendar');
    expect(redirectOAuthCallback(EMAIL_OK)).toBe('/moments/settings');
    end();
  });
});

describe('waitForOAuthCallback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves with a callback that lands after the session came back dismissed', async () => {
    const waiting = waitForOAuthCallback('calendar', 1500);
    jest.advanceTimersByTime(400);
    deliverOAuthCallback('calendar', CALENDAR_OK);
    await expect(waiting).resolves.toBe(CALENDAR_OK);
    expect(takeOAuthCallback('calendar')).toBeNull();
  });

  it('resolves null when nothing arrives in time', async () => {
    const waiting = waitForOAuthCallback('calendar', 1500);
    jest.advanceTimersByTime(1500);
    await expect(waiting).resolves.toBeNull();
  });

  it('ignores the other flow’s callback', async () => {
    const waiting = waitForOAuthCallback('calendar', 1500);
    deliverOAuthCallback('moments-email', EMAIL_OK);
    jest.advanceTimersByTime(1500);
    await expect(waiting).resolves.toBeNull();
    expect(takeOAuthCallback('moments-email')).toBe(EMAIL_OK);
  });
});

describe('useOAuthCallback', () => {
  function Screen({ kind, onCallback }: { kind: OAuthCallbackKind; onCallback: (url: string) => void }) {
    useOAuthCallback(kind, onCallback);
    return null;
  }

  it('takes a callback parked before the screen mounted', async () => {
    deliverOAuthCallback('calendar', CALENDAR_ERROR);
    const handle = jest.fn();
    await render(<Screen kind="calendar" onCallback={handle} />);
    expect(handle).toHaveBeenCalledWith(CALENDAR_ERROR);
    expect(takeOAuthCallback('calendar')).toBeNull();
  });

  it('takes one delivered while it is showing, and then the router stays put', async () => {
    const handle = jest.fn();
    await render(<Screen kind="moments-email" onCallback={handle} />);
    let redirected: string | null = 'unset';
    await act(async () => {
      redirected = redirectOAuthCallback(EMAIL_OK);
    });
    expect(handle).toHaveBeenCalledWith(EMAIL_OK);
    expect(redirected).toBeNull();
  });

  it('leaves a callback to the session that is waiting for it', async () => {
    const end = beginOAuthSession('calendar');
    const handle = jest.fn();
    await render(<Screen kind="calendar" onCallback={handle} />);
    await act(async () => {
      deliverOAuthCallback('calendar', CALENDAR_OK);
    });
    expect(handle).not.toHaveBeenCalled();
    expect(takeOAuthCallback('calendar')).toBe(CALENDAR_OK);
    end();
  });
});
