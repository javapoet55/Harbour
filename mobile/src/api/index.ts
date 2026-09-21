import { getApiUrl } from '../config';
import { createApiClient, type ApiClient } from './client';
import type {
  AppleAuthResponse,
  AssistantRequest,
  CalendarConnectionsResponse,
  CalendarSyncResponse,
  ProactiveNextResponse,
  ProfileSettingsInput,
  ProtectedTimeReceipt,
  ProtectedTimeResponse,
  SettingsResponse,
  AssistantTurn,
  ProjectInput,
  ProjectResponse,
  ProjectsResponse,
  Agenda,
  CalendarEventInput,
  CalendarEventResponse,
  DoNowResponse,
  ScheduleIntelligenceResponse,
  WeeklySummary,
  TaskCreateInput,
  TaskResponse,
  CodeDeliveryResponse,
  LoginResponse,
  PasswordResetResponse,
  ProfileResponse,
  RegistrationResponse,
  TasksResponse,
  VoiceUsage,
  VoiceUsageInput,
} from './types';

export * from './client';
export type * from './types';

let instance: ApiClient | undefined;
let signedOutHandler: (() => void) | undefined;

/**
 * Register the app-wide reaction to a 401 from any request. `app/_layout.tsx` sets it once, so a
 * session that ends mid-session signs the app out wherever the request came from.
 */
export function onSignedOut(handler: () => void): void {
  signedOutHandler = handler;
}

/** The app-wide client for the configured API origin, created on first use. */
export function getApi(): ApiClient {
  instance ??= createApiClient({ baseUrl: getApiUrl(), onSignedOut: () => signedOutHandler?.() });
  return instance;
}

/** Test seam: drop the memoised client so the next getApi() rebuilds it. */
export function resetApi(): void {
  instance = undefined;
  signedOutHandler = undefined;
}

/**
 * The auth endpoints, matching `AppModel` (ios/App/NexdoApp.swift:156–216). Every one of them passes
 * `signedOutOn401: false`: on these routes a 401 means the credentials were wrong, not that a session
 * expired, so it must not trigger the app-wide sign-out.
 */
export const endpoints = {
  login: (email: string, password: string, client: ApiClient = getApi()) =>
    client.post<LoginResponse>('/api/auth/login', { email, password }, { signedOutOn401: false }),

  register: (name: string, email: string, password: string, client: ApiClient = getApi()) =>
    client.post<RegistrationResponse>('/api/auth/register', { name, email, password }, { signedOutOn401: false }),

  verifyEmail: (email: string, code: string, client: ApiClient = getApi()) =>
    client.post<{ ok: boolean }>('/api/auth/verify-email', { email, code }, { signedOutOn401: false }),

  resendVerification: (email: string, client: ApiClient = getApi()) =>
    client.post<CodeDeliveryResponse>('/api/auth/verify-email/resend', { email }, { signedOutOn401: false }),

  passwordResetRequest: (email: string, client: ApiClient = getApi()) =>
    client.post<PasswordResetResponse>('/api/auth/password-reset/request', { email }, { signedOutOn401: false }),

  passwordResetConfirm: (email: string, code: string, password: string, client: ApiClient = getApi()) =>
    client.post<{ ok: boolean }>('/api/auth/password-reset/confirm', { email, code, password }, { signedOutOn401: false }),

  /**
   * Body shape from src/app/api/auth/apple/route.ts and `AppModel.loginWithApple`
   * (NexdoApp.swift:209–216): the authorization CODE and the RAW nonce, not the identity token.
   */
  apple: (
    input: { authorizationCode: string; rawNonce: string; givenName?: string; familyName?: string },
    client: ApiClient = getApi(),
  ) => client.post<AppleAuthResponse>('/api/auth/apple', input, { signedOutOn401: false }),

  // MARK: Tasks
  //
  // Swift fetches the WHOLE list once (`AppModel.loadTasks`, NexdoApp.swift:315) and filters it on the
  // device through `TaskQuery`; it never passes the server's q/status/priority/energy/due parameters.
  // `src/lib/taskQuery.ts` is that filter. Keeping it client-side is what makes the date-pill counts
  // possible: every pill's count comes from one pass over the same array.
  tasks: (client: ApiClient = getApi()) => client.get<TasksResponse>('/api/tasks'),

  createTask: (input: TaskCreateInput, client: ApiClient = getApi()) => client.post<TaskResponse>('/api/tasks', input),

  /**
   * Every task write goes through PATCH. The server refuses a body that mixes `projectId` with a
   * status or schedule change (src/app/api/tasks/[id]/route.ts:26-28), which is why `TaskDraft`
   * splits its edits into a details body and a schedule body.
   */
  updateTask: (id: string, body: Record<string, unknown>, client: ApiClient = getApi()) =>
    client.patch<TaskResponse>(`/api/tasks/${encodeURIComponent(id)}`, body),

  /** `AppModel.complete` (NexdoApp.swift:518): a toggle, not a one-way action. */
  setTaskStatus: (id: string, status: string, client: ApiClient = getApi()) =>
    client.patch<TaskResponse>(`/api/tasks/${encodeURIComponent(id)}`, { status }),

  /** Deletion is a CANCELLED status, which the server soft-deletes (tasks/[id]/route.ts:62-67). */
  deleteTask: (id: string, client: ApiClient = getApi()) =>
    client.patch<TaskResponse>(`/api/tasks/${encodeURIComponent(id)}`, { status: 'CANCELLED' }),

  // MARK: Projects

  projects: (client: ApiClient = getApi()) => client.get<ProjectsResponse>('/api/projects'),

  createProject: (input: ProjectInput, client: ApiClient = getApi()) => client.post<ProjectResponse>('/api/projects', input),

  updateProject: (id: string, input: ProjectInput, client: ApiClient = getApi()) =>
    client.patch<ProjectResponse>(`/api/projects/${encodeURIComponent(id)}`, input),

  deleteProject: (id: string, client: ApiClient = getApi()) =>
    client.del<{ ok: boolean }>(`/api/projects/${encodeURIComponent(id)}`),

  // MARK: Today

  /**
   * `AppModel.refreshAgenda` uses `/api/agenda?days=5` (NexdoApp.swift:369); the calendar asks for a
   * range with `calendarAgenda(from:days:)` (`:431`).
   */
  agenda: (days = 5, from?: string, client: ApiClient = getApi()) =>
    client.get<Agenda>(`/api/agenda?days=${days}${from ? `&from=${encodeURIComponent(from)}` : ''}`),

  /**
   * `AppModel.recommendDoNow` (NexdoApp.swift:603-609).
   *
   * There is NO do-now endpoint: Swift asks the ASSISTANT a question in prose and reads the
   * `executive` field off the turn. The ranking is entirely server-side.
   */
  doNow: (minutes: number | null, client: ApiClient = getApi()) =>
    client.post<DoNowResponse>('/api/assistant', {
      transcript: minutes === null ? 'What should I do next?' : `I have ${minutes} minutes free. What should I do?`,
    }),

  // MARK: Ask AI

  /**
   * `AppModel.ask(_:accept:)` (NexdoApp.swift:693-711) — `POST /api/assistant`.
   *
   * A SINGLE JSON response, not a stream: `src/app/api/assistant/route.ts:22` returns
   * `NextResponse.json(...)`. There is no SSE and no apply/approve route — approving a proposal is
   * the same endpoint with `confirmActionId` set, and rejecting it is the same endpoint with
   * `rejectActionId`. The 50s ceiling matches Swift's own assistant timeout budget.
   *
   * Optional fields are omitted rather than sent as null, because `assistantRequestSchema`
   * (src/lib/executive-contract.ts:35-41) declares them `.optional()`, not nullable.
   */
  assistant: (request: AssistantRequest, client: ApiClient = getApi()) =>
    client.post<AssistantTurn>(
      '/api/assistant',
      {
        transcript: request.transcript,
        ...(request.contextActionId ? { contextActionId: request.contextActionId } : {}),
        ...(request.confirmActionId ? { confirmActionId: request.confirmActionId } : {}),
        ...(request.rejectActionId ? { rejectActionId: request.rejectActionId } : {}),
      },
      { timeoutMs: 50_000 },
    ),

  // MARK: Calendar

  /**
   * `AppModel.createCalendarEvent` (NexdoApp.swift:456-468). Goes through the schedule-warning retry,
   * exactly like task writes.
   */
  createCalendarEvent: (input: CalendarEventInput, client: ApiClient = getApi()) =>
    client.post<CalendarEventResponse>('/api/calendar/events', input),

  /** `AppModel.refreshScheduleIntelligence` (NexdoApp.swift:377-401). */
  scheduleIntelligence: (client: ApiClient = getApi()) =>
    client.get<ScheduleIntelligenceResponse>('/api/schedule-intelligence?scope=today'),

  /** `AppModel.weeklySummary(start:)` (NexdoApp.swift:712-714). */
  weeklySummary: (start: string, client: ApiClient = getApi()) =>
    client.get<WeeklySummary>(`/api/weekly-summary?start=${encodeURIComponent(start)}`),

  // MARK: Next action and protected time

  /**
   * `AppModel.refreshNextAction()` (ios/App/NexdoApp.swift:24-38): the persistent next-action card.
   * It is the SAME route as schedule intelligence, with an `operation` in the body.
   */
  nextAction: (client: ApiClient = getApi()) =>
    client.post<ProactiveNextResponse>('/api/schedule-intelligence', { operation: 'next-action' }, { timeoutMs: 20_000 }),

  /** `dismissPersistentNext()` (NexdoApp.swift:62-71). */
  dismissNextAction: (contextActionId: string, client: ApiClient = getApi()) =>
    client.post<{ ok?: boolean }>('/api/schedule-intelligence', { operation: 'dismiss-next-action', contextActionId }),

  /** `refreshNextAction()`'s second request (NexdoApp.swift:35-36), which is allowed to fail quietly. */
  protectedTime: (client: ApiClient = getApi()) =>
    client.get<ProtectedTimeResponse>('/api/protected-time', { timeoutMs: 20_000 }),

  /** `respondToProtectedTime(_:accept:)` (NexdoApp.swift:46-61). */
  respondToProtectedTime: (
    input: { accept: boolean; taskId: string; startAt: string; expectedUpdatedAt: string },
    client: ApiClient = getApi(),
  ) =>
    client.post<ProtectedTimeReceipt>('/api/protected-time', {
      action: input.accept ? 'accept' : 'dismiss',
      taskId: input.taskId,
      startAt: input.startAt,
      expectedUpdatedAt: input.expectedUpdatedAt,
    }),

  // MARK: Account

  /**
   * `AppModel.saveProfileSettings(_:)` (NexdoApp.swift:234-240) and
   * `synchronizeDeviceTimeZone()` (`:225-233`), which PATCH the SAME route with different subsets.
   *
   * There is no /api/profile and no per-field endpoint: every setting on the screen goes to
   * PATCH /api/settings, whose schema (src/app/api/settings/route.ts:34-42) makes every key optional.
   */
  updateSettings: (input: Partial<ProfileSettingsInput>, client: ApiClient = getApi()) =>
    client.patch<SettingsResponse>('/api/settings', input, { timeoutMs: 15_000 }),

  /**
   * `AppModel.saveProfilePhoto(_:)` (NexdoApp.swift:241-272).
   *
   * NOT multipart and not a separate upload route: the photo is a `data:image/jpeg;base64,…` STRING
   * on the same PATCH, and `null` removes it. The 30s timeout is Swift's.
   */
  updatePhoto: (photo: string | null, client: ApiClient = getApi()) =>
    client.patch<SettingsResponse>('/api/settings', { photo }, { timeoutMs: 30_000 }),

  /** `AppModel.syncProfileCalendars()` (NexdoApp.swift:286-295). */
  syncCalendars: (client: ApiClient = getApi()) => client.post<CalendarSyncResponse>('/api/calendar/sync'),

  /** `loadCalendarConnections()` (NexdoApp.swift:309-318). */
  calendarConnections: (client: ApiClient = getApi()) => client.get<CalendarConnectionsResponse>('/api/calendar/connections'),

  /** `setCalendarWrites(id:enabled:)` (NexdoApp.swift:319-324): the "Add my scheduled tasks here" toggle. */
  setCalendarWrites: (id: string, writeEnabled: boolean, client: ApiClient = getApi()) =>
    client.patch<{ ok: boolean }>('/api/calendar/connections', { id, writeEnabled }),

  /** `disconnectCalendar(id:)` (NexdoApp.swift:325-331). The server deletes the imported events with it. */
  disconnectCalendar: (id: string, client: ApiClient = getApi()) =>
    client.del<{ ok: boolean }>(`/api/calendar/connections?id=${encodeURIComponent(id)}`),

  /**
   * `calendarConnectURL(provider:)` (NexdoApp.swift:293-304): a short-lived token, issued over the
   * authenticated API session, that the OAuth start route accepts in place of the session cookie an
   * in-app browser cannot send (src/app/api/calendar/oauth/[provider]/connect-token/route.ts).
   */
  calendarConnectToken: (provider: string, client: ApiClient = getApi()) =>
    client.post<{ token: string }>(`/api/calendar/oauth/${encodeURIComponent(provider)}/connect-token`),

  /**
   * `AppModel.refreshVoiceUsage()` (ios/App/NexdoApp.swift:529-532): this month's receipt, 15s.
   * `GET /api/voice/usage` (src/app/api/voice/usage/route.ts:10-15).
   */
  voiceUsage: (client: ApiClient = getApi()) => client.get<VoiceUsage>('/api/voice/usage', { timeoutMs: 15_000 }),

  /**
   * `AppModel.recordVoiceUsage(sessionID:duration:)` (NexdoApp.swift:534-539), 15s.
   * `POST /api/voice/usage` (route.ts:17-23) answers with the updated receipt.
   */
  recordVoiceUsage: (input: VoiceUsageInput, client: ApiClient = getApi()) =>
    client.post<VoiceUsage>('/api/voice/usage', input, { timeoutMs: 15_000 }),

  /** `AppModel.deleteAccount()` (NexdoApp.swift:739-744). */
  deleteAccount: (client: ApiClient = getApi()) => client.del<{ ok: boolean }>('/api/account'),

  logout: (client: ApiClient = getApi()) => client.post<{ ok: boolean }>('/api/auth/logout', undefined, { signedOutOn401: false }),
  me: (client: ApiClient = getApi()) => client.get<ProfileResponse>('/api/me'),
};
