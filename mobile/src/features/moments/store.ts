import { createStore, useStore } from 'zustand';

import { ApiError, messages } from '../../api/client';
import {
  momentsApi,
  type ImportantMoment,
  type MomentInput,
  type MomentOK,
  type MomentOperation,
  type MomentsSnapshot,
  type PlanAction,
  type SaveMomentResponse,
  type WishDeliveryPlan,
} from '../../api/moments';
import { ownerKeyFor } from '../../actions/persistence';
import { TaskActionError } from '../../actions/errors';
import { isoString } from './dates';
import { planEditable, sortedPlans } from './domain';
import {
  clearMomentNotifications,
  reminderAuthorization,
  replaceMomentNotifications,
  requestReminderAuthorization,
  type ReminderAuthorization,
} from './notifications';

/**
 * `ImportantMomentsStore` (ios/App/ImportantMomentsStore.swift:18-175) and `MomentNotificationRoute`
 * (`:12-17`).
 *
 * One store for the whole feature, as in Swift, where it is a single `@StateObject` on `RootView`
 * handed to every Moments view. The snapshot lives here rather than in the React Query cache because
 * the Swift flows read it back synchronously right after a refresh (`ManageFestivalModel.persist`
 * re-reads `store.moments` to find the saved recipients), and because every refresh must also rebuild
 * the local notifications and resolve a pending notification route.
 *
 * `owner` is `ownerKey(userID)` — the SHA-256 the notification payload carries as `momentOwner` — and
 * `generation` fences off answers that arrive after the account changed.
 */

export type MomentsDeps = {
  api: {
    snapshot: () => Promise<MomentsSnapshot>;
    post: <R>(operation: MomentOperation, input: unknown, id?: string) => Promise<R>;
    deleteAll: () => Promise<MomentOK>;
  };
  ownerKey: (userId: string) => Promise<string>;
  authorization: () => Promise<ReminderAuthorization>;
  requestAuthorization: () => Promise<void>;
  replaceNotifications: (args: { moments: ImportantMoment[]; owner: string; isCurrent: () => boolean }) => Promise<string | null>;
  clearNotifications: () => Promise<void>;
  now: () => number;
};

export type MomentsState = {
  snapshot: MomentsSnapshot | null;
  error: string | null;
  loading: boolean;
  busy: boolean;
  lastSynced: number | null;
  reminderAuthorization: ReminderAuthorization;
  reminderStatusLoaded: boolean;
  enablingReminders: boolean;
  /** `route`: the moment a notification tap resolved to. The root layout opens it. */
  route: ImportantMoment | null;
  /** `MomentNotificationRoute.shared.pending` / `.owner`. */
  pendingRoute: { id: string; owner: string } | null;
  owner: string | null;
  generation: number;

  activate: (userId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  request: <R>(operation: MomentOperation, input: unknown, id?: string) => Promise<R>;
  perform: (action: () => Promise<void>) => Promise<void>;
  save: (input: MomentInput, id?: string) => Promise<string>;
  planAction: (plan: WishDeliveryPlan, action: PlanAction, date?: number, zone?: string) => Promise<void>;
  visibility: (moment: ImportantMoment, enabled: boolean, snooze?: boolean) => Promise<void>;
  deleteData: () => Promise<void>;
  authorizeNotifications: () => Promise<void>;
  updateReminderStatus: () => Promise<void>;
  prepareDefaultReminders: () => Promise<void>;
  enableWishReminders: () => Promise<void>;
  receiveRoute: (id: string, owner: string) => void;
  resolveRoute: () => void;
  clearRoute: () => void;
  setError: (error: string | null) => void;
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return messages.invalidResponse;
}

const signedOut = () => new ApiError({ status: 401, code: 'SIGNED_OUT', message: messages.signedOut });

export const REMINDER_STATUS_TEXT: Record<ReminderAuthorization, string> = {
  authorized: 'Wish reminders are enabled',
  provisional: 'Wish reminders are enabled quietly',
  ephemeral: 'Wish reminders are temporarily enabled',
  denied: 'Wish reminders are off in iOS Settings',
  notDetermined: 'Allow notifications to enable wish reminders',
};

/** `reminderStatusText` (ImportantMomentsStore.swift:27-37). */
export function reminderStatusText(state: Pick<MomentsState, 'reminderStatusLoaded' | 'reminderAuthorization'>): string {
  if (!state.reminderStatusLoaded) return 'Checking notification permission…';
  return REMINDER_STATUS_TEXT[state.reminderAuthorization];
}

export function createMomentsStore(deps: MomentsDeps) {
  return createStore<MomentsState>()((set, get) => {
    const replaceNotifications = async () => {
      const { owner, generation, snapshot } = get();
      if (!owner) return;
      const notice = await deps.replaceNotifications({
        moments: snapshot?.moments ?? [],
        owner,
        isCurrent: () => get().generation === generation,
      });
      if (notice && get().generation === generation) set({ error: notice });
    };

    return {
      snapshot: null,
      error: null,
      loading: false,
      busy: false,
      lastSynced: null,
      reminderAuthorization: 'notDetermined',
      reminderStatusLoaded: false,
      enablingReminders: false,
      route: null,
      pendingRoute: null,
      owner: null,
      generation: 0,

      async activate(userId) {
        const key = userId === null ? null : await deps.ownerKey(userId);
        if (get().owner !== key) {
          set((state) => ({ owner: key, generation: state.generation + 1, snapshot: null, route: null, error: null, lastSynced: null }));
          await deps.clearNotifications().catch(() => undefined);
        }
        if (key !== null) await get().refresh();
      },

      async refresh() {
        if (get().owner === null || get().loading) return;
        const token = get().generation;
        set({ loading: true });
        try {
          await get().updateReminderStatus();
          const result = await deps.api.snapshot();
          if (token !== get().generation) return;
          set({ snapshot: result, lastSynced: deps.now(), error: null });
          await replaceNotifications();
          get().resolveRoute();
        } catch (error) {
          if (token === get().generation) set({ error: `Couldn’t refresh Important Moments. ${errorMessage(error)}` });
        } finally {
          set({ loading: false });
        }
      },

      async request<R>(operation: MomentOperation, input: unknown, id?: string): Promise<R> {
        if (get().owner === null) throw signedOut();
        const token = get().generation;
        const result = await deps.api.post<R>(operation, input, id);
        if (token !== get().generation) throw signedOut();
        return result;
      },

      async perform(action) {
        if (get().busy) return;
        set({ busy: true, error: null });
        try {
          await action();
          await get().refresh();
        } catch (error) {
          set({ error: errorMessage(error) });
        } finally {
          set({ busy: false });
        }
      },

      async save(input, id) {
        const result = await get().request<SaveMomentResponse>('save', input, id);
        // Publish the authoritative save result before any list refresh or notification work.
        const current = get().snapshot;
        const moments = (current?.moments ?? []).filter((moment) => moment.id !== result.moment.id);
        moments.push(result.moment);
        set({
          snapshot: {
            moments,
            emailAccount: current?.emailAccount ?? null,
            emailConfigured: current?.emailConfigured ?? false,
            automaticEmailEnabled: current?.automaticEmailEnabled ?? false,
          },
        });
        return result.moment.id;
      },

      async planAction(plan, action, date, zone) {
        const input: Record<string, string> = { id: plan.id, action };
        if (date !== undefined) input.scheduledAtUTC = isoString(date);
        if (zone !== undefined) input.timeZoneID = zone;
        await get().request<MomentOK>('plan', input);
      },

      async visibility(moment, enabled, snooze = false) {
        await get().request<MomentOK>('visibility', {
          id: moment.id,
          enabled,
          snoozedUntil: snooze ? isoString(deps.now() + 3_600_000) : null,
        });
      },

      async deleteData() {
        await deps.api.deleteAll();
        set({ snapshot: null });
        await deps.clearNotifications();
      },

      async updateReminderStatus() {
        const status = await deps.authorization().catch(() => get().reminderAuthorization);
        set({ reminderAuthorization: status, reminderStatusLoaded: true });
      },

      async authorizeNotifications() {
        await get().updateReminderStatus();
        if (get().reminderAuthorization === 'notDetermined') {
          await deps.requestAuthorization();
          await get().updateReminderStatus();
        }
        if (!['authorized', 'provisional', 'ephemeral'].includes(get().reminderAuthorization)) {
          throw new TaskActionError('notificationsDenied');
        }
      },

      /** Request once, contextually on the Moments screen; never override a denial. */
      async prepareDefaultReminders() {
        await get().updateReminderStatus();
        if (get().reminderAuthorization === 'notDetermined') await get().enableWishReminders();
      },

      async enableWishReminders() {
        if (get().enablingReminders) return;
        set({ enablingReminders: true });
        try {
          await get().authorizeNotifications();
          await replaceNotifications();
        } catch (error) {
          set({ error: errorMessage(error) });
        } finally {
          set({ enablingReminders: false });
        }
      },

      receiveRoute(id, owner) {
        set({ pendingRoute: { id, owner } });
      },

      resolveRoute() {
        const { pendingRoute, owner, snapshot } = get();
        if (!pendingRoute || pendingRoute.owner !== owner) return;
        set({ pendingRoute: null });
        const moment = (snapshot?.moments ?? []).find(
          (item) =>
            item.enabled &&
            (item.id === pendingRoute.id || item.drafts.some((draft) => (draft.plans ?? []).some((plan) => plan.id === pendingRoute.id && planEditable(plan)))),
        );
        if (moment) set({ route: moment });
      },

      clearRoute() {
        set({ route: null });
      },

      setError(error) {
        set({ error });
      },
    };
  });
}

export const momentsStore = createMomentsStore({
  api: {
    snapshot: () => momentsApi.snapshot(),
    post: (operation, input, id) => momentsApi.post(operation, input, id),
    deleteAll: () => momentsApi.deleteAll(),
  },
  ownerKey: ownerKeyFor,
  authorization: reminderAuthorization,
  requestAuthorization: requestReminderAuthorization,
  replaceNotifications: replaceMomentNotifications,
  clearNotifications: clearMomentNotifications,
  now: () => Date.now(),
});

export function useMoments<T>(selector: (state: MomentsState) => T): T {
  return useStore(momentsStore, selector);
}

/** `moments` / `plans` (ImportantMomentsStore.swift:62-64). */
export function useMomentList(): ImportantMoment[] {
  const snapshot = useMoments((state) => state.snapshot);
  return snapshot?.moments ?? EMPTY;
}

const EMPTY: ImportantMoment[] = [];

export { sortedPlans };
