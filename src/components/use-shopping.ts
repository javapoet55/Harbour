'use client';

import { useCallback, useRef, useState } from 'react';
import type { GroceryItem, GroceryList, ShoppingAlternativesResponse } from '@/lib/shopping';

type Operation = 'create' | 'save' | 'delete' | 'complete' | 'share' | 'revoke';
export type ShoppingActionResult = { ok: boolean; list: GroceryList | null };

const GENERIC = 'Something went wrong. Please try again.';

async function failure(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  return new Error(typeof body?.error === 'string' && body.error ? body.error : GENERIC);
}

async function post<T>(payload: unknown): Promise<T> {
  const response = await fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw await failure(response);
  return response.json() as Promise<T>;
}

/**
 * The signed-in customer's shopping lists and the writes the server accepts (POST /api/shopping). A write
 * names the list's id and the revision the customer last saw; the server answers 409 when the list changed
 * somewhere else. One write runs at a time.
 */
export function useShopping() {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/shopping', { cache: 'no-store' });
      if (!response.ok) throw await failure(response);
      const body = (await response.json()) as { lists: GroceryList[] };
      setLists(body.lists);
      setLoadError('');
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : GENERIC);
    } finally {
      setLoaded(true);
    }
  }, []);

  const action = useCallback(async (operation: Operation, list: GroceryList | null, input: unknown, idempotencyKey?: string): Promise<ShoppingActionResult> => {
    if (running.current) return { ok: false, list: null };
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await post<{ list?: GroceryList | null }>({ operation, input, ...(list ? { id: list.id, revision: list.revision } : {}), ...(idempotencyKey ? { idempotencyKey } : {}) });
      const value = result.list ?? null;
      if (value) setLists((current) => [value, ...current.filter((item) => item.id !== value.id)]);
      if (operation === 'delete' && list) setLists((current) => current.filter((item) => item.id !== list.id));
      void refresh();
      return { ok: true, list: value };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : GENERIC);
      return { ok: false, list: null };
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [refresh]);

  /** What the server finds in typed text ("2 bottles of milk, eggs"): items with new ids, nothing saved yet. */
  const parse = useCallback(async (text: string): Promise<GroceryItem[]> => {
    const result = await post<{ items?: GroceryItem[] | null }>({ operation: 'parse', input: { text } });
    return result.items ?? [];
  }, []);

  const alternatives = useCallback(
    (item: Pick<GroceryItem, 'name' | 'category' | 'quantity' | 'size' | 'brand' | 'barcode'>) =>
      post<ShoppingAlternativesResponse>({
        operation: 'alternatives',
        input: { name: item.name, category: item.category, quantity: item.quantity, size: item.size, ...(item.brand ? { brand: item.brand } : {}), ...(item.barcode ? { barcode: item.barcode } : {}) },
      }),
    [],
  );

  return { lists, loaded, loadError, busy, error, setError, refresh, action, parse, alternatives };
}
