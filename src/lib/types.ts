export type AgendaTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  startAt: string | null;
  durationMin: number;
  waitingOn?: string | null;
};

export type AgendaEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
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
};
