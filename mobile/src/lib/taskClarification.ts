/**
 * Port of `TaskActionClarification` (ios/Sources/NexdoCore/TaskActionDetector.swift:67-87) and the
 * part of `DeterministicTaskActionDetector` (`:4-33`) that it depends on.
 *
 * SCOPE: `isCandidate` and `title(verb:contact:)` only ever ask whether the detector matches, never
 * what it returns, so only the DETECTION half is ported — the verb/name parse. `parseTime`
 * (`TaskActionDetector.swift:35-65`), which turns "tomorrow at 4pm" into a date, belongs to the
 * reminders work in Phase 8 and is not needed here.
 */

/** `workVerbs` (TaskActionDetector.swift:70). A title starting with one of these is already actionable. */
const WORK_VERBS = [
  'finish', 'write', 'draft', 'review', 'read', 'prepare', 'submit', 'send', 'pay', 'buy', 'book',
  'schedule', 'research', 'complete', 'practice', 'study', 'walk', 'clean', 'exercise', 'build',
  'fix', 'plan', 'outline', 'create', 'go',
];

/** The leading contact verbs (TaskActionDetector.swift:8). */
const CONTACT_VERB = /^(contact|call|email|message|text|follow\s+up\s+with)\s+(.+)$/i;

/** A tail that opens with one of these is a time or topic, not a name (TaskActionDetector.swift:13). */
const TAIL_IS_NOT_A_NAME = /^(?:at|about|regarding|today|tomorrow|tonight|on)\b/i;

/** Where the contact name ends (TaskActionDetector.swift:14). */
const NAME_END =
  /\s+(?:to\s+(?:confirm|discuss|arrange|review)\b|at\b|about\b|regarding\b|on\b|today\b|tomorrow\b|tonight\b|this\b|next\b|monday\b|tuesday\b|wednesday\b|thursday\b|friday\b|saturday\b|sunday\b)/i;

/** `trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))`. */
function trimEnds(value: string): string {
  return value.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '');
}

/**
 * True when `DeterministicTaskActionDetector().detect(title:)` would return a match — that is, the
 * title reads as "call/email/message someone".
 */
export function detectsContactAction(title: string): boolean {
  const text = title.trim();
  const match = CONTACT_VERB.exec(text);
  if (!match) return false;

  const tail = match[2];
  if (TAIL_IS_NOT_A_NAME.test(tail)) return false;

  const end = tail.search(NAME_END);
  const name = trimEnds(end === -1 ? tail : tail.slice(0, end));

  return (
    name.length > 0 &&
    name.length <= 100 &&
    name.split(' ').filter(Boolean).length <= 5 &&
    /\p{L}/u.test(name)
  );
}

/**
 * `TaskActionClarification.isCandidate` (TaskActionDetector.swift:68-74).
 *
 * A short title that is neither already a work instruction nor already a contact action — in other
 * words, one where "Pay rent" is clear but "Kitchen" is not, so the card asks what you mean.
 */
export function isClarificationCandidate(title: string): boolean {
  const words = title.split(/\s+/).filter(Boolean);
  return (
    words.length > 0 &&
    words.length <= 4 &&
    title.length <= 100 &&
    !WORK_VERBS.includes(words[0].toLowerCase()) &&
    !detectsContactAction(title)
  );
}

/**
 * `TaskActionClarification.nextStepTitle` (TaskActionDetector.swift:75-79): at least two words, at
 * most 200 characters. Null means the "Save next step" button stays disabled.
 */
export function nextStepTitle(text: string): string | null {
  const value = text.trim();
  if (value.length > 200) return null;
  if (value.split(/\s+/).filter(Boolean).length < 2) return null;
  return value;
}

/**
 * `TaskActionClarification.title(verb:contact:)` (TaskActionDetector.swift:80-86): builds
 * "Call <name>" and only accepts it if the detector then recognises it.
 */
export function contactActionTitle(verb: string, contact: string): string | null {
  const name = contact.trim();
  if (!['Call', 'Message', 'Email'].includes(verb)) return null;
  if (name.length === 0 || name.length > 100) return null;
  const result = `${verb} ${name}`;
  return detectsContactAction(result) ? result : null;
}
