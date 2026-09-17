// Port of ios/Sources/NexdoCore/APIClient.swift. Messages and error precedence match the Swift client;
// error codes match src/lib/http.ts and the auth routes on the server.

export type ApiErrorCode =
  | 'EMAIL_NOT_VERIFIED'
  | 'SCHEDULE_WARNING'
  | 'SIGNED_OUT'
  | 'INSECURE_URL'
  | 'INVALID_RESPONSE'
  | 'NETWORK';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: ApiErrorCode;
  /** Present for SCHEDULE_WARNING: the conflicts to show before retrying with `allowScheduleConflict: true`. */
  readonly warnings?: string[];
  /** Present for EMAIL_NOT_VERIFIED: the account email the verification code was sent to. */
  readonly email?: string;

  constructor(init: { status: number; message: string; code?: ApiErrorCode; warnings?: string[]; email?: string }) {
    super(init.message);
    Object.setPrototypeOf(this, ApiError.prototype);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.warnings = init.warnings;
    this.email = init.email;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export const messages = {
  insecureUrl: 'A secure server address is required.',
  signedOut: 'Your session has expired. Please sign in again.',
  invalidResponse: 'The server returned an unexpected response. Please try again later.',
  network: 'Nexdo could not reach the server. Check your connection and try again.',
  response: (status: number) =>
    status === 409
      ? 'Your schedule changed or could not be refreshed. Ask for a fresh plan before making changes.'
      : `The request could not be completed (${status}). Refresh to check the current state before retrying.`,
};

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  /** Map 401 and redirects to /login to SIGNED_OUT. Turn off for sign-in, where 401 means wrong credentials. */
  signedOutOn401?: boolean;
  timeoutMs?: number;
};

/**
 * One request/response pair, reported to `onExchange` for diagnostics.
 *
 * Phase 10 removed the development screen that consumed this, but the hook stays: it is the only
 * place a caller can see the status, the Set-Cookie visibility and the timing of a request, and it
 * costs nothing when nobody subscribes.
 */
export type Exchange = {
  method: HttpMethod;
  path: string;
  status: number | null;
  setCookieVisible: boolean;
  bodyText: string;
  durationMs: number;
  error?: string;
};

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  onExchange?: (exchange: Exchange) => void;
  /**
   * Called whenever any request finds the session gone, before the SIGNED_OUT error is thrown.
   * The app uses it to clear the session store from one place, so a 401 on any screen signs out.
   * Requests that opt out with `signedOutOn401: false` (sign-in, sign-up) never reach it.
   */
  onSignedOut?: () => void;
};

export type ApiClient = ReturnType<typeof createApiClient>;

// Origin only: https, a host, an optional port, no credentials, path, query or fragment (same rules as APIClient.init).
const BASE_URL = /^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/?$/;

export function normalizeBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!BASE_URL.test(value)) throw new ApiError({ status: 0, code: 'INSECURE_URL', message: messages.insecureUrl });
  return value.replace(/\/$/, '');
}

type ServerError = { error?: unknown; code?: unknown; warnings?: unknown; email?: unknown };

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));

  async function request<T>(path: string, { method = 'GET', body, signedOutOn401 = true, timeoutMs = 60_000 }: RequestOptions = {}): Promise<T> {
    // A path is always appended to the validated origin, so it can never point at another host.
    if (!path.startsWith('/api/') || /[\\\s]/.test(path)) {
      throw new ApiError({ status: 0, code: 'INSECURE_URL', message: messages.insecureUrl });
    }
    const url = baseUrl + path;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    // Serialised once, so the string logged below is the exact one handed to fetch.
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);

    // Development builds only, and never under Jest, where it is noise rather than diagnostics.
    if (__DEV__ && process.env.NODE_ENV !== 'test') {
      // The bytes actually leaving the phone, in the Metro terminal. Redacted from the SAME string
      // that fetch receives, so what is printed still reflects the real serialisation (a `+` that
      // survived, a field name that did not) rather than a second, possibly divergent, stringify.
      const logged = serializedBody === undefined ? '' : ` ${redactSecrets(serializedBody)}`;
      console.log(`[api] -> ${method} ${url}${logged}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    let response: Response;
    let text: string;
    try {
      response = await doFetch(url, {
        method,
        headers,
        body: serializedBody,
        credentials: 'include',
        // API routes never redirect. React Native's iOS networking may still follow redirects, so the
        // response URL is checked below as well.
        redirect: 'manual',
        signal: controller.signal,
      });
      text = await response.text();
    } catch (cause) {
      options.onExchange?.({ method, path, status: null, setCookieVisible: false, bodyText: '', durationMs: Date.now() - started, error: String(cause) });
      throw new ApiError({ status: 0, code: 'NETWORK', message: messages.network });
    } finally {
      clearTimeout(timer);
    }

    options.onExchange?.({
      method,
      path,
      status: response.status,
      setCookieVisible: response.headers.get('set-cookie') !== null,
      bodyText: text,
      durationMs: Date.now() - started,
    });

    if (signedOutOn401 && (response.status === 401 || isLoginRedirect(response, baseUrl))) {
      options.onSignedOut?.();
      throw new ApiError({ status: 401, code: 'SIGNED_OUT', message: messages.signedOut });
    }

    if (response.status < 200 || response.status >= 300) {
      const payload = parseJson<ServerError>(text);
      if (payload && typeof payload.error === 'string' && payload.error.length > 0) {
        if (payload.code === 'SCHEDULE_WARNING' && isStringArray(payload.warnings)) {
          throw new ApiError({ status: response.status, code: 'SCHEDULE_WARNING', message: payload.warnings.join('\n\n'), warnings: payload.warnings });
        }
        if (payload.code === 'EMAIL_NOT_VERIFIED') {
          throw new ApiError({
            status: response.status,
            code: 'EMAIL_NOT_VERIFIED',
            message: payload.error,
            email: typeof payload.email === 'string' ? payload.email : undefined,
          });
        }
        throw new ApiError({ status: response.status, message: payload.error });
      }
      throw new ApiError({ status: response.status, message: messages.response(response.status) });
    }

    if (response.redirected) {
      // A redirect we could not stop that did not land on /login: the body is not the API response.
      throw new ApiError({ status: response.status, code: 'INVALID_RESPONSE', message: messages.invalidResponse });
    }

    const data = parseJson<T>(text);
    if (data === undefined) throw new ApiError({ status: response.status, code: 'INVALID_RESPONSE', message: messages.invalidResponse });
    return data;
  }

  return {
    baseUrl,
    request,
    get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'POST', body }),
    patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'PATCH', body }),
    del: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'DELETE' }),
  };
}

/**
 * Older deployments redirect expired sessions to /login. Recognise that without following it:
 * a 3xx whose Location is /login on the same origin, a browser opaque redirect (Location hidden),
 * or a followed redirect whose final URL is /login on the same origin.
 */
function isLoginRedirect(response: Response, origin: string): boolean {
  if (response.type === 'opaqueredirect') return true;
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    return location !== null && sameOriginPath(location, origin) === '/login';
  }
  return response.redirected && sameOriginPath(response.url, origin) === '/login';
}

function sameOriginPath(location: string, origin: string): string | null {
  let path: string;
  if (location.startsWith(origin + '/')) path = location.slice(origin.length);
  else if (location.startsWith('/') && !location.startsWith('//')) path = location;
  else return null;
  return path.split(/[?#]/)[0];
}

/**
 * Credential-bearing fields, blanked before a request body reaches the console. Covers every auth
 * route: passwords (login, register, password-reset/confirm), the six-digit verify and reset codes,
 * and the Sign in with Apple authorization code and raw nonce.
 */
/** The value of any secret-bearing key, including one containing escaped quotes. */
const SECRET_VALUE = /"(password|newPassword|code|token|authorizationCode|rawNonce)":"(?:[^"\\]|\\.)*"/g;

/** Replace the value of any secret-bearing key in a serialised JSON body with `"***"`. */
export function redactSecrets(serialized: string): string {
  return serialized.replace(SECRET_VALUE, '"$1":"***"');
}

function parseJson<T>(text: string): T | undefined {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
