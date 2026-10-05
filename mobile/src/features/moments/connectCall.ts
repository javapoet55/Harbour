import { createStore } from 'zustand';

import type { MomentOperation } from '../../api/moments';
import { deviceZone, isValidZone, momentDay, wallParts, zonedInstant } from './dates';

/**
 * "Connect me on the day" (ios/App/MomentConnectCall.swift:1-160): on the moment's day the server calls
 * the user, then bridges them to the recipient. Everything about WHEN is decided on the server — call
 * windows (08:00–21:30 for both people), DST, previews, retries. The phone holds drafts and turns
 * `HH:mm` into a time-picker value and back.
 *
 * All requests go through `POST /api/moments` with the operations below (src/server/moment-calls).
 * A malformed input is answered 500 "Request failed." because that route does not map zod errors.
 */

/** `MomentCallerID`: the user's own number, verified by a Twilio call. */
export type MomentCallerID = { phone: string; status: 'PENDING' | 'VERIFIED' | 'FAILED' | string };
/** `MomentConnectPreview`: server-formatted local times ("EEE d MMM, h:mm a", English). */
export type MomentConnectPreview = { userLocal: string; recipientLocal: string; userOk: boolean; recipientOk: boolean };
export type MomentConnectLastCall = { status: string; date: string; at: string };
/** `MomentConnectState`. When not enabled, `time` is the server's suggestion. */
export type MomentConnectState = {
  momentId: string;
  enabled: boolean;
  time: string;
  timeZone: string;
  recipientPhone?: string | null;
  passed: boolean;
  isToday: boolean;
  nextCallAt: string;
  preview: MomentConnectPreview;
  lastCall?: MomentConnectLastCall | null;
};
/** `MomentConnectStatus`: `available` is false until calls are configured on the server. */
export type MomentConnectStatus = { available: boolean; callerId?: MomentCallerID | null; userTimeZone: string; moments: MomentConnectState[] };
export type MomentConnectPreviewResponse = { time: string; timeZone: string; nextCallAt: string; preview: MomentConnectPreview };
export type CallerIDStartResponse = { phone: string; status: string; validationCode?: string | null };
export type CallerIDStatusResponse = { callerId?: MomentCallerID | null };
/** `ConnectNowResponse`. Swift ignores `status`. */
export type ConnectNowResponse = { callId: string; status: 'dialing' | 'failed' | 'not_claimed' | string };

/** `MomentConnectDraft`: local, unsaved edits for one moment. */
export type MomentConnectDraft = { enabled: boolean; time: string; timeZone: string };

export const CONNECT_OPERATIONS = ['connectStatus', 'connectPreview', 'connectSave', 'connectNow', 'callerIdStart', 'callerIdStatus', 'callerIdRemove'] as const;
export type ConnectOperation = (typeof CONNECT_OPERATIONS)[number] & MomentOperation;

function sameDraft(a: MomentConnectDraft | undefined, b: MomentConnectDraft | undefined): boolean {
  return !!a && !!b && a.enabled === b.enabled && a.time === b.time && a.timeZone === b.timeZone;
}

function draftOf(state: MomentConnectState): MomentConnectDraft {
  return { enabled: state.enabled, time: state.time, timeZone: state.timeZone };
}

/** `statusLabel(_:)` (MomentConnectCall.swift:150-162). */
export function connectStatusLabel(status: string): string {
  switch (status) {
    case 'CONNECTED':
      return 'Connected';
    case 'DECLINED':
      return 'You said not now';
    case 'CALL_BACK_SCHEDULED':
    case 'QUEUED':
      return 'Call back scheduled';
    case 'MISSED':
      return 'You missed the call';
    case 'RECIPIENT_NO_ANSWER':
      return 'They didn’t pick up';
    case 'DIALING':
    case 'IN_PROGRESS':
    case 'CONNECTING':
      return 'Calling…';
    case 'CANCELLED':
      return 'Cancelled';
    case 'EXPIRED':
      return 'Not placed';
    default:
      return 'Call ended';
  }
}

/**
 * `date(from:zone:)` (:138-143): today's instant at `HH:mm` in `zone`, for the time picker. A missing or
 * unreadable part is 09 / 00, as Swift; an unknown zone is the device's.
 *
 * DIVERGENCE: on a spring-forward day Swift's `bySettingHour` moves a missing wall time forward; this
 * answers `now`, and the server refuses a nonexistent time when it is saved.
 */
export function connectTimeToDate(hhmm: string, zone: string, now: number = Date.now()): number {
  const tz = isValidZone(zone) ? zone : deviceZone();
  const parts = hhmm.split(':').map((part) => Number.parseInt(part, 10)).filter((part) => Number.isInteger(part));
  return zonedInstant(momentDay(now, tz), parts[0] ?? 9, parts.length > 1 ? parts[1] : 0, tz) ?? now;
}

/** `hhmm(from:zone:)` (:144-149). */
export function connectTimeFromDate(at: number, zone: string): string {
  const { hour, minute } = wallParts(at, isValidZone(zone) ? zone : deviceZone());
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export const CONNECT_NOTICES = {
  saved: (userLocal: string) => `Saved. Nexdo will call you ${userLocal} your time.`,
  off: 'Connect call turned off.',
  calling: 'Calling you now. Answer and Nexdo will connect you.',
  removed: 'Your number was removed and connect calls are off.',
};

export type MomentConnectDeps = {
  /** `ImportantMomentsStore.request`: the moments store's, which drops answers after a sign-out. */
  request: <R>(operation: ConnectOperation, input: unknown) => Promise<R>;
};

export type MomentConnectModel = {
  status: MomentConnectStatus | null;
  drafts: Record<string, MomentConnectDraft>;
  previews: Record<string, MomentConnectPreview>;
  error: string | null;
  notice: string | null;
  busy: boolean;
  momentIds: string[];
  load: (momentIds?: string[]) => Promise<void>;
  setDraft: (id: string, draft: MomentConnectDraft) => void;
  refreshPreview: (id: string) => Promise<void>;
  save: (id: string) => Promise<void>;
  connectNow: (id: string) => Promise<void>;
  /** Starts Twilio's verification call; answers the code to type on the keypad, or `null`. */
  startVerification: (phone: string) => Promise<string | null>;
  /** The caller-ID status, reloading once it is VERIFIED; `null` on failure. */
  pollVerification: () => Promise<string | null>;
  removeNumber: () => Promise<void>;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

/** `callerID`, `verified` (:47-48). */
export function isVerified(status: MomentConnectStatus | null): boolean {
  return status?.callerId?.status === 'VERIFIED';
}

/** `state(_:)` (:49). */
export function connectState(status: MomentConnectStatus | null, id: string): MomentConnectState | undefined {
  return status?.moments.find((moment) => moment.momentId === id);
}

/** `dirty(_:)` (:50-53): the draft differs from what the server holds. */
export function isDirty(model: Pick<MomentConnectModel, 'status' | 'drafts'>, id: string): boolean {
  const state = connectState(model.status, id);
  const draft = model.drafts[id];
  if (!state || !draft) return false;
  return !sameDraft(draft, draftOf(state));
}

/** `merged(_:)` (:131-135): a one-moment answer replaces that moment, keeps the others. */
export function mergedStatus(current: MomentConnectStatus | null, partial: MomentConnectStatus): MomentConnectStatus {
  if (!current) return partial;
  const others = current.moments.filter((moment) => !partial.moments.some((next) => next.momentId === moment.momentId));
  return { available: partial.available, callerId: partial.callerId, userTimeZone: partial.userTimeZone, moments: [...others, ...partial.moments] };
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Request failed.';
}

/**
 * `MomentConnectModel` (:35-136), one per Manage Moment schedule page. The live page passes the moments
 * store's own `request` — `createMomentConnectModel({ request: momentsStore.getState().request }, ids)` —
 * so an answer that lands after a sign-out is dropped, as Swift's generation check does.
 */
export function createMomentConnectModel(deps: MomentConnectDeps, momentIds: string[]) {
  return createStore<MomentConnectModel>()((set, get) => ({
    status: null,
    drafts: {},
    previews: {},
    error: null,
    notice: null,
    busy: false,
    momentIds,

    async load(ids) {
      if (ids) set({ momentIds: ids });
      const requested = get().momentIds;
      if (requested.length === 0) return;
      try {
        const result = await deps.request<MomentConnectStatus>('connectStatus', { momentIds: requested });
        set({ status: result });
        // A draft the user is editing is kept; every other one follows the server.
        const drafts = { ...get().drafts };
        const previews = { ...get().previews };
        for (const moment of result.moments) {
          if (drafts[moment.momentId] === undefined || !isDirty({ status: result, drafts }, moment.momentId)) {
            drafts[moment.momentId] = draftOf(moment);
            previews[moment.momentId] = moment.preview;
          }
        }
        set({ drafts, previews });
      } catch (error) {
        set({ error: message(error) });
      }
    },

    setDraft: (id, draft) => set((state) => ({ drafts: { ...state.drafts, [id]: draft } })),

    async refreshPreview(id) {
      const draft = get().drafts[id];
      if (!draft) return;
      try {
        const result = await deps.request<MomentConnectPreviewResponse>('connectPreview', { momentId: id, ...draft });
        // Only if the draft has not changed again while the preview was on its way.
        if (sameDraft(get().drafts[id], draft)) set((state) => ({ previews: { ...state.previews, [id]: result.preview } }));
      } catch {
        // "keep the previous preview; saving reports real problems"
      }
    },

    async save(id) {
      const draft = get().drafts[id];
      if (!draft) return;
      set({ busy: true });
      try {
        const result = await deps.request<MomentConnectStatus>('connectSave', { momentId: id, ...draft });
        set((state) => ({ status: mergedStatus(state.status, result) }));
        const saved = result.moments.find((moment) => moment.momentId === id);
        if (saved) {
          set((state) => ({
            drafts: { ...state.drafts, [id]: draftOf(saved) },
            previews: { ...state.previews, [id]: saved.preview },
            notice: saved.enabled ? CONNECT_NOTICES.saved(saved.preview.userLocal) : CONNECT_NOTICES.off,
          }));
        }
      } catch (error) {
        set({ error: message(error) });
      } finally {
        set({ busy: false });
      }
    },

    async connectNow(id) {
      set({ busy: true });
      try {
        await deps.request<ConnectNowResponse>('connectNow', { momentId: id });
        set({ notice: CONNECT_NOTICES.calling });
      } catch (error) {
        set({ error: message(error) });
      } finally {
        set({ busy: false });
      }
    },

    async startVerification(phone) {
      set({ busy: true });
      try {
        const result = await deps.request<CallerIDStartResponse>('callerIdStart', { phone });
        if (result.status === 'VERIFIED') {
          await get().load();
          return null;
        }
        return result.validationCode ?? null;
      } catch (error) {
        set({ error: message(error) });
        return null;
      } finally {
        set({ busy: false });
      }
    },

    async pollVerification() {
      try {
        const result = await deps.request<CallerIDStatusResponse>('callerIdStatus', {});
        if (result.callerId?.status === 'VERIFIED') await get().load();
        return result.callerId?.status ?? null;
      } catch {
        return null;
      }
    },

    async removeNumber() {
      set({ busy: true });
      try {
        await deps.request<{ removed: boolean }>('callerIdRemove', {});
        set({ drafts: {} });
        await get().load();
        set({ notice: CONNECT_NOTICES.removed });
      } catch (error) {
        set({ error: message(error) });
      } finally {
        set({ busy: false });
      }
    },

    setError: (error) => set({ error }),
    setNotice: (notice) => set({ notice }),
  }));
}
