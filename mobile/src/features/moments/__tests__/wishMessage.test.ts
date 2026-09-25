import { fallbackWish, newFestivalSettings, type FestivalSettings, type ManagedRecipient } from '../domain';
import {
  approvalError,
  cardWish,
  changeFrom,
  initialWish,
  isGeneratedDefault,
  needsCancelPrompt,
  reconcileCardGreeting,
  SENDING_NOW,
  wishSaveError,
  wishSuggestion,
  type FestivalEditState,
} from '../wishMessage';

/** Port of ios/Tests/NexdoCoreTests/WishMessageTests.swift. */

const base = (overrides: Partial<FestivalSettings> = {}): FestivalSettings => ({ ...newFestivalSettings('g'), ...overrides });

// ITEM 1. The suggestion is a placeholder, never the saved message.
describe('the suggestion is only a placeholder', () => {
  it('suggests wording per occasion', () => {
    expect(wishSuggestion('birthday', 'Asha’s birthday')).toBe('Asha’s birthday! Sending you warm wishes on your special day.');
    expect(wishSuggestion('getWellSoon', 'Sam')).toBe('Get well soon. Wishing you comfort, rest, and brighter days ahead.');
    expect(wishSuggestion('festival', 'Happy Diwali')).toBe(fallbackWish('Happy Diwali', 'Warm'));
  });

  it('starts empty when nothing is saved, and from a draft approved in Review Wish', () => {
    expect(initialWish('', null, null)).toBe('');
    // A server fallback the person never approved is not their wish.
    expect(initialWish('', 'Server fallback draft', 'DRAFT')).toBe('');
    expect(initialWish('', 'Asha, you’re the best!', 'READY')).toBe('Asha, you’re the best!');
    expect(initialWish('', 'Approved and scheduled', 'PLANNED')).toBe('Approved and scheduled');
    expect(initialWish('', '   ', 'READY')).toBe('');
    expect(initialWish('Mine', 'Other', 'READY')).toBe('Mine');
  });

  it('needs real text to approve, and never falls back to the suggestion', () => {
    expect(approvalError(base())).toBe('Each message must contain 1–500 characters.');
    expect(approvalError(base({ baseMessage: '  \n ' }))).not.toBeNull();
    expect(approvalError(base({ baseMessage: 'a'.repeat(501) }))).not.toBeNull();
    expect(approvalError(base({ baseMessage: 'Happy birthday, Asha!' }))).toBeNull();
    expect(approvalError(base({ baseMessage: 'Happy birthday, Asha!', overrides: { a: ' ' } }))).not.toBeNull();
    // Tapping "Use suggestion" is the only way the suggestion becomes the message.
    expect(approvalError(base({ baseMessage: wishSuggestion('birthday', 'Asha’s birthday') }))).toBeNull();
  });
});

// ITEM 3. The card prints the Wish Message.
describe('the card prints the Wish Message', () => {
  it('uses the recipient’s own message when they have one', () => {
    const settings = base({ baseMessage: 'Have a lovely day!', overrides: { b: 'Ravi, just for you.' } });
    expect(cardWish(settings)).toBe('Have a lovely day!');
    expect(cardWish(settings, 'a')).toBe('Have a lovely day!');
    expect(cardWish(settings, 'b')).toBe('Ravi, just for you.');
    // A greeting left over from an older version never shows.
    expect(cardWish({ ...settings, cardGreeting: 'Stale card text' })).toBe('Have a lovely day!');
  });

  it('folds an older card-only greeting into the Wish Message', () => {
    const suggestion = wishSuggestion('birthday', 'Asha’s birthday');

    // The reported case: the default was stored as the message and the user's text lived only on the card.
    let result = reconcileCardGreeting(base({ baseMessage: suggestion, approvedAt: 'then', cardGreeting: 'Asha, thirty looks great on you.' }));
    expect(result.adopted).toBe(true);
    expect(result.settings.baseMessage).toBe('Asha, thirty looks great on you.');
    expect(result.settings.approvedAt).toBeNull();
    expect(result.settings.manuallyEdited).toBe(true);
    expect(result.settings.cardGreeting).toBeNull();

    // Empty message: the card text is adopted.
    result = reconcileCardGreeting(base({ cardGreeting: 'Card only' }));
    expect(result.adopted).toBe(true);
    expect(result.settings.baseMessage).toBe('Card only');

    // A message the user wrote wins; the card text is dropped.
    result = reconcileCardGreeting(base({ baseMessage: 'Typed wish', manuallyEdited: true, approvedAt: 'then', cardGreeting: 'Old card' }));
    expect(result.adopted).toBe(false);
    expect(result.settings.baseMessage).toBe('Typed wish');
    expect(result.settings.approvedAt).toBe('then');
    expect(result.settings.cardGreeting).toBeNull();

    // The suggestion kept on purpose (manually edited) is not replaced.
    result = reconcileCardGreeting(base({ baseMessage: suggestion, manuallyEdited: true, cardGreeting: 'Card' }));
    expect(result.adopted).toBe(false);
    expect(result.settings.baseMessage).toBe(suggestion);

    // Same text, or a blank card text: nothing to adopt, and cardGreeting is cleared either way.
    result = reconcileCardGreeting(base({ baseMessage: 'Same', cardGreeting: 'Same' }));
    expect(result.adopted).toBe(false);
    expect(result.settings.cardGreeting).toBeNull();
    result = reconcileCardGreeting(base({ cardGreeting: '  ' }));
    expect(result.adopted).toBe(false);
    expect(result.settings.baseMessage).toBe('');
  });

  /**
   * The reported loss: a moment whose title had changed since its message was saved. The saved
   * message was still an untouched default, but it no longer matched the suggestion for the title the
   * moment carries now, so the card greeting was dropped instead of adopted.
   */
  describe('an untouched default is recognised whatever the title was', () => {
    it('adopts the card greeting when the message is a default built from an older title', () => {
      const stale = base({ baseMessage: 'Visakan’s Birthday! Sending you warm wishes on your special day.', approvedAt: 'then', cardGreeting: 'Visakan, see you at seven!' });
      const result = reconcileCardGreeting(stale);
      expect(result.adopted).toBe(true);
      expect(result.settings.baseMessage).toBe('Visakan, see you at seven!');
      // Adopting is an unsaved change that needs a fresh Save Message.
      expect(result.settings.approvedAt).toBeNull();
      expect(result.settings.manuallyEdited).toBe(true);
      expect(result.settings.cardGreeting).toBeNull();
    });

    it('recognises every default shape the app has generated', () => {
      const defaults = [
        'Anything at all! Sending you warm wishes on your special day.',
        'Diwali! Wishing you joy and happiness.',
        'Diwali! Here’s to a celebration full of smiles, good company, and wonderful memories! ✨',
        'Diwali! Thinking of you and your family and sending warm wishes for a joyful celebration.',
        'Diwali! Wishing you and your family a joyful celebration filled with happiness and new beginnings! ✨',
        'Get well soon. Thinking of you.',
        'Get well soon. Wishing you comfort, rest, and brighter days ahead.',
        'Get well soon. Sending care, comfort, and warm wishes for brighter days ahead.',
      ];
      for (const baseMessage of defaults) {
        expect(isGeneratedDefault(baseMessage)).toBe(true);
        const result = reconcileCardGreeting(base({ baseMessage, cardGreeting: 'My own card words' }));
        expect(result.adopted).toBe(true);
        expect(result.settings.baseMessage).toBe('My own card words');
      }
    });

    it('does not mistake something written for a default', () => {
      const written = ['Many happy returns, Visakan.', 'Sending you warm wishes on your special day.', '! Wishing you joy and happiness.', 'Get well soon.'];
      for (const baseMessage of written) {
        expect(isGeneratedDefault(baseMessage)).toBe(false);
        const result = reconcileCardGreeting(base({ baseMessage, cardGreeting: 'My own card words' }));
        expect(result.adopted).toBe(false);
        expect(result.settings.baseMessage).toBe(baseMessage);
      }
    });

    it('keeps a default the person went on to edit', () => {
      const edited = base({ baseMessage: 'Diwali! Wishing you joy and happiness.', manuallyEdited: true, approvedAt: 'then', cardGreeting: 'Card words' });
      const result = reconcileCardGreeting(edited);
      expect(result.adopted).toBe(false);
      expect(result.settings.baseMessage).toBe('Diwali! Wishing you joy and happiness.');
      expect(result.settings.approvedAt).toBe('then');
    });

    it('still adopts into a blank message, edited or not', () => {
      for (const manuallyEdited of [false, true]) {
        const result = reconcileCardGreeting(base({ baseMessage: '', manuallyEdited, cardGreeting: 'Card words' }));
        expect(result.adopted).toBe(true);
        expect(result.settings.baseMessage).toBe('Card words');
      }
    });

    it('needs a card greeting that is present and different', () => {
      const shared = 'Diwali! Wishing you joy and happiness.';
      for (const cardGreeting of [null, '', '   ', shared]) {
        const result = reconcileCardGreeting(base({ baseMessage: shared, cardGreeting }));
        expect(result.adopted).toBe(false);
        expect(result.settings.baseMessage).toBe(shared);
        expect(result.settings.cardGreeting).toBeNull();
      }
    });
  });
});

// ITEM 5. Approved message-only saves keep schedules.
describe('classifying what a save changes', () => {
  const recipient = (overrides: Partial<ManagedRecipient> = {}): ManagedRecipient => ({
    momentID: 'm1',
    key: 'a',
    name: 'Asha',
    phone: '',
    email: 'asha@example.com',
    selected: true,
    contactIdentifier: '',
    ...overrides,
  });

  const state = (edit: (value: FestivalEditState) => void = () => undefined): FestivalEditState => {
    const value: FestivalEditState = {
      title: 'Asha’s birthday',
      day: '2030-06-01',
      zone: 'America/Los_Angeles',
      yearly: true,
      active: true,
      recipients: [recipient()],
      settings: base({ baseMessage: 'Hello', approvedAt: 'then', channels: { a: 'email' }, automatic: { a: true } }),
    };
    edit(value);
    return value;
  };

  it('counts message and card fields as message-only', () => {
    const saved = state();
    expect(changeFrom(state(), saved)).toBe('none');
    const messageEdits: ((value: FestivalEditState) => void)[] = [
      (value) => (value.settings = { ...value.settings, baseMessage: 'New' }),
      (value) => (value.settings = { ...value.settings, overrides: { a: 'Mine' } }),
      (value) => (value.settings = { ...value.settings, tone: 'Fun' }),
      (value) => (value.settings = { ...value.settings, approvedAt: null }),
      (value) => (value.settings = { ...value.settings, cardSignature: 'Sri' }),
      (value) => (value.settings = { ...value.settings, imageID: 'img' }),
      (value) => (value.settings = { ...value.settings, cardGreeting: 'Old' }),
      (value) => (value.settings = { ...value.settings, draftSendDate: '2030-06-01T15:00:00Z' }),
      (value) => (value.settings = { ...value.settings, personalContext: 'Loves cake' }),
      (value) => (value.settings = { ...value.settings, catalogNotice: 'Catalog date applied.' }),
      // A newly created moment learning its id is not a delivery change.
      (value) => (value.recipients = [recipient({ momentID: 'm2' })]),
    ];
    for (const edit of messageEdits) expect(['none', 'messageOnly']).toContain(changeFrom(state(edit), saved));
    expect(changeFrom(state((value) => (value.settings = { ...value.settings, baseMessage: 'New' })), saved)).toBe('messageOnly');
  });

  it('counts who, when and how as delivery changes', () => {
    const saved = state();
    const deliveryEdits: ((value: FestivalEditState) => void)[] = [
      (value) => (value.title = 'Renamed'),
      (value) => (value.day = '2030-06-02'),
      (value) => (value.zone = 'Asia/Kolkata'),
      (value) => (value.yearly = false),
      (value) => (value.active = false),
      (value) => (value.recipients = [recipient({ email: 'other@example.com' })]),
      (value) => (value.recipients = [recipient({ selected: false })]),
      (value) => (value.recipients = [recipient(), recipient({ momentID: '', key: 'b', name: 'Ravi', phone: '+15555550123', email: '' })]),
      (value) => (value.settings = { ...value.settings, channels: { a: 'share' } }),
      (value) => (value.settings = { ...value.settings, automatic: { a: false } }),
      (value) => (value.settings = { ...value.settings, prepareDays: 3 }),
      (value) => (value.settings = { ...value.settings, catalogManaged: true }),
      (value) => (value.settings = { ...value.settings, includeImage: true }),
    ];
    for (const edit of deliveryEdits) expect(changeFrom(state(edit), saved)).toBe('delivery');
  });

  it('prompts to cancel only for delivery changes or an unapproved message', () => {
    expect(needsCancelPrompt('messageOnly', true, true)).toBe(false);
    expect(needsCancelPrompt('messageOnly', false, true)).toBe(true);
    expect(needsCancelPrompt('delivery', true, true)).toBe(true);
    expect(needsCancelPrompt('delivery', false, true)).toBe(true);
    expect(needsCancelPrompt('none', true, true)).toBe(false);
    for (const change of ['none', 'messageOnly', 'delivery'] as const) expect(needsCancelPrompt(change, false, false)).toBe(false);
  });

  it('has a clear inline message for a send already in progress', () => {
    expect(wishSaveError(409, 'A delivery is in progress. Refresh before editing.')).toBe(SENDING_NOW);
    expect(wishSaveError(409, 'A delivery started. Refresh before editing.')).toBe(SENDING_NOW);
    // The schedules conflict is a prompt, not an inline message.
    expect(wishSaveError(409, 'Existing schedules must be cancelled before saving changes. Review and schedule again.')).toBeNull();
    expect(wishSaveError(400, 'A delivery is in progress.')).toBeNull();
  });
});
