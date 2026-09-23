import { ApiError } from '../../../api/client';
import type { ImportantMoment, MomentsSnapshot } from '../../../api/moments';
import { displayGroups, fallbackWish, readFestivalSettings } from '../domain';
import {
  CARD_MESSAGE_NEEDS_REVIEW,
  cardMessage,
  cardMessageFor,
  createManageModel,
  deliveryMessage,
  fingerprint,
  hasSchedules,
  isDirty,
  messageSuggestion,
  pendingChange,
  reviewHeading,
  selectedRecipients,
  type ManageDeps,
} from '../manageModel';
import { SENDING_NOW } from '../wishMessage';
import { createMomentsStore, type MomentsDeps } from '../store';
import { draft, moment, plan, settings } from '../testFixtures';

const NOW = Date.parse('2030-09-01T12:00:00Z');

function harness(moments: ImportantMoment[], snapshotOverrides: Partial<MomentsSnapshot> = {}) {
  let current: MomentsSnapshot = { moments, emailAccount: null, emailConfigured: false, automaticEmailEnabled: false, ...snapshotOverrides };
  const post = jest.fn(async (operation: string, input: unknown): Promise<never> => {
    void operation;
    void input;
    return { ok: true } as never;
  });
  const storeDeps: MomentsDeps = {
    api: { snapshot: jest.fn(async () => current), post: post as never, deleteAll: jest.fn() },
    ownerKey: async (id) => `hash-${id}`,
    authorization: async () => 'authorized',
    requestAuthorization: async () => undefined,
    replaceNotifications: async () => null,
    clearNotifications: async () => undefined,
    now: () => NOW,
  };
  const store = createMomentsStore(storeDeps);
  const images = { store: jest.fn(() => 'IMG.png'), load: jest.fn((id: string) => (id ? `file:///${id}` : null)), delete: jest.fn() };
  const cards = {
    capture: jest.fn(async (message: string) => {
      void message;
      return 'file:///capture.jpg' as string | null;
    }),
    encode: jest.fn(async () => 'CARD-1600'),
    encodeSmaller: jest.fn(async () => 'CARD-1120'),
    // Typed parameters, so `mock.calls` stays a tuple the assertions below can destructure.
    upload: jest.fn(async (momentID: string, data: string) => {
      void momentID;
      void data;
      return { id: 'card-1', mime: 'image/jpeg', size: 2048, sha256: 'a'.repeat(64), createdAt: '2030-09-01T12:00:00.000Z' };
    }),
    remove: jest.fn(async (momentID: string) => {
      void momentID;
    }),
    fetch: jest.fn(async (momentID: string): Promise<{ base64: string; mime: string } | null> => {
      void momentID;
      return null;
    }),
  };
  const deps: ManageDeps = {
    store,
    images,
    validateContacts: jest.fn(async () => undefined),
    sha256Hex: async (value) => Array.from({ length: 64 }, (_, index) => ((value.length + index) % 16).toString(16)).join(''),
    uuid: () => 'UUID',
    now: () => NOW,
    cards,
  };
  return {
    store,
    post,
    deps,
    images,
    cards,
    setSnapshot(next: ImportantMoment[]) {
      current = { ...current, moments: next };
    },
  };
}

const groupSettings = (overrides = {}) => settings({ groupID: 'g', baseMessage: 'Happy Diwali', ...overrides });

function festivalGroup(): ImportantMoment[] {
  return [
    moment({ id: 'a', type: 'festival', title: 'Diwali', firstName: 'Asha', phone: '+15555550100', sourceKey: 'festival:g:ka', festivalSettings: groupSettings() }),
    moment({ id: 'b', type: 'festival', title: 'Diwali', firstName: 'Ben', email: 'ben@example.com', sourceKey: 'festival:g:kb', enabled: false, festivalSettings: groupSettings({ selected: { kb: false } }) }),
  ];
}

describe('ManageFestivalModel init', () => {
  it('builds recipients from the group, keyed by their source key, with their channels', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    const state = model.getState();
    expect(state.recipients.map((recipient) => [recipient.key, recipient.name, recipient.selected, recipient.momentID])).toEqual([
      ['ka', 'Asha', true, 'a'],
      ['kb', 'Ben', false, 'b'],
    ]);
    expect(state.settings.channels).toEqual({ ka: 'messages', kb: 'email' });
    expect(state.active).toBe(true);
    // 08:00 on the day, in the moment's zone.
    expect(new Date(state.sendDate).toISOString()).toBe('2030-09-20T08:00:00.000Z');
    expect(isDirty(state)).toBe(false);
  });

  it('starts a new moment with no recipients and no saved message, only a suggestion', () => {
    const h = harness([]);
    const model = createManageModel({ id: 'x', moments: [moment({ id: 'x', title: 'Get Well Soon', type: 'getWellSoon' })] }, h.deps);
    expect(model.getState().recipients).toEqual([]);
    // The type-specific wording is a placeholder now; nothing is saved until the person writes or taps.
    expect(model.getState().settings.baseMessage).toBe('');
    expect(messageSuggestion(model.getState())).toBe('Get well soon. Wishing you comfort, rest, and brighter days ahead.');
    expect(model.getState().settings.groupID).toBe('UUID');
  });

  it('takes the send time and zone from an upcoming delivery', () => {
    const h = harness([]);
    const withPlan = moment({ id: 'p', drafts: [draft({ plans: [plan({ scheduledAtUTC: '2030-09-20T17:30:00Z', timeZoneID: 'Asia/Tokyo' })] })] });
    const model = createManageModel({ id: 'p', moments: [withPlan] }, h.deps);
    expect(model.getState().sendDate).toBe(Date.parse('2030-09-20T17:30:00Z'));
    expect(model.getState().zone).toBe('Asia/Tokyo');
  });
});

describe('dirty state and messages', () => {
  it('touching the send time or the reminder makes the moment dirty, as Swift’s didSet does', () => {
    const h = harness([]);
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setSendDate(Date.parse('2030-09-20T09:00:00Z'));
    expect(model.getState().settings.draftSendDate).toBe('2030-09-20T09:00:00Z');
    expect(isDirty(model.getState())).toBe(true);
  });

  it('moves the proposed send time when the date moves to another day', () => {
    const h = harness([]);
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setDate(Date.parse('2030-10-01T00:00:00Z'));
    expect(new Date(model.getState().sendDate).toISOString()).toBe('2030-10-01T08:00:00.000Z');
  });

  it('personalises each recipient’s heading and message', () => {
    const h = harness([]);
    const model = createManageModel({ id: 'x', moments: [moment({ id: 'x', firstName: 'Sam', title: 'Sam’s Birthday', festivalSettings: settings({ baseMessage: 'Have a great day!' }) })] }, h.deps);
    const recipient = model.getState().recipients[0];
    expect(reviewHeading(model.getState(), recipient)).toBe('Happy Birthday, Sam!');
    expect(deliveryMessage(model.getState(), recipient)).toBe('Happy Birthday, Sam! Have a great day!');
    model.getState().updateSettings({ overrides: { [recipient.key]: 'Custom' } });
    expect(deliveryMessage(model.getState(), recipient)).toBe('Custom');
  });
});

/**
 * `fallbackFirstName` (ManageFestivalModel.swift:218-220). An offline birthday or anniversary draft is
 * addressed to the only selected recipient. With several the draft is shared, so it carries no name
 * and `greetingMessage` adds each recipient's own when their wish is prepared.
 */
describe('the offline draft names the recipient only when there is one', () => {
  const pair = (type: string) => [
    moment({ id: 'a', type, title: 'The Big Day', firstName: 'Asha', email: 'asha@example.com', sourceKey: `${type}:g:ka`, festivalSettings: settings({ groupID: 'g', baseMessage: '' }) }),
    moment({ id: 'b', type, title: 'The Big Day', firstName: 'Ravi', email: 'ravi@example.com', sourceKey: `${type}:g:kb`, festivalSettings: settings({ groupID: 'g', baseMessage: '' }) }),
  ];

  it('uses the name when exactly one recipient is selected', async () => {
    const group = pair('birthday');
    const h = harness(group);
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: group }, h.deps);
    model.getState().updateRecipient('kb', { selected: false });
    await model.getState().generate(false);
    expect(model.getState().settings.baseMessage).toBe('Happy Birthday, Asha! Wishing you a wonderful day and a fantastic year ahead! 🎉');
  });

  it('leaves the name out with several, so each wish carries its own', async () => {
    const group = pair('anniversary');
    const h = harness(group);
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: group }, h.deps);
    expect(selectedRecipients(model.getState())).toHaveLength(2);
    await model.getState().generate(false);
    const shared = model.getState().settings.baseMessage;
    expect(shared).toBe('Happy Anniversary! Wishing you a wonderful day and a fantastic year ahead! 🎉');

    // Each recipient's delivered body: exactly one greeting, naming that person and no one else.
    const [asha, ravi] = model.getState().recipients;
    expect(deliveryMessage(model.getState(), asha)).toBe('Happy Anniversary, Asha! Wishing you a wonderful day and a fantastic year ahead! 🎉');
    expect(deliveryMessage(model.getState(), ravi)).toBe('Happy Anniversary, Ravi! Wishing you a wonderful day and a fantastic year ahead! 🎉');
    for (const recipient of model.getState().recipients) {
      const body = deliveryMessage(model.getState(), recipient);
      expect(body.match(/Happy Anniversary/g)).toHaveLength(1);
      expect(body).not.toContain(recipient.key === 'ka' ? 'Ravi' : 'Asha');
    }
  });

  it('leaves the name out when none is selected yet', async () => {
    const group = pair('birthday');
    const h = harness(group);
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: group }, h.deps);
    for (const key of ['ka', 'kb']) model.getState().updateRecipient(key, { selected: false });
    await model.getState().generate(false);
    expect(model.getState().settings.baseMessage).toBe('Happy Birthday! Wishing you a wonderful day and a fantastic year ahead! 🎉');
  });

  it('still addresses a festival by its title', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    await model.getState().generate(false);
    expect(model.getState().settings.baseMessage).toBe('Diwali! Wishing you and your family a joyful celebration filled with happiness and new beginnings! ✨');
  });
});

describe('tab changes auto-save', () => {
  it('changes tab straight away when nothing is dirty', async () => {
    const h = harness(festivalGroup());
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    await model.getState().changeTab('Contacts');
    expect(model.getState().tab).toBe('Contacts');
    expect(h.post).not.toHaveBeenCalled();
  });

  it('saves pending edits first, and moves only when the save succeeds', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setTitle('Diwali 2030');
    h.setSnapshot(festivalGroup().map((item) => ({ ...item, title: 'Diwali 2030' })));
    await model.getState().changeTab('Wish Message');
    expect(h.post).toHaveBeenCalledWith('festivalSave', expect.objectContaining({ ids: ['a', 'b'], title: 'Diwali 2030', cancelSchedules: false }), undefined);
    expect(model.getState().tab).toBe('Wish Message');
    expect(model.getState().notice).toBe('Moment changes saved.');
    expect(isDirty(model.getState())).toBe(false);
  });

  // ManageFestivalModel.swift:117: a failed ordinary save shows the error and keeps the edits,
  // but does not trap you on the tab you were leaving.
  it('a failed save keeps the edits and the error, and still moves between steps', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setTitle('');
    await model.getState().changeTab('Schedule');
    expect(model.getState().tab).toBe('Schedule');
    expect(model.getState().error).toBe('Enter a moment name of 1–150 characters.');
    expect(model.getState().pendingTab).toBeNull();
    // The edit is still in memory, so it can be corrected rather than retyped.
    expect(model.getState().title).toBe('');
    expect(isDirty(model.getState())).toBe(true);
  });

  it('asks before cancelling existing schedules, then saves with cancelSchedules and moves on', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setYearly(true);
    h.post.mockRejectedValueOnce(new ApiError({ status: 409, message: 'Existing schedules must be cancelled before saving changes. Review and schedule again.' }));
    await model.getState().changeTab('Contacts');
    expect(model.getState().needsScheduleConfirmation).toBe(true);
    expect(model.getState().tab).toBe('Details');
    expect(model.getState().pendingTab).toBe('Contacts');
    await model.getState().save(true);
    expect(h.post).toHaveBeenLastCalledWith('festivalSave', expect.objectContaining({ cancelSchedules: true }), undefined);
    expect(model.getState().tab).toBe('Contacts');
    expect(model.getState().notice).toBe('Changes saved. Review and schedule your updated wish again.');
  });

  it('says so when there is nothing to save', async () => {
    const h = harness([]);
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    await model.getState().save();
    expect(model.getState().notice).toBe('No changes to save. Your existing schedule is unchanged.');
  });
});

describe('recipient and archive rules', () => {
  it('an archived recipient left in the snapshot does not block the save, and is not re-adopted', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setRecipients(model.getState().recipients.filter((recipient) => recipient.key === 'ka'));
    model.getState().invalidateApproval();
    const archivedB = { ...festivalGroup()[1], festivalSettings: groupSettings({ archived: true }) };
    h.setSnapshot([festivalGroup()[0], archivedB]);
    await model.getState().save();
    expect(model.getState().error).toBeNull();
    expect(model.getState().originals.map((item) => item.id)).toEqual(['a']);
  });

  it('adopts the ids the server gave new recipients, by their source key', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setRecipients([...model.getState().recipients, { key: 'kc', name: 'Cara', phone: '', email: 'cara@example.com', selected: true, contactIdentifier: '' }]);
    h.setSnapshot([...festivalGroup(), moment({ id: 'c', type: 'festival', title: 'Diwali', firstName: 'Cara', sourceKey: 'festival:g:kc', festivalSettings: groupSettings() })]);
    await model.getState().save();
    expect(model.getState().recipients.find((recipient) => recipient.key === 'kc')?.momentID).toBe('c');
    const sent = h.post.mock.calls.find(([operation]) => operation === 'festivalSave')?.[1] as { recipients: { id?: string; key: string; phone: string }[]; settings: { selected: Record<string, boolean> } };
    expect(sent.recipients.find((recipient) => recipient.key === 'kc')?.id).toBeUndefined();
    expect(sent.settings.selected).toEqual({ ka: true, kb: false, kc: true });
  });

  it('reports "Saved. Refresh…" when the saved group cannot be found', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setTitle('Other');
    h.setSnapshot([]);
    await model.getState().save();
    expect(model.getState().error).toBe('Saved. Refresh Moments before continuing.');
  });

  // ManageFestivalModel.swift:122: the past-date rejection is gone. A moment that has already
  // happened saves; only scheduling a delivery still needs a future time.
  it('saves a past moment date', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setDate(Date.parse('2030-08-01T00:00:00Z'));
    await model.getState().save();
    expect(model.getState().error).toBeNull();
    expect(h.post).toHaveBeenCalledWith('festivalSave', expect.objectContaining({ date: '2030-08-01' }), undefined);
  });
});

describe('approve and schedule', () => {
  it('approval saves approvedAt and clears it again if the save needs confirmation', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    h.post.mockRejectedValueOnce(new ApiError({ status: 409, message: 'Existing schedules must be cancelled before saving changes. Review and schedule again.' }));
    await model.getState().approve();
    expect(model.getState().settings.approvedAt).toBeNull();
    model.getState().updateSettings({ baseMessage: ' ' });
    await model.getState().approve();
    expect(model.getState().error).toBe('Each message must contain 1–500 characters.');
  });

  /**
   * ITEM 5. A message-only save used to go out with `cancelSchedules:true` behind the cancel prompt,
   * throwing away the pending wishes to change their text. The server now rewrites them in place
   * (src/server/moments/festival.ts `onlyMessageChanged`), so the client asks for that instead.
   */
  describe('a message-only save keeps the schedules', () => {
    /** A group with a pending delivery, so `hasSchedules` is true. */
    function scheduled() {
      const approved = groupSettings({ approvedAt: '2030-08-30T00:00:00Z', baseMessage: 'Happy Diwali' });
      return festivalGroup().map((item) => ({
        ...item,
        festivalSettings: approved,
        drafts: [draft({ momentID: item.id, plans: [plan({ status: 'SCHEDULED' })] })],
      }));
    }

    it('sends cancelSchedules:false and says the pending wishes follow the new text', async () => {
      const h = harness(scheduled());
      await h.store.getState().activate('u');
      const model = createManageModel({ id: 'g', moments: scheduled() }, h.deps);
      expect(hasSchedules(model.getState(), h.store.getState())).toBe(true);

      model.getState().setMessage('Diwali at ours this year — do come.');
      expect(pendingChange(model.getState())).toBe('messageOnly');
      await model.getState().approve();

      const sent = h.post.mock.calls.find(([operation]) => operation === 'festivalSave')?.[1] as { cancelSchedules: boolean };
      expect(sent.cancelSchedules).toBe(false);
      expect(model.getState().needsScheduleConfirmation).toBe(false);
      expect(model.getState().notice).toBe('Message saved. Scheduled wishes will send the updated message.');
      expect(model.getState().error).toBeNull();
    });

    it('still counts a recipient, date or channel edit as a delivery change', async () => {
      const h = harness(scheduled());
      await h.store.getState().activate('u');
      const model = createManageModel({ id: 'g', moments: scheduled() }, h.deps);

      model.getState().setMessage('Edited');
      expect(pendingChange(model.getState())).toBe('messageOnly');
      model.getState().updateRecipient('ka', { email: 'asha@example.com' });
      expect(pendingChange(model.getState())).toBe('delivery');
      model.getState().updateSettings({ channels: { ...model.getState().settings.channels, ka: 'share' } });
      expect(pendingChange(model.getState())).toBe('delivery');
      model.getState().setDate(Date.parse('2030-10-01T00:00:00Z'));
      expect(pendingChange(model.getState())).toBe('delivery');
    });

    it('shows a clear inline message when the wish is already being sent', async () => {
      const h = harness(scheduled());
      await h.store.getState().activate('u');
      const model = createManageModel({ id: 'g', moments: scheduled() }, h.deps);
      model.getState().setMessage('Too late');
      h.post.mockRejectedValueOnce(new ApiError({ status: 409, message: 'A delivery is in progress. Refresh before editing.' }));
      await model.getState().approve();
      // Nothing to confirm, so this is an inline message rather than the cancel prompt.
      expect(model.getState().needsScheduleConfirmation).toBe(false);
      expect(model.getState().error).toBe(SENDING_NOW);
      expect(model.getState().settings.approvedAt).toBeNull();
    });

    it('saves and approves a message edited in the card editor', async () => {
      const h = harness(scheduled());
      await h.store.getState().activate('u');
      const model = createManageModel({ id: 'g', moments: scheduled() }, h.deps);
      model.getState().chooseImage({ id: 'v', base64: 'AAAA' });
      model.getState().setMessage('Written on the card itself');

      expect(await model.getState().saveGreetingCard()).toBe(true);
      // The card's text is the wish, so it goes through festivalSave, not greetingCardSave.
      const operations = h.post.mock.calls.map(([operation]) => operation);
      expect(operations).toContain('festivalSave');
      expect(operations).not.toContain('greetingCardSave');
      expect(model.getState().settings.approvedAt).not.toBeNull();
      expect(model.getState().notice).toBe('Greeting card saved. Scheduled wishes will send the updated message.');
      expect(h.cards.capture).toHaveBeenLastCalledWith('Written on the card itself');
    });

    it('asks the person to review in Manage Moment when the card’s message needs the cancel prompt', async () => {
      const h = harness(scheduled());
      await h.store.getState().activate('u');
      const model = createManageModel({ id: 'g', moments: scheduled() }, h.deps);
      model.getState().chooseImage({ id: 'v', base64: 'AAAA' });
      model.getState().setMessage('Card text the server will not take');
      h.post.mockRejectedValueOnce(new ApiError({ status: 409, message: 'Existing schedules must be cancelled before saving changes. Review and schedule again.' }));

      expect(await model.getState().saveGreetingCard()).toBe(false);
      expect(model.getState().error).toBe(CARD_MESSAGE_NEEDS_REVIEW);
      expect(model.getState().settings.approvedAt).toBeNull();
    });
  });

  it('schedules each selected recipient once, with a deterministic idempotency key', async () => {
    const approved = groupSettings({ approvedAt: '2030-08-30T00:00:00Z', selected: { ka: true, kb: false } });
    const group = festivalGroup().map((item) => ({ ...item, festivalSettings: approved }));
    const h = harness(group);
    await h.store.getState().activate('u');
    h.post.mockImplementation(async (operation: string) => {
      if (operation === 'generate') return { draft: draft({ id: 'gen' }) } as never;
      if (operation === 'approve') return { draft: draft({ id: 'approved' }) } as never;
      if (operation === 'schedule') return { plan: plan({ id: 'new-plan', idempotencyKey: 'x' }) } as never;
      return { ok: true } as never;
    });
    const model = createManageModel({ id: 'g', moments: group }, h.deps);
    await model.getState().schedule();
    expect(model.getState().error).toBeNull();
    expect(model.getState().scheduleCompleted).toBe(true);
    expect(model.getState().notice).toBe('1 wishes scheduled. Messages requires confirmation.');
    const scheduled = h.post.mock.calls.filter(([operation]) => operation === 'schedule').map(([, input]) => input as Record<string, unknown>);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({
      draftID: 'approved',
      channel: 'messages',
      recipient: '+15555550100',
      scheduledAtUTC: '2030-09-20T08:00:00Z',
      automaticDelivery: false,
      reminderOffset: 60,
      repeatYearly: false,
      sendNow: false,
      approved: true,
    });
    expect(scheduled[0].idempotencyKey).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  });

  it('refuses to schedule unsaved edits', async () => {
    const approved = groupSettings({ approvedAt: '2030-08-30T00:00:00Z' });
    const group = festivalGroup().map((item) => ({ ...item, festivalSettings: approved }));
    const h = harness(group);
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: group }, h.deps);
    model.getState().setNotify(false);
    await model.getState().schedule();
    expect(model.getState().error).toBe('Save your changes before scheduling.');
  });

  it('knows when a group still has schedules', () => {
    const h = harness([]);
    const scheduled = moment({ id: 's', drafts: [draft({ plans: [plan({ status: 'SCHEDULED' })] })] });
    const model = createManageModel({ id: 's', moments: [scheduled] }, h.deps);
    expect(hasSchedules(model.getState(), h.store.getState())).toBe(true);
  });
});

describe('greeting card', () => {
  it('stores chosen artwork on the device and only the settings on the server', async () => {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().chooseImage({ id: 'v', base64: 'AAAA' });
    expect(h.images.store).toHaveBeenCalledWith('AAAA');
    expect(model.getState().settings.imageID).toBe('IMG.png');
    expect(model.getState().imageUri).toBe('file:///IMG.png');
    const ok = await model.getState().saveGreetingCard();
    expect(ok).toBe(true);
    const saved = h.post.mock.calls.find(([operation]) => operation === 'greetingCardSave')?.[1] as { settings: Record<string, unknown> };
    expect(saved.settings).toEqual({ groupID: 'g', imageID: 'IMG.png', imageStyle: 'Traditional', imageAspect: 'Portrait', imagePrompt: '' });
    expect(model.getState().notice).toBe('Greeting card saved.');
  });

  // ITEM 1. The suggestion used to be written into the saved settings the moment the screen opened.
  it('never saves the suggestion as the wish message', async () => {
    const h = harness(festivalGroup().map((item) => ({ ...item, festivalSettings: groupSettings({ baseMessage: '' }) })));
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: h.store.getState().snapshot?.moments ?? [] }, h.deps);
    expect(model.getState().settings.baseMessage).toBe('');
    expect(messageSuggestion(model.getState())).toBe(fallbackWish('Diwali', 'Warm'));
    // Opening and saving something unrelated leaves the wish empty rather than shipping the placeholder.
    model.getState().setTitle('Diwali at home');
    await model.getState().save();
    const sent = h.post.mock.calls.find(([operation]) => operation === 'festivalSave')?.[1] as { settings: { baseMessage: string } };
    expect(sent.settings.baseMessage).toBe('');
    // And it cannot be approved until there is real text.
    await model.getState().approve();
    expect(model.getState().error).toBe('Each message must contain 1–500 characters.');
    // "Use suggestion" is what saves it.
    model.getState().useSuggestion();
    expect(model.getState().settings.baseMessage).toBe(fallbackWish('Diwali at home', 'Warm'));
    expect(model.getState().settings.manuallyEdited).toBe(false);
  });

  // ITEM 1/3. A card greeting saved by an older version becomes the wish, pending a fresh approval.
  it('adopts an older card greeting as the wish message and asks for a save', () => {
    const h = harness([]);
    const stale = festivalGroup().map((item) => ({
      ...item,
      festivalSettings: groupSettings({ baseMessage: fallbackWish('Diwali', 'Warm'), approvedAt: 'then', cardGreeting: 'Asha, come early!' }),
    }));
    const model = createManageModel({ id: 'g', moments: stale }, h.deps);
    expect(model.getState().settings.baseMessage).toBe('Asha, come early!');
    expect(model.getState().settings.cardGreeting).toBeNull();
    expect(model.getState().settings.approvedAt).toBeNull();
    expect(model.getState().notice).toBe('Your card’s greeting is now your Wish Message. Tap Save Message to use it for scheduled wishes.');
    // It reads as an unsaved change, so Save Message is what commits it.
    expect(isDirty(model.getState())).toBe(true);
  });

  // ITEM 3. One string: the card shows the wish, and a recipient's own message on their card.
  it('prints the wish message on the card, and an override on that recipient’s card', () => {
    const h = harness([]);
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().setMessage('Wishing you light and sweets.');
    expect(cardMessage(model.getState())).toBe('Wishing you light and sweets.');
    const [asha, ben] = model.getState().recipients;
    expect(cardMessageFor(model.getState(), asha)).toBe('Wishing you light and sweets.');
    model.getState().updateSettings({ overrides: { kb: 'Ben, save me a laddu.' } });
    expect(cardMessageFor(model.getState(), ben)).toBe('Ben, save me a laddu.');
    expect(cardMessage(model.getState())).toBe('Wishing you light and sweets.');
  });

  it('keeps the fingerprint stable for identical state', () => {
    const h = harness([]);
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    expect(fingerprint(model.getState())).toBe(model.getState().baseline);
    expect(readFestivalSettings(groupSettings())).not.toBeNull();
    expect(displayGroups(festivalGroup())).toHaveLength(1);
  });
});

/**
 * The finished card's image, on its own route (`PUT/GET/DELETE /api/moments/{id}/card`) rather than
 * the `/api/moments` envelope. Saving the card is what triggers the upload; the card stays saved
 * whatever the upload does.
 */
describe('greeting card image', () => {
  async function withCard() {
    const h = harness(festivalGroup());
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    model.getState().chooseImage({ id: 'v', base64: 'AAAA' });
    return { h, model };
  }

  it('renders and uploads the card after the card is saved', async () => {
    const { h, model } = await withCard();
    await model.getState().saveGreetingCard();
    expect(h.cards.capture).toHaveBeenCalledTimes(1);
    expect(h.cards.encode).toHaveBeenCalledWith('file:///capture.jpg');
    expect(h.cards.upload).toHaveBeenCalledWith('a', 'CARD-1600');
    expect(model.getState().card).toMatchObject({ id: 'card-1', mime: 'image/jpeg' });
    expect(model.getState().cardFailed).toBe(false);
  });

  it('uploads on the ordinary save too, because Manage Moment never sends greetingCardSave', async () => {
    const { h, model } = await withCard();
    model.getState().setTitle('Diwali at home');
    await model.getState().save();
    expect(h.cards.upload).toHaveBeenCalledWith('a', 'CARD-1600');
  });

  it('does not re-upload an unchanged card on an unrelated save', async () => {
    const { h, model } = await withCard();
    await model.getState().saveGreetingCard();
    // One render for the shared wish, sent to both moments in the group.
    expect(h.cards.capture).toHaveBeenCalledTimes(1);
    expect(h.cards.upload.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
    model.getState().setZone('America/New_York');
    await model.getState().save();
    expect(h.cards.upload).toHaveBeenCalledTimes(2);
  });

  it('keeps the card saved and shows the inline note when the upload fails', async () => {
    const { h, model } = await withCard();
    h.cards.upload.mockRejectedValueOnce(new ApiError({ status: 500, message: 'Request failed.' }));
    const ok = await model.getState().saveGreetingCard();
    // The card itself saved: only its image did not reach the server.
    expect(ok).toBe(true);
    expect(model.getState().notice).toBe('Greeting card saved.');
    expect(model.getState().error).toBeNull();
    expect(model.getState().cardFailed).toBe(true);
    expect(model.getState().card).toBeNull();
  });

  it('retries the upload and clears the note on success', async () => {
    const { h, model } = await withCard();
    h.cards.upload.mockRejectedValueOnce(new ApiError({ status: 500, message: 'Request failed.' }));
    await model.getState().saveGreetingCard();
    expect(model.getState().cardFailed).toBe(true);
    await model.getState().retryCardUpload();
    // The failed attempt, then both moments on the retry.
    expect(h.cards.upload).toHaveBeenCalledTimes(3);
    expect(model.getState().cardFailed).toBe(false);
    expect(model.getState().card).toMatchObject({ id: 'card-1' });
  });

  it('re-encodes smaller and retries once on a 413', async () => {
    const { h, model } = await withCard();
    h.cards.upload.mockRejectedValueOnce(new ApiError({ status: 413, message: 'The card image is too large.' }));
    await model.getState().saveGreetingCard();
    expect(h.cards.encodeSmaller).toHaveBeenCalledWith('file:///capture.jpg');
    // The smaller encoding is reused for the rest of the group rather than re-encoded per moment.
    expect(h.cards.upload.mock.calls.map(([, data]) => data)).toEqual(['CARD-1600', 'CARD-1120', 'CARD-1120']);
    expect(h.cards.encodeSmaller).toHaveBeenCalledTimes(1);
    expect(model.getState().cardFailed).toBe(false);
    expect(model.getState().card).toMatchObject({ id: 'card-1' });
  });

  it('gives up after one smaller retry when the 413 repeats', async () => {
    const { h, model } = await withCard();
    h.cards.upload.mockRejectedValue(new ApiError({ status: 413, message: 'The card image is too large.' }));
    await model.getState().saveGreetingCard();
    expect(h.cards.upload).toHaveBeenCalledTimes(2);
    expect(model.getState().cardFailed).toBe(true);
  });

  it('removes the local artwork and the stored card in one action', async () => {
    const { h, model } = await withCard();
    await model.getState().saveGreetingCard();
    expect(model.getState().card).not.toBeNull();
    await model.getState().removeCard();
    expect(h.cards.remove).toHaveBeenCalledWith('a');
    // Both halves: nothing left on the device, and nothing left for scheduled emails.
    expect(model.getState().card).toBeNull();
    expect(model.getState().imageUri).toBeNull();
    expect(model.getState().settings.imageID).toBe('');
    expect(model.getState().settings.includeImage).toBe(false);
    expect(model.getState().notice).toBe('Card removed. Scheduled emails will send the text only.');
  });

  it('clears the artwork without a request when the server holds no card', async () => {
    const { h, model } = await withCard();
    expect(model.getState().card).toBeNull();
    await model.getState().removeCard();
    expect(h.cards.remove).not.toHaveBeenCalled();
    expect(model.getState().imageUri).toBeNull();
    expect(model.getState().settings.imageID).toBe('');
  });

  it('treats a 404 as already removed, not as a failure', async () => {
    const { h, model } = await withCard();
    await model.getState().saveGreetingCard();
    h.cards.remove.mockRejectedValueOnce(new ApiError({ status: 404, message: 'No greeting card has been saved for this moment.' }));
    await model.getState().removeCard();
    expect(model.getState().error).toBeNull();
    expect(model.getState().card).toBeNull();
    expect(model.getState().imageUri).toBeNull();
    expect(model.getState().notice).toBe('Card removed. Scheduled emails will send the text only.');
  });

  it('keeps the card on both sides when the delete genuinely fails', async () => {
    const { h, model } = await withCard();
    await model.getState().saveGreetingCard();
    h.cards.remove.mockRejectedValueOnce(new ApiError({ status: 500, message: 'Request failed.' }));
    await model.getState().removeCard();
    expect(model.getState().error).toBe('Request failed.');
    // The artwork stays too: a cleared preview over a card the server still attaches would lie.
    expect(model.getState().card).not.toBeNull();
    expect(model.getState().imageUri).toBe('file:///IMG.png');
  });

  it('uploads again after a removed card is replaced', async () => {
    const { h, model } = await withCard();
    await model.getState().saveGreetingCard();
    await model.getState().removeCard();
    model.getState().chooseImage({ id: 'v2', base64: 'BBBB' });
    await model.getState().saveGreetingCard();
    expect(h.cards.upload).toHaveBeenCalledTimes(4);
  });

  // ITEM 4. The upload used to send whatever the preview last rendered, from a fingerprint that did
  // not include the message at all.
  it('re-renders and re-uploads the card after the wish message changes', async () => {
    const { h, model } = await withCard();
    model.getState().setMessage('First wish');
    await model.getState().saveGreetingCard();
    expect(h.cards.capture).toHaveBeenLastCalledWith('First wish');
    expect(h.cards.upload).toHaveBeenCalledTimes(2);

    // A message-only edit is enough to re-render: the fingerprint carries each moment's text.
    model.getState().setMessage('Second wish');
    await model.getState().save();
    expect(h.cards.capture).toHaveBeenLastCalledWith('Second wish');
    expect(h.cards.upload).toHaveBeenCalledTimes(4);
    expect(model.getState().cardFailed).toBe(false);
  });

  it('renders one card per distinct recipient text', async () => {
    const { h, model } = await withCard();
    model.getState().setMessage('Shared wish');
    model.getState().updateSettings({ overrides: { kb: 'Ben, save me a laddu.' } });
    await model.getState().saveGreetingCard();
    // Two texts, two renders — and each moment gets the card its own recipient will see.
    expect(h.cards.capture.mock.calls.map(([message]) => message)).toEqual(['Shared wish', 'Ben, save me a laddu.']);
    expect(h.cards.upload.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
  });

  it('shows a card saved on another device, where there is no local artwork', async () => {
    const stored = festivalGroup().map((item) => ({ ...item, card: { id: 'card-9', mime: 'image/jpeg', size: 4096, sha256: 'b'.repeat(64), createdAt: '2030-08-01T00:00:00.000Z' } }));
    const h = harness(stored);
    await h.store.getState().activate('u');
    const model = createManageModel({ id: 'g', moments: stored }, h.deps);
    // Nothing local: the artwork was generated on the other device.
    expect(model.getState().imageUri).toBeNull();
    expect(model.getState().card).toMatchObject({ id: 'card-9' });
    h.cards.fetch.mockResolvedValueOnce({ base64: 'STORED', mime: 'image/jpeg' });
    await model.getState().loadStoredCard();
    expect(h.cards.fetch).toHaveBeenCalledWith('a');
    expect(h.images.store).toHaveBeenCalledWith('STORED');
    expect(model.getState().imageUri).toBe('file:///IMG.png');
  });

  it('leaves local artwork alone when one is already on this device', async () => {
    const { h, model } = await withCard();
    await model.getState().loadStoredCard();
    expect(h.cards.fetch).not.toHaveBeenCalled();
  });
});
