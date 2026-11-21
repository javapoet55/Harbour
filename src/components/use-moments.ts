'use client';

import { useCallback, useRef, useState } from 'react';
import type { ImportantMoment, MomentsSnapshot, WishDeliveryPlan, WishDraft } from '@/lib/moments';

export type MomentsApi = ReturnType<typeof useMoments>;

type Operation = 'save' | 'generate' | 'approve' | 'schedule' | 'plan';
export type MomentsResult<T = unknown> = { ok: true; value: T } | { ok: false; value: null };

const GENERIC = 'Something went wrong. Please try again.';

/** Thrown for a non-2xx answer; carries the server's own sentence and the status. */
class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function failure(response: Response): Promise<RequestError> {
  const body = await response.json().catch(() => null);
  return new RequestError(typeof body?.error === 'string' && body.error ? body.error : GENERIC, response.status);
}

async function post<T>(payload: unknown): Promise<T> {
  const response = await fetch('/api/moments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw await failure(response);
  return response.json() as Promise<T>;
}

const EMPTY: MomentsSnapshot = { moments: [], emailAccount: null, emailConfigured: false, automaticEmailEnabled: false };

/**
 * The signed-in customer's Important Moments and the writes the server accepts (POST /api/moments with
 * `{ operation, input, id }`). One write runs at a time; every write reloads the snapshot afterwards so
 * the list shows what the server holds, including the plan statuses it computes.
 */
export function useMoments() {
  const [snapshot, setSnapshot] = useState<MomentsSnapshot>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/moments', { cache: 'no-store' });
      if (!response.ok) throw await failure(response);
      setSnapshot((await response.json()) as MomentsSnapshot);
      setLoadError('');
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : GENERIC);
    } finally {
      setLoaded(true);
    }
  }, []);

  /** Runs one write; the server's own sentence becomes `error` when it refuses. */
  const run = useCallback(async <T,>(operation: Operation, input: unknown, id?: string): Promise<MomentsResult<T>> => {
    if (running.current) return { ok: false, value: null };
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const value = await post<T>({ operation, input, ...(id ? { id } : {}) });
      await refresh();
      return { ok: true, value };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : GENERIC);
      return { ok: false, value: null };
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [refresh]);

  const save = useCallback((input: unknown, id?: string) => run<{ moment: ImportantMoment }>('save', input, id), [run]);
  const generate = useCallback((input: unknown) => run<{ draft: WishDraft; usedAI: boolean }>('generate', input), [run]);
  const approve = useCallback((draftID: string, body: string) => run<{ draft: WishDraft }>('approve', { id: draftID, body, approved: true }), [run]);
  const schedule = useCallback((input: unknown) => run<{ plan: WishDeliveryPlan }>('schedule', input), [run]);
  const changePlan = useCallback((planID: string, action: 'cancel' | 'reschedule' | 'retry' | 'sendNow' | 'sent' | 'failed', extra?: { scheduledAtUTC: string; timeZoneID: string }) =>
    run<{ ok: true }>('plan', { id: planID, action, ...(extra ?? {}) }), [run]);

  const clearError = useCallback(() => setError(null), []);

  return { ...snapshot, loaded, loadError, busy, error, clearError, refresh, save, generate, approve, schedule, changePlan };
}
