import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { isApiError } from '../api/client';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

/** Client errors (4xx) and invalid configuration will not succeed on retry; network and 5xx errors might. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error)) {
    if (error.code === 'INSECURE_URL' || error.code === 'INVALID_RESPONSE') return false;
    if (error.status >= 400 && error.status < 500) return false;
  }
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  // Any request that finds the session gone signs the app out, which sends the root gate back to sign-in.
  const handleError = (error: unknown) => {
    if (isApiError(error) && error.code === 'SIGNED_OUT') {
      useSession.getState().clear();
      queryClient.setQueryData(queryKeys.me(), null);
    }
  };
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
  return queryClient;
}
