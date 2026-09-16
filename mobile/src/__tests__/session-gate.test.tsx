import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';

import { ApiError, createApiClient } from '../api/client';
import { queryKeys } from '../query/keys';
import { useSession } from '../store/session';

jest.mock('expo-router', () => {
  const { Text: RNText } = require('react-native');
  return {
    // Renders the destination so the gate's decision is assertable.
    Redirect: ({ href }: { href: string }) => <RNText testID="redirect">{href}</RNText>,
  };
});

const mockMe = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { me: (...args: unknown[]) => mockMe(...args) },
}));

import Index from '../../app/index';

const profile = { id: 'u1', name: 'Sri Ram', email: 'person@example.com', timeZone: 'Asia/Kolkata' };

async function renderGate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <Index />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('session gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ status: 'unknown', profile: null });
  });

  it('shows the splash while /api/me is undecided, not the sign-in screen', async () => {
    // Held open so the assertion happens mid-flight, then released so nothing outlives the test.
    let release: (value: { user: typeof profile }) => void = () => undefined;
    mockMe.mockReturnValue(new Promise<{ user: typeof profile }>((resolve) => {
      release = resolve;
    }));

    await renderGate();
    expect(screen.getByLabelText('Loading Nexdo')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();

    release({ user: profile });
    await waitFor(() => expect(screen.getByTestId('redirect')).toHaveTextContent('/today'));
  });

  it('routes to the tabs when /api/me returns a profile', async () => {
    mockMe.mockResolvedValue({ user: profile });
    await renderGate();
    await waitFor(() => expect(screen.getByTestId('redirect')).toHaveTextContent('/today'));
  });

  it('routes to sign-in when /api/me answers 401', async () => {
    mockMe.mockRejectedValue(new ApiError({ status: 401, code: 'SIGNED_OUT', message: 'Your session has expired. Please sign in again.' }));
    await renderGate();
    await waitFor(() => expect(screen.getByTestId('redirect')).toHaveTextContent('/sign-in'));
  });

  it('offers a retry when /api/me fails for a reason other than the session', async () => {
    mockMe.mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK', message: 'Nexdo could not reach the server.' }));
    await renderGate();
    await waitFor(() => expect(screen.getByText('Nexdo can’t reach the server')).toBeTruthy());
  });
});

describe('a 401 from any request', () => {
  beforeEach(() => useSession.setState({ status: 'signedIn', profile }));

  /** The handler app/_layout.tsx installs via `onSignedOut`, tested against the real client. */
  function installGateHandler(queryClient: QueryClient) {
    return () => {
      if (useSession.getState().status === 'signedOut') return;
      useSession.getState().clear();
      queryClient.setQueryData(queryKeys.me(), null);
    };
  }

  it('clears the session store and marks the app signed out', async () => {
    const queryClient = new QueryClient();
    const client = createApiClient({
      baseUrl: 'https://example.com',
      onSignedOut: installGateHandler(queryClient),
      fetch: async () => new Response('', { status: 401 }),
    });

    await expect(client.get('/api/tasks')).rejects.toMatchObject({ code: 'SIGNED_OUT' });

    expect(useSession.getState().status).toBe('signedOut');
    expect(useSession.getState().profile).toBeNull();
    // `me` seeded with null is what flips the gate to the auth group.
    expect(queryClient.getQueryData(queryKeys.me())).toBeNull();
  });

  it('is idempotent, so parallel 401s cannot loop the redirect', async () => {
    const queryClient = new QueryClient();
    const handler = jest.fn(installGateHandler(queryClient));
    const client = createApiClient({
      baseUrl: 'https://example.com',
      onSignedOut: handler,
      fetch: async () => new Response('', { status: 401 }),
    });

    await Promise.allSettled([client.get('/api/tasks'), client.get('/api/me'), client.get('/api/agenda')]);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(useSession.getState().status).toBe('signedOut');
  });

  it('is not triggered by a 401 from sign-in, where it only means wrong credentials', async () => {
    const queryClient = new QueryClient();
    const handler = jest.fn(installGateHandler(queryClient));
    const client = createApiClient({
      baseUrl: 'https://example.com',
      onSignedOut: handler,
      fetch: async () => new Response(JSON.stringify({ error: 'Invalid email or password.' }), { status: 401 }),
    });

    await expect(client.post('/api/auth/login', { email: 'a@b.com', password: 'x' }, { signedOutOn401: false })).rejects.toThrow(
      'Invalid email or password.',
    );

    expect(handler).not.toHaveBeenCalled();
    expect(useSession.getState().status).toBe('signedIn');
  });
});
