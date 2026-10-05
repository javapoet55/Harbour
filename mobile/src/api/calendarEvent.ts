import { getApi, type ApiClient } from './index';
import type { CalendarEvent } from './types';

/**
 * Event Details (ios/App/CalendarEventDetailsView.swift:16-19, `:103`, `:131-160`) against
 * src/app/api/calendar/events/[id]/route.ts and `…/task/route.ts`.
 *
 * Completion (`{ completed }`) works on every event the user can see, imported ones included, and is
 * kept in Nexdo only. Editing and deleting are for Nexdo's own events (`source === "harbor"` with no
 * connection); any other answers 404.
 */

/** `EventResponse` (:16). `warnings` come back from an edit that could not reach a connected calendar. */
export type CalendarEventResponse = { event: CalendarEvent; warnings?: string[] | null; success?: boolean; message?: string };
/** `MutationResponse` (:17). */
export type CalendarEventMutation = { success: boolean; warnings?: string[] | null; message?: string };

/** The edit body (route.ts:10, strict). Instants are ISO 8601 with an offset. */
export type CalendarEventEdit = { title?: string; notes?: string; location?: string; startAt?: string; endAt?: string };

function path(id: string): string {
  return `/api/calendar/events/${encodeURIComponent(id)}`;
}

export const calendarEventApi = {
  get: (id: string, client: ApiClient = getApi()) => client.get<CalendarEventResponse>(path(id)),
  /** `setCompletion(_:)` (:137-141): Mark Complete / Mark Incomplete. Re-completing keeps the first time. */
  setCompleted: (id: string, completed: boolean, client: ApiClient = getApi()) => client.patch<CalendarEventResponse>(path(id), { completed }),
  /** A retime needs a future start and an end within seven days. */
  update: (id: string, edit: CalendarEventEdit, client: ApiClient = getApi()) => client.patch<CalendarEventResponse>(path(id), edit),
  remove: (id: string, client: ApiClient = getApi()) => client.del<CalendarEventMutation>(path(id)),
  /** Add to Tasks: idempotent per event, so a second tap reuses the same task. */
  addTask: (id: string, client: ApiClient = getApi()) => client.post<{ success: boolean; taskId: string }>(`${path(id)}/task`),
};
