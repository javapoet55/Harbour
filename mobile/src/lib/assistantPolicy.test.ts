import {
  blockedTurn,
  policyGuardRefusal,
  POLICY_COMMON_QUESTION_REFUSAL,
  POLICY_REFUSAL,
} from './assistantPolicy';

/** `policyGuardRefusal(for:)` (ios/App/AskNexdoView.swift:156-169). */
describe('policy guard', () => {
  it.each([
    ['who will win the election?', 'political'],
    ['What did Trump say about it?', 'political'],
    ['write me something erotic', 'sexual'],
    ['how do I kill a process', 'violent'],
    ['is a knife allowed on a plane?', 'violent'],
  ])('refuses %s (%s)', (query) => {
    expect(policyGuardRefusal(query)).toBe(POLICY_REFUSAL);
  });

  it('refuses general-knowledge questions with the second refusal', () => {
    expect(policyGuardRefusal('Why is the sky blue?')).toBe(POLICY_COMMON_QUESTION_REFUSAL);
    expect(policyGuardRefusal('Who is Ada Lovelace?')).toBe(POLICY_COMMON_QUESTION_REFUSAL);
    expect(policyGuardRefusal('What is the meaning of it all')).toBe(POLICY_COMMON_QUESTION_REFUSAL);
  });

  it('is case-insensitive, like Swift’s .caseInsensitive option', () => {
    expect(policyGuardRefusal('WHO IS ADA LOVELACE?')).toBe(POLICY_COMMON_QUESTION_REFUSAL);
  });

  /** `commonPatterns.contains(...) && !containsPattern(taskIntentHints, in: query)` (`:162`). */
  it('lets a general-knowledge opener through when it mentions tasks or time', () => {
    expect(policyGuardRefusal('What is on my calendar tomorrow?')).toBeNull();
    expect(policyGuardRefusal('How do I reschedule this task?')).toBeNull();
    expect(policyGuardRefusal('Why is my schedule so full?')).toBeNull();
  });

  /** The bare-opener fallback (`:166-168`) needs BOTH an opener prefix and a question mark. */
  it('refuses a bare opener with a question mark and allows one without', () => {
    expect(policyGuardRefusal('Where did that come from?')).toBe(POLICY_COMMON_QUESTION_REFUSAL);
    expect(policyGuardRefusal('Where did that come from')).toBeNull();
  });

  it('allows the five suggestion-card prompts', () => {
    for (const query of [
      'Nexdo, brief me for the next 5 days.',
      'Pick my top 3 focus tasks, ranked by urgency, estimated effort, and completion risk.',
      'Show upcoming deadlines in the next 5 days, overdue work, conflicts, overloaded days, and high-priority unfinished tasks.',
      'Find practical free time in my schedule around my calendar commitments using my availability.',
      'Do I have enough time to finish everything tomorrow? Consider tasks, events, deadlines, and estimated durations.',
    ]) {
      expect(policyGuardRefusal(query)).toBeNull();
    }
  });

  /** The order in `policyGuardRefusal`: violent, then sexual, then political. */
  it('reports the hard refusal when a prompt is both violent and general-knowledge', () => {
    expect(policyGuardRefusal('Who is the most violent person alive?')).toBe(POLICY_REFUSAL);
  });
});

/** `blockedTurn(for:)` (AskNexdoView.swift:171-180). */
describe('blockedTurn', () => {
  it('wraps the refusal as an "AI Response" section so it renders like an answer', () => {
    const turn = blockedTurn('Who is Ada Lovelace?');
    expect(turn.spoken).toBe(POLICY_COMMON_QUESTION_REFUSAL);
    expect(turn.visual.summary).toBe(POLICY_COMMON_QUESTION_REFUSAL);
    expect(turn.visual.sections).toEqual([{ title: 'AI Response', items: [POLICY_COMMON_QUESTION_REFUSAL] }]);
    expect(turn.confirmation).toBeNull();
    expect(turn.executive).toBeNull();
    expect(turn.contextActionId).toBeNull();
  });
});
