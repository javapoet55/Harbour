import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { calendarEventApi, type CalendarEventEdit, type CalendarEventResponse } from '../api/calendarEvent';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

/**
 * Event Details' data (ios/App/CalendarEventDetailsView.swift:103, `:131-160`). Every change ends with
 * Swift's `onChange()`, which reloads the Calendar agenda; Add to Tasks also reloads the tasks
 * (`model.refresh()`).
 */

export function useCalendarEvent(id: string | null | undefined) {
  const owner = useSession((state) => state.profile?.id) ?? '';
  return useQuery({
    queryKey: queryKeys.calendar.event(owner, id ?? ''),
    queryFn: () => calendarEventApi.get(id!),
    enabled: owner !== '' && !!id,
  });
}

/** Mark Complete / Mark Incomplete (`setCompletion`, :137-141). */
export function useSetEventCompletion() {
  const owner = useSession((state) => state.profile?.id) ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => calendarEventApi.setCompleted(id, completed),
    onSuccess: (response: CalendarEventResponse) => {
      queryClient.setQueryData(queryKeys.calendar.event(owner, response.event.id), response);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
    },
  });
}

/** Add to Tasks (`addTask`, :143-149): "Added to your tasks." */
export function useAddEventTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calendarEventApi.addTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
    },
  });
}

/** The details editor's Save (`update(_:)`, :131-136): the event comes back with any warnings. */
export function useUpdateCalendarEvent() {
  const owner = useSession((state) => state.profile?.id) ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, edit }: { id: string; edit: CalendarEventEdit }) => calendarEventApi.update(id, edit),
    onSuccess: (response: CalendarEventResponse) => {
      queryClient.setQueryData(queryKeys.calendar.event(owner, response.event.id), response);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
    },
  });
}

/** Delete Event (`deleteEvent()`, :149-158). */
export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calendarEventApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
    },
  });
}
