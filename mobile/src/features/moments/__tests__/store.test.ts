import { createApiClient } from '../../../api/client';
import { momentsApi, operationTimeout, type MomentsSnapshot } from '../../../api/moments';
import { createMomentsStore, reminderStatusText, type MomentsDeps } from '../store';
import type { ReminderAuthorization } from '../notifications';
import { draft, moment, plan } from '../testFixtures';

function snapshot(overrides: Partial<MomentsSnapshot> = {}): MomentsSnapshot {
  return { moments: [moment()], emailAccount: null, emailConfigured: false, automaticEmailEnabled: false, ...overrides };
}

function deps(overrides: Partial<MomentsDeps> = {}) {
  const api = {
    snapshot: jest.fn(async () => snapshot()),
    post: jest.fn(async (): Promise<never> => ({ ok: true }) as never),
    deleteAll: jest.fn(async () => ({ ok: true as const })),
  };
  const value: MomentsDeps & { api: typeof api } = {
    api,
    ownerKey: jest.fn(async (id: string) => `hash-${id}`),
    authorization: jest.fn(async () => 'authorized' as const),
    requestAuthorization: jest.fn(async () => undefined),
    replaceNotifications: jest.fn(async () => null),
    clearNotifications: jest.fn(async () => undefined),
    now: () => Date.parse('2030-09-01T12:00:00Z'),
    ...overrides,
  } as MomentsDeps & { api: typeof api };
  return value;
}

describe('momentsApi', () => {
  function recordingClient() {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ ok: true, moments: [] }), { status: 200 });
      },
    });
    return { client, calls };
  }

  it('POSTs the MomentEnvelope { operation, input, id }', async () => {
    const { client, calls } = recordingClient();
    await momentsApi.post('save', { title: 'A' }, 'm1', client);
    expect(calls[0].url).toBe('https://api.example.com/api/moments');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ operation: 'save', input: { title: 'A' }, id: 'm1' });
  });

  it('omits id and input when they are absent, and GETs and DELETEs the same path', async () => {
    const { client, calls } = recordingClient();
    await momentsApi.post('festivalCatalog', undefined, undefined, client);
    await momentsApi.snapshot(client);
    await momentsApi.deleteAll(client);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ operation: 'festivalCatalog' });
    expect(calls[1].init.method).toBe('GET');
    expect(calls[2].init.method).toBe('DELETE');
  });

  it('gives artwork 150s and everything else 50s', () => {
    expect(operationTimeout('greetingArtwork')).toBe(150_000);
    expect(operationTimeout('schedule')).toBe(50_000);
  });
});

describe('ImportantMomentsStore', () => {
  it('activates an account by its owner key, loads the snapshot and rebuilds reminders', async () => {
    const d = deps();
    const store = createMomentsStore(d);
    await store.getState().activate('user-1');
    expect(store.getState().owner).toBe('hash-user-1');
    expect(store.getState().snapshot?.moments).toHaveLength(1);
    expect(store.getState().lastSynced).toBe(d.now());
    expect(d.replaceNotifications).toHaveBeenCalledWith(expect.objectContaining({ owner: 'hash-user-1', moments: [expect.objectContaining({ id: 'm' })] }));
  });

  it('clears the old account’s snapshot and reminders when the account changes', async () => {
    const d = deps();
    const store = createMomentsStore(d);
    await store.getState().activate('user-1');
    await store.getState().activate(null);
    expect(store.getState().snapshot).toBeNull();
    expect(store.getState().owner).toBeNull();
    expect(d.clearNotifications).toHaveBeenCalled();
  });

  it('does not refresh when signed out', async () => {
    const d = deps();
    await createMomentsStore(d).getState().refresh();
    expect(d.api.snapshot).not.toHaveBeenCalled();
  });

  it('reports a failed refresh with Swift’s prefix', async () => {
    const d = deps();
    const store = createMomentsStore(d);
    await store.getState().activate('u');
    d.api.snapshot.mockRejectedValueOnce(new Error('Offline.'));
    await store.getState().refresh();
    expect(store.getState().error).toBe('Couldn’t refresh Important Moments. Offline.');
  });

  it('shows the notification rebuild’s own notice', async () => {
    const d = deps({ replaceNotifications: jest.fn(async () => 'Only the next 3 wish reminders fit on this device. Reopen Nexdo to refresh later reminders.') });
    const store = createMomentsStore(d);
    await store.getState().activate('u');
    expect(store.getState().error).toMatch(/^Only the next 3/);
  });

  it('drops an answer that lands after the account changed', async () => {
    const d = deps();
    const store = createMomentsStore(d);
    await store.getState().activate('u');
    d.api.snapshot.mockImplementationOnce(async () => {
      // The account changes while the request is in flight.
      store.setState((state) => ({ generation: state.generation + 1 }));
      return snapshot({ moments: [moment({ id: 'stale' })] });
    });
    await store.getState().refresh();
    expect(store.getState().snapshot?.moments[0].id).toBe('m');
  });

  it('refuses a request when signed out, and a response that outlived its account', async () => {
    const d = deps();
    const store = createMomentsStore(d);
    await expect(store.getState().request('save', {})).rejects.toMatchObject({ code: 'SIGNED_OUT' });
    await store.getState().activate('u');
    d.api.post.mockImplementationOnce(async () => {
      store.setState((state) => ({ generation: state.generation + 1 }));
      return { ok: true } as never;
    });
    await expect(store.getState().request('save', {})).rejects.toMatchObject({ code: 'SIGNED_OUT' });
  });

  it('perform: one at a time, refreshes after success, keeps the error on failure', async () => {
    const d = deps();
    const store = createMomentsStore(d);
    await store.getState().activate('u');
    d.api.snapshot.mockClear();
    let finish: () => void = () => undefined;
    const first = store.getState().perform(() => new Promise<void>((resolve) => (finish = resolve)));
    const second = jest.fn(async () => undefined);
    await store.getState().perform(second);
    expect(second).not.toHaveBeenCalled();
    expect(store.getState().busy).toBe(true);
    finish();
    await first;
    expect(store.getState().busy).toBe(false);
    expect(d.api.snapshot).toHaveBeenCalledTimes(1);
    await store.getState().perform(async () => {
      throw new Error('Cancel the active wish before changing its moment.');
    });
    expect(store.getState().error).toBe('Cancel the active wish before changing its moment.');
  });

  it('publishes a saved moment before any refresh', async () => {
    const d = deps();
    const store = createMomentsStore(d);
    await store.getState().activate('u');
    d.api.post.mockResolvedValueOnce({ moment: moment({ id: 'new', title: 'New' }) } as never);
    const id = await store.getState().save({ type: 'birthday', title: 'New', firstName: '', phone: '', email: '', occurrenceDate: '2030-01-01', timeZoneID: 'UTC', yearly: true, source: 'manual', sourceKey: 'k' });
    expect(id).toBe('new');
    expect(store.getState().snapshot?.moments.map((item) => item.id)).toEqual(['m', 'new']);
    expect(d.api.post).toHaveBeenCalledWith('save', expect.objectContaining({ title: 'New' }), undefined);
  });

  it('sends plan actions, snoozes and deletes as Swift does', async () => {
    const d = deps();
    const store = createMomentsStore(d);
    await store.getState().activate('u');
    await store.getState().planAction(plan({ id: 'p1' }), 'reschedule', Date.parse('2030-10-01T08:00:00.500Z'), 'Asia/Kolkata');
    expect(d.api.post).toHaveBeenLastCalledWith('plan', { id: 'p1', action: 'reschedule', scheduledAtUTC: '2030-10-01T08:00:00Z', timeZoneID: 'Asia/Kolkata' }, undefined);
    await store.getState().visibility(moment({ id: 'm1' }), true, true);
    expect(d.api.post).toHaveBeenLastCalledWith('visibility', { id: 'm1', enabled: true, snoozedUntil: '2030-09-01T13:00:00Z' }, undefined);
    await store.getState().visibility(moment({ id: 'm1' }), false);
    expect(d.api.post).toHaveBeenLastCalledWith('visibility', { id: 'm1', enabled: false, snoozedUntil: null }, undefined);
    await store.getState().deleteData();
    expect(d.api.deleteAll).toHaveBeenCalled();
    expect(store.getState().snapshot).toBeNull();
  });

  it('asks for notifications once and never overrides a denial', async () => {
    const d = deps({ authorization: jest.fn(async () => 'notDetermined' as const) });
    const store = createMomentsStore(d);
    (d.authorization as jest.Mock).mockResolvedValueOnce('notDetermined').mockResolvedValueOnce('denied');
    await expect(store.getState().authorizeNotifications()).rejects.toThrow('Notifications are off.');
    expect(d.requestAuthorization).toHaveBeenCalledTimes(1);
    (d.authorization as jest.Mock).mockResolvedValue('denied');
    await store.getState().prepareDefaultReminders();
    expect(d.requestAuthorization).toHaveBeenCalledTimes(1);
    expect(reminderStatusText(store.getState())).toBe("Wish reminders are off in your phone's Settings");
    expect(reminderStatusText({ reminderStatusLoaded: false, reminderAuthorization: 'authorized' })).toBe('Checking notification permission…');
    const unknown = 'restricted' as unknown as ReminderAuthorization;
    expect(reminderStatusText({ reminderStatusLoaded: true, reminderAuthorization: unknown })).toBe("Check notification permission in your phone's Settings");
  });

  it('resolves a notification route to an enabled moment, by its id or an editable plan id, for the same owner only', async () => {
    const withPlan = moment({ id: 'm2', drafts: [draft({ plans: [plan({ id: 'plan-1' })] })] });
    const d = deps();
    d.api.snapshot.mockResolvedValue(snapshot({ moments: [moment({ id: 'off', enabled: false }), withPlan] }));
    const store = createMomentsStore(d);
    await store.getState().activate('u');
    store.getState().receiveRoute('plan-1', 'someone-else');
    store.getState().resolveRoute();
    expect(store.getState().route).toBeNull();
    store.getState().receiveRoute('plan-1', 'hash-u');
    store.getState().resolveRoute();
    expect(store.getState().route?.id).toBe('m2');
    store.getState().clearRoute();
    store.getState().receiveRoute('off', 'hash-u');
    await store.getState().refresh();
    expect(store.getState().route).toBeNull();
    expect(store.getState().pendingRoute).toBeNull();
  });
});
