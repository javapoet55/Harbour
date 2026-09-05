import { describe, expect, it } from 'vitest';
import { matchLandingStory } from './landing-demo';

describe('public landing walkthrough', () => {
  it('routes visitors to the relevant sample story', () => {
    expect(matchLandingStory('Help me find my focus today')).toBe('focus');
    expect(matchLandingStory('A meeting came up today')).toBe('replan');
    expect(matchLandingStory('HARBOUR, BRIEF ME')).toBe('brief');
    expect(matchLandingStory('What is coming up tomorrow?')).toBe('brief');
  });
  it('does not pretend to interpret unsupported requests', () => {
    expect(matchLandingStory('')).toBeNull();
    expect(matchLandingStory('buy groceries')).toBeNull();
    expect(matchLandingStory('delete my account')).toBeNull();
  });
});
