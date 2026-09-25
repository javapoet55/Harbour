import { ApiError, createApiClient } from '../../../api/client';
import { shoppingApi, shareUrl, type GroceryList, type ShoppingEnvelope, type ShoppingResult } from '../../../api/shopping';
import { listInput } from '../model';
import { createShoppingStore } from '../store';

function list(overrides: Partial<GroceryList> = {}): GroceryList {
  return { id: 'l1', title: 'Weekly', date: '2026-09-25', timeZone: 'UTC', weekly: true, revision: 4, completedAt: null, shareToken: null, items: [], ...overrides };
}

function harness(lists: GroceryList[] = [list()]) {
  const post = jest.fn<Promise<ShoppingResult>, [ShoppingEnvelope]>(async () => ({ list: list() }));
  const snapshot = jest.fn(async () => ({ lists }));
  const store = createShoppingStore({ lists: snapshot, post, alternatives: jest.fn(), transcriptionSession: jest.fn() });
  return { store, post, snapshot };
}

describe('shoppingApi', () => {
  function client() {
    const calls: { url: string; init: RequestInit }[] = [];
    const api = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ lists: [], value: 'ek', expiresAt: 1, model: 'm', data: '/9j/' }), { status: 200 });
      },
    });
    return { api, calls };
  }

  it('posts the envelope, the image request and the transcription session to the server’s paths', async () => {
    const { api, calls } = client();
    await shoppingApi.post({ operation: 'save', id: 'l1', revision: 4, input: { title: 'x' } }, api);
    await shoppingApi.image({ name: 'Milk', details: '', consent: true }, api);
    await shoppingApi.transcriptionSession(api);
    expect(calls.map((call) => call.url)).toEqual(['https://api.example.com/api/shopping', 'https://api.example.com/api/shopping/image', 'https://api.example.com/api/realtime/transcription-session']);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ operation: 'save', id: 'l1', revision: 4, input: { title: 'x' } });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ name: 'Milk', details: '', consent: true });
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ consent: true, scope: 'shopping' });
  });

  it('builds the view-only link from the API origin', () => {
    expect(shareUrl('abc123', client().api)).toBe('https://api.example.com/shared/shopping/abc123');
  });
});

describe('ShoppingStore', () => {
  it('writes with the list’s id and revision, puts the answer first, then refreshes', async () => {
    const saved = list({ revision: 5, title: 'Saved' });
    const h = harness([list({ id: 'other' }), saved]);
    h.post.mockResolvedValueOnce({ list: saved });
    const result = await h.store.getState().action('save', list(), listInput(list()));
    expect(result).toEqual(saved);
    expect(h.post).toHaveBeenCalledWith({ operation: 'save', id: 'l1', revision: 4, input: listInput(list()) });
    expect(h.snapshot).toHaveBeenCalledTimes(1);
    expect(h.store.getState().busy).toBe(false);
  });

  it('creates without an id or revision, and omits the idempotency key when there is none', async () => {
    const h = harness();
    await h.store.getState().action('create', null, { title: 'New' });
    expect(h.post.mock.calls[0][0]).toEqual({ operation: 'create', input: { title: 'New' } });
  });

  it('sends the idempotency key when one is given, so a replayed create collapses', async () => {
    const h = harness();
    await h.store.getState().action('create', null, { title: 'New' }, '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(h.post.mock.calls[0][0]).toEqual({
      operation: 'create',
      input: { title: 'New' },
      idempotencyKey: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });
  });

  it('surfaces a stale-revision 409 as the server’s message and returns nothing', async () => {
    const h = harness();
    h.post.mockRejectedValueOnce(new ApiError({ status: 409, message: 'This list changed on another device. Refresh before saving.' }));
    const result = await h.store.getState().action('save', list(), {});
    expect(result).toBeNull();
    expect(h.store.getState().error).toBe('This list changed on another device. Refresh before saving.');
    expect(h.snapshot).not.toHaveBeenCalled();
  });

  it('drops the list locally on delete', async () => {
    const h = harness([]);
    h.store.setState({ lists: [list(), list({ id: 'keep' })] });
    h.post.mockResolvedValueOnce({ ok: true });
    h.snapshot.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    const result = await h.store.getState().action('delete', list(), {});
    expect(result).toBeNull();
    expect(h.store.getState().lists.map((value) => value.id)).toEqual(['keep']);
  });

  it('ignores a second action while one is in flight', async () => {
    const h = harness();
    let release: (value: ShoppingResult) => void = () => undefined;
    h.post.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const first = h.store.getState().action('save', list(), {});
    expect(await h.store.getState().action('save', list(), {})).toBeNull();
    release({ list: list() });
    await first;
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it('shares and revokes through the same write, token in and out', async () => {
    const h = harness();
    h.post.mockResolvedValueOnce({ list: list({ shareToken: 'tok' }) });
    expect((await h.store.getState().action('share', list(), {}))?.shareToken).toBe('tok');
    expect(h.post.mock.calls[0][0]).toMatchObject({ operation: 'share', id: 'l1', revision: 4 });
    h.post.mockResolvedValueOnce({ list: list({ shareToken: null }) });
    expect((await h.store.getState().action('revoke', list({ shareToken: 'tok' }), {}))?.shareToken).toBeNull();
    expect(h.post.mock.calls[1][0].operation).toBe('revoke');
  });

  it('parses on the server, with no list, and returns the items', async () => {
    const h = harness();
    h.post.mockResolvedValueOnce({ items: [{ id: 'p', name: 'milk', category: 'Dairy & Eggs', quantity: '2', size: 'bottles', notes: '', checked: false }] });
    const items = await h.store.getState().parse('2 bottles of milk');
    expect(h.post).toHaveBeenCalledWith({ operation: 'parse', input: { text: '2 bottles of milk' } });
    expect(items.map((value) => value.name)).toEqual(['milk']);
  });

  it('keeps the error from a failed refresh and clears it on the next good one', async () => {
    const h = harness();
    h.snapshot.mockRejectedValueOnce(new Error('Nexdo could not reach the server.'));
    await h.store.getState().refresh();
    expect(h.store.getState().error).toBe('Nexdo could not reach the server.');
    await h.store.getState().refresh();
    expect(h.store.getState().error).toBeNull();
  });
});
