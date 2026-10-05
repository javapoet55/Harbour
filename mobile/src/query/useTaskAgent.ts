import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { taskAgentApi, type TaskAgentEnvelope, type TaskAgentUpdate } from '../api/taskAgent';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

/**
 * A task's business research. Swift's card reloads every 4 s while a run is QUEUED or RUNNING
 * (TaskAgentCard.swift:150-178), and every update posts `taskAgentChanged` so the Today card and the
 * Nexdo Action screen reload too (NexdoApp.swift:558); here that notification is the shared query.
 */

/** `TaskAgentCard` polls while the server is still searching. */
export const TASK_AGENT_POLL_MS = 4000;

export function isSearching(envelope: TaskAgentEnvelope | undefined | null): boolean {
  const status = envelope?.run?.status;
  return status === 'QUEUED' || status === 'RUNNING';
}

export function useTaskAgent(taskId: string | null | undefined, options: { poll?: boolean } = {}) {
  const owner = useSession((state) => state.profile?.id) ?? '';
  return useQuery({
    queryKey: queryKeys.taskAgent.task(owner, taskId ?? ''),
    queryFn: () => taskAgentApi.load(taskId!),
    enabled: owner !== '' && !!taskId,
    retry: false,
    refetchInterval: options.poll ? (query) => (isSearching(query.state.data) ? TASK_AGENT_POLL_MS : false) : false,
  });
}

export function useUpdateTaskAgent(taskId: string) {
  const owner = useSession((state) => state.profile?.id) ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskAgentUpdate) => taskAgentApi.update(taskId, input),
    onSuccess: (envelope) => queryClient.setQueryData(queryKeys.taskAgent.task(owner, taskId), envelope),
  });
}
