import { getApi, type ApiClient } from './index';
import type { PomodoroSession } from '../features/pomodoro/model';

/**
 * Pomodoro history (src/app/api/pomodoro/route.ts, src/server/pomodoro/sessions.ts), read against
 * `PomodoroStore` (ios/App/PomodoroStore.swift:24-26, `:84`, `:105`).
 *
 * `owner` is the signed-in profile id. The server refuses any other with 403 "Account changed.", so a
 * request that outlives a sign-out can never write into the next account.
 */

/** `ListResponse` (PomodoroStore.swift:25): 100 per page, newest first; `nextCursor` is a session id. */
export type PomodoroPage = { sessions: PomodoroSession[]; nextCursor: string | null };

/** `SaveResponse` (PomodoroStore.swift:26): the stored session, which may be NEWER than the one sent. */
export type PomodoroSaved = { session: PomodoroSession };

export const pomodoroApi = {
  /** `GET /api/pomodoro?owner=&cursor=`. A cursor that is not a UUID is 400 "Invalid history cursor." */
  page: (owner: string, cursor?: string | null, client: ApiClient = getApi()) =>
    client.get<PomodoroPage>(`/api/pomodoro?owner=${encodeURIComponent(owner)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),

  /**
   * `PUT /api/pomodoro { ownerID, session }`. Compare-and-set on `revision`: a delayed write never
   * reverts a newer one. 400 "Invalid focus session." for a body over 4096 bytes or a session the
   * schema refuses (sessions.ts:4-21).
   */
  save: (owner: string, session: PomodoroSession, client: ApiClient = getApi()) =>
    client.put<PomodoroSaved>('/api/pomodoro', { ownerID: owner, session }),
};
