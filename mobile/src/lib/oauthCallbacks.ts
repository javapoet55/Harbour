import { useEffect, useRef } from 'react';

/**
 * The two OAuth callback deep links the server redirects native sign-ins to:
 *
 * - `nexdo://calendar-connected?calendar=<provider>-connected` or `?calendar=error&detail=…`
 *   (src/app/api/calendar/oauth/[provider]/callback/route.ts:9-10, when the state is native).
 * - `nexdo://moments-email?status=connected|error` (src/app/api/moments/email/callback/route.ts:7).
 *
 * Swift never routes these: `ASWebAuthenticationSession(callbackURLScheme: "nexdo")` captures the
 * redirect and hands it to the code that opened the session (ProfileView.swift:13-25,
 * ImportantMomentsStore.swift:184-190). iOS's `openAuthSessionAsync` does the same. On Android it is a
 * polyfill: the redirect arrives as an ordinary deep link, so Expo Router ALSO sees it and, with no
 * route of that name, showed "Unmatched Route" — and the polyfill can resolve `dismiss` first, because
 * the app turning active races the link.
 *
 * So the links are caught in `app/+native-intent.tsx` and parked here:
 *
 * - While the session that asked for one is open, the router is told not to navigate at all, and the
 *   session reads the parked callback if the polyfill lost the race (`takeOAuthCallback`).
 * - With no session open — Android killed the app while the browser was up — the router is sent to
 *   the screen Swift's session returns to, and that screen consumes the callback on mount
 *   (`useOAuthCallback`), refreshes, and shows Swift's message.
 */

export type OAuthCallbackKind = 'calendar' | 'moments-email';

/** The screen each flow is started from and stays on (ProfileView.swift:332-348, MomentEditor.swift:228). */
export const OAUTH_LANDING: Record<OAuthCallbackKind, string> = {
  calendar: '/account/settings',
  'moments-email': '/moments/settings',
};

const HOSTS: Record<string, OAuthCallbackKind> = {
  'calendar-connected': 'calendar',
  'moments-email': 'moments-email',
};

/** The callback kind for a `nexdo://` URL, or `null` for anything else. Accepts `nexdo:///host` too. */
export function oauthCallbackKind(url: string): OAuthCallbackKind | null {
  const match = /^nexdo:\/\/\/?([^/?#]*)/i.exec(url);
  return match ? (HOSTS[match[1].toLowerCase()] ?? null) : null;
}

const parked: Partial<Record<OAuthCallbackKind, string>> = {};
const open = new Set<OAuthCallbackKind>();
const listeners = new Set<(kind: OAuthCallbackKind) => void>();

/** Marks a session of `kind` as open until the returned function is called. */
export function beginOAuthSession(kind: OAuthCallbackKind): () => void {
  open.add(kind);
  return () => {
    open.delete(kind);
  };
}

export function oauthSessionOpen(kind: OAuthCallbackKind): boolean {
  return open.has(kind);
}

/** Parks a callback URL for whoever handles `kind` next, replacing an older one. */
export function deliverOAuthCallback(kind: OAuthCallbackKind, url: string): void {
  parked[kind] = url;
  listeners.forEach((listener) => listener(kind));
}

/** Removes and returns the parked callback for `kind`, if any. */
export function takeOAuthCallback(kind: OAuthCallbackKind): string | null {
  const url = parked[kind] ?? null;
  delete parked[kind];
  return url;
}

/**
 * The parked callback for `kind`, waiting up to `timeoutMs` for one to arrive. For the Android
 * polyfill, which can report `dismiss` a moment before the redirect's deep link is delivered.
 */
export function waitForOAuthCallback(kind: OAuthCallbackKind, timeoutMs: number): Promise<string | null> {
  const ready = takeOAuthCallback(kind);
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve) => {
    const listener = (delivered: OAuthCallbackKind) => {
      if (delivered !== kind) return;
      clearTimeout(timer);
      listeners.delete(listener);
      resolve(takeOAuthCallback(kind));
    };
    const timer = setTimeout(() => {
      listeners.delete(listener);
      resolve(takeOAuthCallback(kind));
    }, timeoutMs);
    listeners.add(listener);
  });
}

/** How long a session that came back `dismiss` waits for a late redirect before calling it cancelled. */
export const LATE_CALLBACK_MS = 1500;

/**
 * `redirectSystemPath` for the callback links: park the URL, then stay put if a session is open (it
 * will read it) or a mounted screen already took it; otherwise land on the flow's screen, which takes
 * it on mount. Any other path is returned unchanged.
 */
export function redirectOAuthCallback(path: string): string | null {
  const kind = oauthCallbackKind(path);
  if (!kind) return path;
  deliverOAuthCallback(kind, path);
  return oauthSessionOpen(kind) || parked[kind] === undefined ? null : OAUTH_LANDING[kind];
}

/**
 * For the flow's own screen: handles a callback parked before it mounted, or delivered while it is
 * showing with no session open. Callbacks for an open session are left to that session.
 */
export function useOAuthCallback(kind: OAuthCallbackKind, handle: (url: string) => void): void {
  const handler = useRef(handle);
  // Declared first, so it runs before the effect below on mount.
  useEffect(() => {
    handler.current = handle;
  });
  useEffect(() => {
    const consume = () => {
      if (oauthSessionOpen(kind)) return;
      const url = takeOAuthCallback(kind);
      if (url) handler.current(url);
    };
    consume();
    const listener = (delivered: OAuthCallbackKind) => {
      if (delivered === kind) consume();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [kind]);
}

/** Test-only: forget every parked callback and open session. */
export function resetOAuthCallbacks(): void {
  (Object.keys(parked) as OAuthCallbackKind[]).forEach((kind) => delete parked[kind]);
  open.clear();
  listeners.clear();
}
