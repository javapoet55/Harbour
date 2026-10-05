import type { TaskSymbolName } from '../components/TaskSymbol';

/**
 * `NexdoAIIntent` (ios/App/AskNexdoView.swift:4-43) — "Stable entry actions routed through the
 * existing conversational assistant." Order is `allCases`, which is declaration order.
 */
export type AskIntentId = 'dailyBriefing' | 'topFocusTasks' | 'deadlinesAndRisks' | 'findScheduleTime' | 'planTomorrow';

export type AskIntent = {
  id: AskIntentId;
  title: string;
  detail: string;
  icon: TaskSymbolName;
  query: string;
};

export const ASK_INTENTS: AskIntent[] = [
  {
    id: 'dailyBriefing',
    title: 'Give me my full day briefing',
    detail: 'Priorities, deadlines, conflicts, and your next move',
    icon: 'sparkles',
    query: 'Give me my full day briefing for today: priorities, deadlines, conflicts, and my next move.',
  },
  {
    id: 'topFocusTasks',
    title: 'Pick my Top 3 focus tasks',
    detail: 'Ranked by urgency, effort, and completion risk',
    icon: 'target',
    query: 'Pick my top 3 focus tasks, ranked by urgency, estimated effort, and impact.',
  },
  {
    id: 'deadlinesAndRisks',
    title: 'Show deadlines and risks',
    detail: 'See what is due in the next 5 days',
    icon: 'alarm',
    query:
      'Show upcoming deadlines in the next 5 days, overdue work, conflicts, overloaded days, and high-priority unfinished tasks.',
  },
  {
    id: 'findScheduleTime',
    title: 'Find time in my schedule',
    detail: 'Surface open time around calendar commitments',
    icon: 'calendar.badge.clock',
    query: 'Find practical free time in my schedule around my calendar commitments using my availability.',
  },
  {
    id: 'planTomorrow',
    title: 'Help me plan tomorrow',
    detail: 'Check whether tomorrow has enough capacity',
    icon: 'sunrise',
    query:
      'Do I have enough time to finish everything tomorrow? Consider tasks, events, deadlines, and estimated durations.',
  },
];

/**
 * The four cards on the Ask AI landing (`cards`, ios/App/AskAILandingView.swift:18-23). Card `i` sends
 * `NexdoAIIntent.allCases[i].query` (`select(_:)`, :106-113); the titles are the shortened ones.
 */
export const ASK_LANDING_CARDS: { intent: AskIntentId; title: string; detail: string; icon: TaskSymbolName; tone: 'blue' | 'green' | 'orange' | 'purple' }[] = [
  { intent: 'dailyBriefing', title: 'My Daily Brief', detail: 'Priorities and\nyour next move', icon: 'calendar', tone: 'blue' },
  { intent: 'topFocusTasks', title: 'Top 3 Tasks', detail: 'Urgency, effort\nand impact', icon: 'scope', tone: 'green' },
  { intent: 'deadlinesAndRisks', title: 'Due & Risks', detail: 'Due in the\nnext 5 days', icon: 'exclamationmark.triangle', tone: 'orange' },
  { intent: 'findScheduleTime', title: 'Find Time', detail: 'Free time around\nyour plans', icon: 'clock', tone: 'purple' },
];

export const askIntent = (id: AskIntentId) => ASK_INTENTS.find((intent) => intent.id === id) as AskIntent;

/** The "Try a prompt" examples on the free-form text page (AskNexdoView.swift:220). */
export const ASK_TEXT_EXAMPLES = [
  'What should I focus on today?',
  'Find 30 minutes free tomorrow for a walk.',
  'Remind me to call Damien tomorrow at 11 AM.',
];

/** `validPrompt` (AskNexdoView.swift:149) and the server's `assistantRequestSchema` `.max(4000)`. */
export const ASK_MAX_LENGTH = 4000;
