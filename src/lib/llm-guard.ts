const POLICY_DENIAL_TEXT = 'I can’t help with political, violent, sexual, or general-knowledge questions. I can help with your tasks, calendar, and scheduling questions instead.';

const TRIGGERED_PHRASE = 'I can’t help with that request. Ask me about your tasks, deadlines, or schedule instead.';

const VIOLENT_PATTERNS: Array<{ pattern: RegExp; category: PolicyCategory }> = [
  { pattern: /\b(kill(ing|s|ed)?|murder|shoot|stab|beating|assault|attack|violent|violence|explosive|bomb|terror|suicide|self[- ]?harm|abuse|abusive|rape|sexual assault)\b/i, category: 'violence' },
  { pattern: /\b(punch|stab|beat|slaughter|lynch|shooting|homicid|weapon|knife|gun|firearm|poison)\b/i, category: 'violence' },
];

const SEXUAL_PATTERNS: Array<{ pattern: RegExp; category: PolicyCategory }> = [
  { pattern: /\b(sex(?:ual)?|porn(?:ography)?|nude|naked|masturbat|explicit content|erotic|hookup|orgasm|intercourse)\b/i, category: 'sexual' },
  { pattern: /\b(tits|boobs|dick|cock|vagina|penis|clit|breasts)\b/i, category: 'sexual' },
];

const POLITICAL_PATTERNS: Array<{ pattern: RegExp; category: PolicyCategory }> = [
  { pattern: /\b(election|politic|politician|president|senator|governor|congress|senate|campaign|parties?|vote|government|parliament|politics)\b/i, category: 'political' },
  { pattern: /\b(trump|biden|obama|democrat|republican|gop|left-wing|right-wing)\b/i, category: 'political' },
];

const COMMON_QA_PATTERNS = [
  /\bwhy\s+(?:is|are)\s+the\s+sky\s+blue\b/i,
  /\bwhat\s+(?:is|are)\s+(?:the\s+)?(?:meaning|definition|origin|reason)\b/i,
  /\bwho\s+(?:is|are|was)\b/i,
  /\bwhat\s+(?:is|are|were)\b/i,
  /\bwhy\s+(?:is|are|did|does|do|can|would|should|could)\b/i,
  /\bhow\s+(?:does|do|can|should|to|doesn't|does not)\b/i,
];

const TASK_INTENT_HINTS = /\b(task|tasks|todo|brief|briefing|deadline|due|overdue|schedule|appointments?|calendar|meeting|focus|remind|create|update|reschedule|complete|delete|move|today|tomorrow|weekly|next|hour|minute|plan|time|priority|free\s+time|working\s+day)\b/i;

export type PolicyCategory = 'political' | 'sexual' | 'violence' | 'common_question';

export type PolicyMatch = {
  category: PolicyCategory;
  reason: string;
};

function isTextMatched(text: string): PolicyMatch | null {
  for (const item of VIOLENT_PATTERNS) {
    if (item.pattern.test(text)) return { category: item.category, reason: 'unsafe content: violence' };
  }
  for (const item of SEXUAL_PATTERNS) {
    if (item.pattern.test(text)) return { category: item.category, reason: 'unsafe content: sexual' };
  }
  for (const item of POLITICAL_PATTERNS) {
    if (item.pattern.test(text)) return { category: item.category, reason: 'unsafe content: political' };
  }
  return null;
}

export function detectPolicyViolation(input: string): PolicyMatch | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  const direct = isTextMatched(input);
  if (direct) return direct;

  if (COMMON_QA_PATTERNS.some((pattern) => pattern.test(input))) {
    if (!TASK_INTENT_HINTS.test(input)) {
      return { category: 'common_question', reason: 'common knowledge/trivia question' };
    }
  }

  if (/^\s*(why|what|who|when|where|how)\b/.test(normalized) && input.includes('?')) {
    if (!TASK_INTENT_HINTS.test(input)) return { category: 'common_question', reason: 'general question outside task planning context' };
  }

  return null;
}

export function policyRefusal(category?: PolicyCategory): string {
  if (category === 'common_question') return TRIGGERED_PHRASE;
  return POLICY_DENIAL_TEXT;
}

export function blockedAssistantTurn(transcript: string, category?: PolicyCategory) {
  const refusal = policyRefusal(category);
  return {
    transcript,
    intent: { intent: 'UNKNOWN', confidence: 1, confirmationRequired: false, raw: transcript },
    spoken: refusal,
    visual: {
      summary: refusal,
      sections: [{ title: 'AI Response', items: [refusal] }],
      tasks: [],
      appointments: [],
      overdue: [],
      next: '',
    },
  } as const;
}

export function sanitizeAssistantOutput(turn: {
  transcript: string;
  spoken: string;
  visual: {
    summary: string;
    sections?: Array<{ title: string; items: string[] }>;
    tasks?: string[];
    appointments?: string[];
    overdue?: string[];
    next?: string | null;
  };
  confirmation?: unknown;
  contextActionId?: string;
  executive?: unknown;
}) {
  const spokenViolation = detectPolicyViolation(turn.spoken);
  const summaryViolation = detectPolicyViolation(turn.visual.summary);
  const sectionViolation = (turn.visual.sections ?? []).some((section) =>
    section.items.some((line) => detectPolicyViolation(line))
  );
  const nextViolation = turn.visual.next ? detectPolicyViolation(turn.visual.next) : null;

  const violation = spokenViolation ?? summaryViolation ?? nextViolation ?? (sectionViolation ? { category: 'common_question' as const, reason: 'suspicious output' } : null);
  if (!violation) return turn;

  const refusal = policyRefusal(violation.category);
  return {
    transcript: turn.transcript,
    spoken: refusal,
    visual: {
      summary: refusal,
      sections: [{ title: 'AI Response', items: [refusal] }],
      tasks: [],
      appointments: [],
      overdue: [],
      next: '',
    },
    confirmation: turn.confirmation,
    contextActionId: turn.contextActionId,
    executive: turn.executive,
  };
}
