import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { endpoints, type NexdoTask } from '../api';
import { followUpApi, followUpScheduleBody, FUTURE_FOLLOW_UP_REQUIRED } from '../api/followUp';
import type { FollowUpEnvelope, FollowUpPreparation } from '../features/followUp/model';
import { useSession } from '../store/session';
import { queryKeys } from './keys';
import { replaceTask, scheduleRequest, type ScheduleConflict } from './useTasks';

/**
 * Follow-up preparation's data (ios/App/FollowUpPreparationView.swift:101-127). Per account, like
 * every other per-user query, so a sign-out never shows the next account the last one's notes.
 */
export function useFollowUpPreparation(taskId: string | null | undefined) {
  const owner = useSession((state) => state.profile?.id) ?? '';
  return useQuery({
    queryKey: queryKeys.followUp(owner, taskId ?? ''),
    queryFn: () => followUpApi.load(taskId!),
    enabled: owner !== '' && !!taskId,
  });
}

/** What happens after a successful save: `save(then:)`'s operation (:110-127). */
export type FollowUpThen = 'complete' | 'schedule' | null;

export type SaveFollowUpInput = {
  task: NexdoTask;
  revision: number;
  preparation: FollowUpPreparation;
  then: FollowUpThen;
  /** "Set or change follow-up time" is on (`useSchedule`), which schedules even on a plain save. */
  reschedule: boolean;
  /** The chosen follow-up time, epoch ms. */
  nextAt: number;
};

/**
 * `save(then:)` (:110-127): save the preparation, then complete the task ("Record and complete task")
 * or move it to the next follow-up time. The order is Swift's: the preparation is saved FIRST, so a
 * failed reschedule still leaves the outcome recorded, and the revision it returned is cached so the
 * retry sends the new one. The outcome id is the screen's to keep (`recordOutcome`).
 */
export function useSaveFollowUp({ onConflict, now = Date.now }: { onConflict: (conflict: ScheduleConflict) => void; now?: () => number }) {
  const owner = useSession((state) => state.profile?.id) ?? '';
  const queryClient = useQueryClient();
  return useMutation<FollowUpEnvelope, Error, SaveFollowUpInput>({
    mutationFn: async ({ task, revision, preparation, then, reschedule, nextAt }) => {
      const saved = await followUpApi.save(task.id, { revision, preparation });
      queryClient.setQueryData(queryKeys.followUp(owner, task.id), saved);
      if (then === 'complete') {
        const response = await scheduleRequest((body) => endpoints.updateTask(task.id, body), { status: 'COMPLETED' }, onConflict);
        replaceTask(queryClient, response.task);
        // Completion can create the next occurrence (`changeTaskStatus`, NexdoApp.swift:736-739).
        if (task.recurrence) void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
      } else if (then === 'schedule' || reschedule) {
        if (!(nextAt > now())) throw new Error(FUTURE_FOLLOW_UP_REQUIRED);
        const response = await scheduleRequest((body) => followUpApi.schedule(task.id, body), followUpScheduleBody(nextAt, task.durationMin), onConflict);
        replaceTask(queryClient, response.task);
      }
      return saved;
    },
    onSuccess: (_saved, { then, reschedule }) => {
      if (then !== null || reschedule) void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
    },
  });
}
