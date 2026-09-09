export type AgendaTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  startAt: string | null;
  durationMin: number;
  splittable?: boolean;
  minFocusMin?: number;
  waitingOn?: string | null;
  completedAt?: string | null;
  createdAt: string;
  notes?: string;
  energyLevel?: string;
  critical?: boolean;
  subtasks?: Array<{ id: string; title: string; completedAt: string | null }>;
  recurrence?: { frequency: string; interval: number } | null;
};

export type AgendaEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
};

export type AgendaPayload = {
  timeZone: string;
  range: { from: string; to: string; days: string[] };
  tasks: AgendaTask[];
  events: AgendaEvent[];
  overdue: AgendaTask[];
  waiting: AgendaTask[];
  unscheduled: AgendaTask[];
  important: AgendaTask[];
};

export type ReminderRow = {
  id: string;
  offsetLabel: string;
  status: string;
  task?: { title: string } | null;
  attempts: Array<{ id: string; channel: string; status: string; failureReason?: string | null }>;
};

export type PlanPayload = {
  spoken: string;
  visual: {
    summary: string;
    appointments: string[];
    tasks: string[];
    overdue: string[];
    next: string;
    rangeLabel: string;
  };
};

export type ReplanPayload = {
  spoken: string;
  actionId: string | null;
  generatedAt: string;
  kept: number;
  moves: Array<{
    taskId: string;
    title: string;
    fromStartAt: string | null;
    toStartAt: string;
    fromLabel: string;
    toLabel: string;
    reason: string;
    reasonLabel: string;
  }>;
  risks: Array<{ taskId: string; title: string; reason: 'no_capacity' | 'deadline_at_risk' }>;
};

export type PreferenceForm = {
  workStart: string;
  workEnd: string;
  quietStart: string;
  quietEnd: string;
  confirmationLevel: string;
  voiceEnabled: boolean;
  transcriptRetentionDays: number;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  morningSummary: boolean;
  eveningSummary: boolean;
  phoneNumber: string | null;
  personalizationEnabled: boolean;
};
