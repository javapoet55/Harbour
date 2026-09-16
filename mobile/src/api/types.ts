// Wire types ported from ios/Sources/NexdoCore/Models.swift (preferences from ProfileSettings.swift),
// compared with src/lib/types.ts in the web app.
//
// Conventions:
// - A Swift `Optional` decodes both a missing key and `null`, so it becomes `field?: T | null`.
// - Keys use the JSON names on the wire. Where Swift renames a key with CodingKeys, the Swift name is noted.
// - Where the web type and the Swift type disagree, the Swift shape (what the iPhone app relies on) is used and
//   the web difference is noted in a DIVERGENCE comment. Web-only fields the server sends are added as optional.
// - Presentation helpers in Models.swift (ProfileName, ServerDate, weather symbols) are logic, not types,
//   and are ported in the phase that needs them.

// MARK: Account

export type ProfilePreferences = {
  workStart: string;
  workEnd: string;
  quietStart: string;
  quietEnd: string;
  confirmationLevel: string;
  voiceEnabled: boolean;
  personalizationEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  morningSummary: boolean;
  eveningSummary: boolean;
  phoneNumber?: string | null;
  // DIVERGENCE: the web `PreferenceForm` also has `transcriptRetentionDays`; Swift does not decode it.
  // GET /api/me returns the whole preference row, so it is present on the wire.
  transcriptRetentionDays?: number;
};

export type NextActionPreference = {
  enabled: boolean;
  switchingThreshold: number;
};

/** GET /api/me → `user`. No web type exists; the shape comes from src/app/api/me/route.ts. */
export type Profile = {
  id: string;
  name: string;
  email: string;
  timeZone: string;
  photo?: string | null;
  preference?: ProfilePreferences | null;
  nextAction?: NextActionPreference | null;
};

export type ProfileResponse = { user: Profile };

/** POST /api/auth/login success body (src/app/api/auth/login/route.ts). Swift discards it and reloads /api/me. */
export type LoginResponse = { id: string; name: string; email: string };

export type PasswordResetResponse = { message: string; delivered: boolean };

/**
 * POST /api/auth/register success body (src/app/api/auth/register/route.ts).
 * Port of `RegistrationResponse` (ios/Sources/NexdoCore/EmailVerification.swift:3–7), which decodes
 * only the three fields the verify screen needs. `developmentCode` is present only when the server
 * runs outside production with email delivery mocked.
 */
export type RegistrationResponse = {
  id: string;
  name: string;
  email: string;
  emailVerificationRequired?: boolean;
  emailSent?: boolean;
  developmentCode?: string;
};

/**
 * POST /api/auth/verify-email/resend success body (src/app/api/auth/verify-email/resend/route.ts).
 * Port of `CodeDeliveryResponse` (ios/Sources/NexdoCore/EmailVerification.swift:9–12).
 */
export type CodeDeliveryResponse = { message: string; delivered: boolean };

/** POST /api/auth/apple success body (src/app/api/auth/apple/route.ts). */
export type AppleAuthResponse = { id: string; name: string; email: string };

// MARK: Tasks

export type TaskCategoryMetadata = { name: string };

export type TaskStep = {
  id: string;
  title: string;
  completedAt?: string | null;
  // DIVERGENCE: the web `AgendaTask.subtasks` items have no `sortOrder`; Swift requires it.
  sortOrder: number;
};

export type TaskRecurrence = {
  frequency: string;
  interval: number;
  // DIVERGENCE: the web `AgendaTask.recurrence` has only `frequency` and `interval`.
  byWeekday?: string | null;
  until?: string | null;
  count?: number | null;
};

export type NexdoTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  durationMin: number;
  notes?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
  category?: TaskCategoryMetadata | null;
  completedAt?: string | null;
  projectId?: string | null;
  energyLevel?: string | null;
  splittable?: boolean | null;
  critical?: boolean | null;
  minFocusMin?: number | null;
  timeZone?: string | null;
  subtasks?: TaskStep[] | null;
  recurrence?: TaskRecurrence | null;
  // DIVERGENCE: the web `AgendaTask` requires `createdAt` and has `waitingOn`; Swift decodes neither.
  createdAt?: string;
  waitingOn?: string | null;
};

export type TasksResponse = {
  tasks: NexdoTask[];
  // Swift keeps this optional (the required form is commented out in Models.swift); the server always sends it.
  timeZone?: string | null;
};

// MARK: Calendar and agenda

/** Matches the web `AgendaEvent`. */
export type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay?: boolean | null;
};

export type Agenda = {
  timeZone: string;
  // DIVERGENCE: the web `AgendaPayload.range` also has `from` and `to`.
  range: { days: string[]; from?: string; to?: string };
  tasks: NexdoTask[];
  events: CalendarEvent[];
  overdue: NexdoTask[];
  // DIVERGENCE: web-only lists on `AgendaPayload`; Swift does not decode them.
  waiting?: NexdoTask[];
  unscheduled?: NexdoTask[];
  important?: NexdoTask[];
};

// MARK: Weather (GET /api/weather, Open-Meteo field names)

export type WeatherResponse = {
  current: {
    temperature_2m: number; // Swift: temperature
    weather_code?: number | null; // Swift: weatherCode
  };
  daily?: {
    time: string[];
    weather_code: (number | null)[]; // Swift: weatherCode
    temperature_2m_max: (number | null)[]; // Swift: high
    temperature_2m_min: (number | null)[]; // Swift: low
    precipitation_probability_max: (number | null)[]; // Swift: rain
  } | null;
  timezone?: string | null;
};

// MARK: Schedule intelligence

export type ScheduleTimelineItem = {
  id: string;
  sourceId: string;
  kind: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  deadlineOnly: boolean;
  past: boolean;
};

export type ScheduleAttentionItem = {
  id: string;
  label: string;
  title: string;
  explanation: string;
  recommendedAction: string;
  kind: string;
  taskId?: string | null;
  taskIds?: string[] | null;
  requiredMinutes?: number | null;
  deadlineAt?: string | null;
};

export type ScheduleRecommendation = {
  title: string;
  explanation: string;
  additionalAdvice?: string | null;
  kind: string;
  taskId?: string | null;
};

export type ScheduleIntelligenceResponse = {
  today: {
    day: string;
    timeZone: string;
    commitments: number;
    appointments: number;
    tasks: number;
    overdue: number;
    availableMinutes: number;
    timeline: ScheduleTimelineItem[];
    attention: ScheduleAttentionItem[];
    recommendation: ScheduleRecommendation;
  };
};

// MARK: Assistant

export type AssistantScheduleChange = {
  taskId: string;
  title: string;
  before?: string | null;
  after: string;
  durationMin: number;
  reason: string;
};

export type AssistantTurn = {
  createdTaskId?: string | null;
  spoken: string;
  // DIVERGENCE: the web `PlanPayload.visual` requires appointments, tasks, overdue, next and rangeLabel;
  // the Swift assistant turn treats all but `summary` as optional and adds `sections`.
  visual: {
    summary: string;
    sections?: { title: string; items: string[] }[] | null;
    tasks?: string[] | null;
    appointments?: string[] | null;
    overdue?: string[] | null;
    next?: string | null;
  };
  contextActionId?: string | null;
  confirmation?: { actionId: string; prompt: string } | null;
  executive?: { proposedScheduleChanges: AssistantScheduleChange[] } | null;
};

export type AssistantRequest = {
  transcript: string;
  contextActionId?: string;
  confirmActionId?: string;
  rejectActionId?: string;
};
