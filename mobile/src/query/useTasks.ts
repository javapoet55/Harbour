import { useQuery } from '@tanstack/react-query';

import { endpoints } from '../api';
import { queryKeys } from './keys';

// Stub for Phase 3: no filters yet, and no stale-response protection beyond what TanStack Query provides.
export function useTasks() {
  return useQuery({
    queryKey: queryKeys.tasks.list(),
    queryFn: () => endpoints.tasks(),
  });
}
