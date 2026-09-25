import { contactActionTitle, detectsContactAction, isClarificationCandidate, nextStepTitle } from './taskClarification';

/** Port of `TaskActionClarification` (ios/Sources/NexdoCore/TaskActionDetector.swift:67-87). */

describe('detectsContactAction', () => {
  it.each(['Call Damien', 'Email the landlord', 'Message Ana', 'Text Priya', 'Contact the bank', 'Follow up with Sam'])(
    'recognises %s',
    (title) => expect(detectsContactAction(title)).toBe(true),
  );

  it('rejects a title with no contact verb', () => {
    expect(detectsContactAction('Renew passport')).toBe(false);
  });

  it('rejects a tail that opens with a time or topic rather than a name', () => {
    expect(detectsContactAction('Call at 5pm')).toBe(false);
    expect(detectsContactAction('Call about the invoice')).toBe(false);
    expect(detectsContactAction('Call tomorrow')).toBe(false);
  });

  it('stops the name at a time or topic word', () => {
    // "Call Damien tomorrow at 11 AM" — the name is "Damien", which is valid.
    expect(detectsContactAction('Call Damien tomorrow at 11 AM')).toBe(true);
  });

  it('rejects a name of more than five words', () => {
    expect(detectsContactAction('Call one two three four five six')).toBe(false);
  });

  it('rejects a name with no letters', () => {
    expect(detectsContactAction('Call 12345')).toBe(false);
  });
});

/** `isCandidate` (TaskActionDetector.swift:68-74). */
describe('isClarificationCandidate', () => {
  it('is true for a short, vague title', () => {
    expect(isClarificationCandidate('Kitchen')).toBe(true);
    expect(isClarificationCandidate('Tax return')).toBe(true);
  });

  it('is false when the title already starts with a work verb', () => {
    expect(isClarificationCandidate('Pay rent')).toBe(false);
    expect(isClarificationCandidate('Draft the deck')).toBe(false);
    // Case-insensitive on the verb.
    expect(isClarificationCandidate('REVIEW the contract')).toBe(false);
  });

  it('is false when the title is already a contact action', () => {
    expect(isClarificationCandidate('Call Damien')).toBe(false);
  });

  it('is false for more than four words', () => {
    expect(isClarificationCandidate('One two three four')).toBe(true);
    expect(isClarificationCandidate('One two three four five')).toBe(false);
  });

  it('is false for an empty title or one over 100 characters', () => {
    expect(isClarificationCandidate('')).toBe(false);
    expect(isClarificationCandidate('   ')).toBe(false);
    expect(isClarificationCandidate('x'.repeat(101))).toBe(false);
  });
});

/** `nextStepTitle` (TaskActionDetector.swift:75-79). */
describe('nextStepTitle', () => {
  it('requires at least two words', () => {
    expect(nextStepTitle('Draft')).toBeNull();
    expect(nextStepTitle('Draft slides')).toBe('Draft slides');
  });

  it('trims but does not otherwise rewrite', () => {
    expect(nextStepTitle('  Draft three slides  ')).toBe('Draft three slides');
  });

  it('rejects more than 200 characters', () => {
    expect(nextStepTitle(`${'x'.repeat(200)} y`)).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(nextStepTitle('   ')).toBeNull();
  });
});

/** `title(verb:contact:)` (TaskActionDetector.swift:80-86). */
describe('contactActionTitle', () => {
  it.each([
    ['Call', 'Damien', 'Call Damien'],
    ['Message', 'Ana', 'Message Ana'],
    ['Email', 'the landlord', 'Email the landlord'],
  ])('builds %s %s', (verb, contact, expected) => {
    expect(contactActionTitle(verb, contact)).toBe(expected);
  });

  it('rejects a verb outside the three', () => {
    expect(contactActionTitle('Ping', 'Damien')).toBeNull();
  });

  it('rejects an empty or over-long contact', () => {
    expect(contactActionTitle('Call', '   ')).toBeNull();
    expect(contactActionTitle('Call', 'x'.repeat(101))).toBeNull();
  });

  it('rejects a contact the detector would not recognise back', () => {
    // "Call about" — the tail opens with a topic word, so the detector refuses it.
    expect(contactActionTitle('Call', 'about')).toBeNull();
  });
});
