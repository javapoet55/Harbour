export const INTENTS = [
  'CREATE_TASK',
  'UPDATE_TASK',
  'COMPLETE_TASK',
  'DELETE_TASK',
  'SNOOZE_TASK',
  'LIST_TODAY',
  'LIST_TOMORROW',
  'LIST_DATE_RANGE',
  'LIST_NEXT_N_DAYS',
  'LIST_OVERDUE',
  'LIST_HIGH_PRIORITY',
  'LIST_APPOINTMENTS',
  'FIND_FREE_TIME',
  'SCHEDULE_TASK',
  'RESCHEDULE_TASK',
  'CREATE_RECURRING_TASK',
  'PLAN_TOMORROW',
  'GENERAL_HELP',
  'UNKNOWN',
] as const;

export type IntentName = (typeof INTENTS)[number];

export type ParsedIntent = {
  intent: IntentName;
  confidence: number;
  title?: string;
  days?: number;
  whenText?: string;
  timeText?: string;
  durationMin?: number;
  recurrence?: 'daily' | 'weekly' | 'monthly';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  confirmationRequired: boolean;
  raw: string;
};

const DESTRUCTIVE = new Set<IntentName>(['DELETE_TASK', 'COMPLETE_TASK', 'RESCHEDULE_TASK', 'UPDATE_TASK']);

function clean(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

export function parseIntent(input: string): ParsedIntent {
  const raw = clean(input);
  const text = raw.toLowerCase();

  const daysMatch = text.match(/next (\d+) days?/) || text.match(/during the next (\d+) days?/);
  if (daysMatch) {
    return {
      intent: 'LIST_NEXT_N_DAYS',
      confidence: 0.94,
      days: Number(daysMatch[1]),
      confirmationRequired: false,
      raw,
    };
  }
  if (/next three days|coming up during the next three/.test(text)) {
    return { intent: 'LIST_NEXT_N_DAYS', confidence: 0.95, days: 3, confirmationRequired: false, raw };
  }
  if (/next five days|everything important during the next five/.test(text)) {
    return { intent: 'LIST_NEXT_N_DAYS', confidence: 0.95, days: 5, confirmationRequired: false, raw };
  }
  if (/what do i have today|today\b.*appointments|read my schedule for today|what is coming up today/.test(text)) {
    return { intent: 'LIST_TODAY', confidence: 0.96, confirmationRequired: false, raw };
  }
  if (/tomorrow/.test(text) && /what|coming up|do i have|finish everything|enough time/.test(text)) {
    if (/finish|enough time|can i/.test(text)) {
      return { intent: 'PLAN_TOMORROW', confidence: 0.9, confirmationRequired: false, raw };
    }
    return { intent: 'LIST_TOMORROW', confidence: 0.93, confirmationRequired: false, raw };
  }
  if (/overdue/.test(text)) {
    return { intent: 'LIST_OVERDUE', confidence: 0.95, confirmationRequired: false, raw };
  }
  if (/most important|high[- ]priority|what should i work on/.test(text)) {
    return { intent: 'LIST_HIGH_PRIORITY', confidence: 0.9, confirmationRequired: false, raw };
  }
  if (/appointments?/.test(text) && /what|when|next/.test(text)) {
    return { intent: 'LIST_APPOINTMENTS', confidence: 0.9, confirmationRequired: false, raw };
  }
  if (/free time|available/.test(text)) {
    return { intent: 'FIND_FREE_TIME', confidence: 0.8, confirmationRequired: false, raw };
  }
  if (/snooze/.test(text)) {
    return { intent: 'SNOOZE_TASK', confidence: 0.86, whenText: '2 hours', confirmationRequired: true, raw };
  }
  if (/mark .+ complete|completed? the|done with/.test(text)) {
    return { intent: 'COMPLETE_TASK', confidence: 0.88, title: extractTitle(raw), confirmationRequired: true, raw };
  }
  if (/cancel|delete|remove/.test(text) && /reminder|task|appointment/.test(text)) {
    return { intent: 'DELETE_TASK', confidence: 0.86, title: extractTitle(raw), confirmationRequired: true, raw };
  }
  if (/move |reschedule|change .+ to/.test(text)) {
    return { intent: 'RESCHEDULE_TASK', confidence: 0.84, title: extractTitle(raw), whenText: extractWhen(text), confirmationRequired: true, raw };
  }
  if (/every month|monthly|every week|daily/.test(text)) {
    return {
      intent: 'CREATE_RECURRING_TASK',
      confidence: 0.84,
      title: extractTitle(raw),
      recurrence: /month/.test(text) ? 'monthly' : /week/.test(text) ? 'weekly' : 'daily',
      confirmationRequired: true,
      raw,
    };
  }
  if (/remind me|create a task|add a task|schedule \d+ minutes/.test(text)) {
    const duration = text.match(/(\d+)\s+minutes/);
    return {
      intent: /schedule \d+ minutes/.test(text) ? 'SCHEDULE_TASK' : 'CREATE_TASK',
      confidence: 0.91,
      title: extractTitle(raw),
      whenText: extractWhen(text),
      timeText: extractClock(text),
      durationMin: duration ? Number(duration[1]) : undefined,
      confirmationRequired: true,
      raw,
    };
  }
  if (/help|what can you/.test(text)) {
    return { intent: 'GENERAL_HELP', confidence: 0.7, confirmationRequired: false, raw };
  }
  return { intent: 'UNKNOWN', confidence: 0.2, confirmationRequired: false, raw };
}

export function needsConfirmation(intent: ParsedIntent, level: string) {
  if (level === 'ALWAYS') return true;
  if (level === 'ROUTINE_AUTO') return DESTRUCTIVE.has(intent.intent);
  return intent.confirmationRequired || DESTRUCTIVE.has(intent.intent);
}

function extractTitle(raw: string) {
  const quoted = raw.match(/[‘'"](.+?)[’'"]/);
  if (quoted?.[1]) return quoted[1];
  return raw
    .replace(/^(remind me to|remind me|create a task to|create a task|add a task to|add a task|schedule \d+ minutes to|mark|cancel|delete|move)\s+/i, '')
    .replace(/\s+at \d+.*/i, '')
    .replace(/\s+(tomorrow|today|next week|every month|as complete|for .+)$/i, '')
    .trim()
    .replace(/^the\s+/i, '')
    .slice(0, 80) || 'New task';
}

function extractWhen(text: string) {
  if (text.includes('tomorrow')) return 'tomorrow';
  if (text.includes('today')) return 'today';
  if (text.includes('friday')) return 'friday';
  if (text.includes('next week')) return 'next week';
  const weeks = text.match(/(\d+)\s+weeks? before/);
  if (weeks) return `${weeks[1]} weeks before`;
  return undefined;
}

function extractClock(text: string) {
  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const mer = (m[3] || '').toLowerCase();
  if (mer.startsWith('p') && hour < 12) hour += 12;
  if (mer.startsWith('a') && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
