import { useQuery } from '@tanstack/react-query';

import { endpoints, isApiError, type Profile } from '../api';
import { queryKeys } from './keys';

/** The signed-in profile, `null` when there is no session, `undefined` while unknown. */
export function useMe() {
  return useQuery<Profile | null>({
    queryKey: queryKeys.me(),
    queryFn: async () => {
      try {
        const { user } = await endpoints.me();
        return user;
      } catch (error) {
        if (isApiError(error) && error.code === 'SIGNED_OUT') return null;
        throw error;
      }
    },
  });
}
