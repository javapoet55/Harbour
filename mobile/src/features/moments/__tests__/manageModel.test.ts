import { ApiError } from '../../../api/client';
import type { ImportantMoment, MomentsSnapshot } from '../../../api/moments';
import { displayGroups, readFestivalSettings } from '../domain';
import { createManageModel, deliveryMessage, fingerprint, hasSchedules, isDirty, reviewHeading, type ManageDeps } from '../manageModel';
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
  const deps: ManageDeps = {
    store,
    images,
    validateContacts: jest.fn(async () => undefined),
    sha256Hex: async (value) => Array.from({ length: 64 }, (_, index) => ((value.length + index) % 16).toString(16)).join(''),
    uuid: () => 'UUID',
    now: () => NOW,
  };
  return {
    store,
    post,
    deps,
    images,
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

  it('starts a new moment with no recipients and a type-specific base message', () => {
    const h = harness([]);
    const model = createManageModel({ id: 'x', moments: [moment({ id: 'x', title: 'Get Well Soon', type: 'getWellSoon' })] }, h.deps);
    expect(model.getState().recipients).toEqual([]);
    expect(model.getState().settings.baseMessage).toBe('Get well soon. Wishing you comfort, rest, and brighter days ahead.');
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

  it('keeps the fingerprint stable for identical state', () => {
    const h = harness([]);
    const model = createManageModel({ id: 'g', moments: festivalGroup() }, h.deps);
    expect(fingerprint(model.getState())).toBe(model.getState().baseline);
    expect(readFestivalSettings(groupSettings())).not.toBeNull();
    expect(displayGroups(festivalGroup())).toHaveLength(1);
  });
});
