import type { TaskSymbolName } from '../components/TaskSymbol';

/**
 * `NexdoAIIntent` (ios/App/AskNexdoView.swift:4-43) — "Stable entry actions routed through the
 * existing conversational assistant." Order is `allCases`, which is declaration order.
 */
export type AskIntent = {
  id: string;
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
    query: 'Nexdo, brief me for the next 5 days.',
  },
  {
    id: 'topFocusTasks',
    title: 'Pick my Top 3 focus tasks',
    detail: 'Ranked by urgency, effort, and completion risk',
    icon: 'target',
    query: 'Pick my top 3 focus tasks, ranked by urgency, estimated effort, and completion risk.',
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

/** The "Try a prompt" examples on the free-form text page (AskNexdoView.swift:220). */
export const ASK_TEXT_EXAMPLES = [
  'What should I focus on today?',
  'Find 30 minutes free tomorrow for a walk.',
  'Remind me to call Damien tomorrow at 11 AM.',
];

/** `validPrompt` (AskNexdoView.swift:149) and the server's `assistantRequestSchema` `.max(4000)`. */
export const ASK_MAX_LENGTH = 4000;
