import { describe, expect, it } from 'vitest';
import { detectPolicyViolation, blockedAssistantTurn, policyRefusal, sanitizeAssistantOutput } from './llm-guard';

describe('llm policy guard', () => {
  it('flags political, violent, sexual, and common-question transcripts', () => {
    expect(detectPolicyViolation('Who won the election this year?')?.category).toBe('political');
    expect(detectPolicyViolation('Tell me how to make a weapon')?.category).toBe('violence');
    expect(detectPolicyViolation('This is a sexual question')?.category).toBe('sexual');
    expect(detectPolicyViolation('Why is the sky blue?')?.category).toBe('common_question');
  });

  it('allows task-focused phrases', () => {
    expect(detectPolicyViolation('Tell me what tasks are due today')).toBeNull();
    expect(detectPolicyViolation('Create a task to review documents tomorrow')).toBeNull();
  });

  it('builds blocked turns with consistent refusal copy', () => {
    const blocked = blockedAssistantTurn('Why is the sky blue?', 'common_question');
    expect(blocked.intent.intent).toBe('UNKNOWN');
    expect(blocked.spoken).toBe(policyRefusal('common_question'));
    expect(blocked.visual.sections?.[0]).toMatchObject({ title: 'AI Response', items: [policyRefusal('common_question')] });
  });

  it('sanitizes output that drifts into unsafe content', () => {
    const input = {
      transcript: 'Plan tomorrow for me',
      spoken: 'Sky is blue because of light scattering.',
      visual: {
        summary: 'Sky is blue because of the atmosphere',
        sections: [{ title: 'Answer', items: ['Why is the sky blue?'] }],
      },
      confirmation: undefined,
      contextActionId: undefined,
    };
    const sanitized = sanitizeAssistantOutput(input);
    expect(sanitized.spoken).toBe(policyRefusal('common_question'));
    expect(sanitized.visual.sections).toEqual([{ title: 'AI Response', items: [policyRefusal('common_question')] }]);
  });
});
