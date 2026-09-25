import type { AssistantTurn } from '../api';

/**
 * The CLIENT-SIDE policy guard, ported line for line from `AskNexdoView`
 * (ios/App/AskNexdoView.swift:120-180): `policyRefusal`, `policyCommonQuestionRefusal`, the four
 * pattern lists, `taskIntentHints`, `containsPattern`, `policyGuardRefusal(for:)` and
 * `blockedTurn(for:)`.
 *
 * It runs BEFORE consent and before any network call (`request(_:speakResponse:)`, `:380-386`), so a
 * refused prompt never leaves the device. The server has its own guard
 * (`detectPolicyViolation`, src/lib/llm-guard.ts) — this one is not a substitute for it, and the two
 * are deliberately independent.
 *
 * Swift matches with `range(of:options:[.regularExpression, .caseInsensitive])`, so every pattern is
 * case-insensitive and unanchored; the JavaScript equivalent is the same source with the `i` flag.
 */

export const POLICY_REFUSAL =
  'I can’t help with political, violent, sexual, or general-knowledge questions. I can help with your tasks, calendar, and scheduling questions instead.';

export const POLICY_COMMON_QUESTION_REFUSAL =
  'I can’t help with that request. Ask me about your tasks, deadlines, or schedule instead.';

/** `politicalPatterns` (AskNexdoView.swift:126-129). */
const POLITICAL = [
  /\b(election|politic|politician|president|senator|governor|congress|senate|campaign|parties?|vote|government|parliament|politics)\b/i,
  /\b(trump|biden|obama|democrat|republican|gop|left-wing|right-wing)\b/i,
];

/** `sexualPatterns` (AskNexdoView.swift:130-133). */
const SEXUAL = [
  /\b(sex(?:ual)?|porn(?:ography)?|nude|naked|masturbat|explicit content|erotic|hookup|orgasm|intercourse)\b/i,
  /\b(tits|boobs|dick|cock|vagina|penis|clit|breasts)\b/i,
];

/** `violentPatterns` (AskNexdoView.swift:134-137). */
const VIOLENT = [
  /\b(kill(ing|s|ed)?|murder|shoot|stab|beating|assault|attack|violent|violence|explosive|bomb|terror|suicide|self[ -]?harm|abuse|abusive|rape|sexual assault)\b/i,
  /\b(punch|beat|slaughter|lynch|shooting|homicid|weapon|knife|gun|firearm|poison)\b/i,
];

/** `commonPatterns` (AskNexdoView.swift:138-145): general-knowledge question openers. */
const COMMON = [
  /\bwhy\s+(?:is|are)\s+the\s+sky\s+blue\b/i,
  /\bwhat\s+(?:is|are)\s+(?:the\s+)?(?:meaning|definition|origin|reason)\b/i,
  /\bwho\s+(?:is|are|was)\b/i,
  /\bwhat\s+(?:is|are|were)\b/i,
  /\bwhy\s+(?:is|are|did|does|do|can|would|should|could)\b/i,
  /\bhow\s+(?:does|do|can|should|to|doesn't|does not)\b/i,
];

/** `taskIntentHints` (AskNexdoView.swift:146). A hit here rescues a general-knowledge opener. */
const TASK_INTENT =
  /\b(task|tasks|todo|brief|briefing|deadline|due|overdue|schedule|appointments?|calendar|meeting|focus|remind|create|update|reschedule|complete|delete|move|today|tomorrow|weekly|next|hour|minute|plan|time|priority|free\s+time|working\s+day)\b/i;

/** The six openers checked against `normalized` in `policyGuardRefusal` (AskNexdoView.swift:166). */
const OPENERS = ['why ', 'what ', 'who ', 'how ', 'when ', 'where '];

/**
 * `policyGuardRefusal(for:)` (AskNexdoView.swift:156-169). Returns the refusal text, or `null` when
 * the prompt may be sent. Order matters and is Swift's: violent, sexual, political, then the
 * general-knowledge checks.
 */
export function policyGuardRefusal(query: string): string | null {
  const normalized = query.toLowerCase();
  if (VIOLENT.some((pattern) => pattern.test(query))) return POLICY_REFUSAL;
  if (SEXUAL.some((pattern) => pattern.test(query))) return POLICY_REFUSAL;
  if (POLITICAL.some((pattern) => pattern.test(query))) return POLICY_REFUSAL;

  if (COMMON.some((pattern) => pattern.test(query)) && !TASK_INTENT.test(query)) {
    return POLICY_COMMON_QUESTION_REFUSAL;
  }

  if (OPENERS.some((opener) => normalized.startsWith(opener)) && query.includes('?')) {
    if (!TASK_INTENT.test(query)) return POLICY_COMMON_QUESTION_REFUSAL;
  }
  return null;
}

/**
 * `blockedTurn(for:)` (AskNexdoView.swift:171-180): a synthetic turn so a refusal renders through the
 * same `AskResponseView` a server answer does. Never reaches the network.
 */
export function blockedTurn(query: string): AssistantTurn {
  const refusal = policyGuardRefusal(query) ?? POLICY_REFUSAL;
  return {
    createdTaskId: null,
    spoken: refusal,
    visual: {
      summary: refusal,
      sections: [{ title: 'AI Response', items: [refusal] }],
      tasks: [],
      appointments: [],
      overdue: [],
      next: null,
    },
    contextActionId: null,
    confirmation: null,
    executive: null,
  };
}
