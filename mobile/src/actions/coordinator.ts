import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

import type { NexdoTask } from '../api/types';
import {
  desiredNotifications,
  NOTIFICATION_LIMIT,
  reconcileActions,
  transition,
  type StoredTaskAction,
  type TaskActionChannel,
  type TaskActionStatus,
} from '../lib/taskAction';
import type { ActionContact } from './contacts';
import { ACTION_NOTICES } from './errors';
import { DISMISS_ACTION_IDENTIFIER, replaceScheduledNotifications } from './notifications';
import { ownerKeyFor, readActions, writeActions } from './persistence';

/**
 * `TaskActionCoordinator` (ios/App/TaskActionCoordinator.swift:21-158).
 *
 * A singleton `ObservableObject` in Swift, a zustand store here, for the same reason `useConsent` is
 * one: several screens observe it, and the notification handler reaches it from outside React.
 *
 * The rules it enforces, all of them Swift's:
 * - ONE ACTION PER TASK, which falls out of `reconcile` mapping over tasks.
 * - No communication without an explicit approval; `approveExecution` is the only way into
 *   `executing`, and it must pass through `awaitingApproval` and `approved` first.
 * - An interrupted call or composer is never assumed to have sent: on activate, anything left
 *   `executing` or `approved` drops back to `awaitingApproval` (`:54-56`).
 * - The scheduler owns every `nexdo.action.` notification and replaces the set wholesale.
 */

export type ActionRoute = { id: string; preferred: TaskActionChannel | null };

type Pending = { id: string; owner: string; choice: string };

export type CoordinatorState = {
  /** `owner`: the SHA-256 of the signed-in user id, or `null` when signed out. */
  owner: string | null;
  actions: StoredTaskAction[];
  /** `resolvedContacts` (`:24`): keyed by contact identifier, in memory only, like Swift's. */
  resolvedContacts: Record<string, ActionContact>;
  /** `route` (`:25`): the action screen to present, set by a notification or a tap. */
  route: ActionRoute | null;
  /** `notice` (`:26`): a non-fatal scheduling or persistence problem. */
  notice: string | null;
  /** A response that arrived before its owner's actions were loaded (`:29`, `:76-79`). */
  pending: Pending | null;
  /** Bumped on every owner change so a late schedule from the old account is discarded (`:30`). */
  generation: number;
};

type CoordinatorStore = CoordinatorState & {
  activate: (userId: string | null) => Promise<void>;
  synchronize: (tasks: NexdoTask[], userId: string, timeZone: string) => Promise<void>;
  actionForTask: (taskId: string) => StoredTaskAction | undefined;
  remember: (contact: ActionContact) => void;
  open: (id: string, preferred?: TaskActionChannel | null) => void;
  receive: (payload: { actionID: string; owner: string; choice: string }) => void;
  update: (id: string, change: (action: StoredTaskAction) => StoredTaskAction) => void;
  transitionTo: (id: string, next: TaskActionStatus) => void;
  approveExecution: (id: string) => boolean;
  snooze: (id: string, until?: number) => void;
  dismiss: (id: string) => void;
  clearRoute: () => void;
  retryNotifications: () => void;
  /** Test seam: replaces the whole state without touching disk. */
  reset: (next?: Partial<CoordinatorState>) => void;
};

const EMPTY: CoordinatorState = {
  owner: null,
  actions: [],
  resolvedContacts: {},
  route: null,
  notice: null,
  pending: null,
  generation: 0,
};

/** `snooze(_:)` with no date (TaskActionCoordinator.swift:111-113). */
export const DEFAULT_SNOOZE_MS = 15 * 60_000;

export const useCoordinator = create<CoordinatorStore>()((set, get) => ({
  ...EMPTY,

  /** `activate(userID:)` (TaskActionCoordinator.swift:46-61). */
  activate: async (userId) => {
    const key = userId === null ? null : await ownerKeyFor(userId);
    if (get().owner === key) return;

    set((state) => ({ ...EMPTY, owner: key, generation: state.generation + 1 }));
    if (key === null) return;

    let actions: StoredTaskAction[] = [];
    let notice: string | null = null;
    try {
      actions = (await readActions(key)) ?? [];
    } catch {
      notice = ACTION_NOTICES.unreadable;
    }

    // "A process cannot know whether an interrupted call or composer sent anything."
    const now = Date.now();
    actions = actions.map((action) =>
      action.status === 'executing' || action.status === 'approved' ? transition(action, 'awaitingApproval', now).action : action,
    );

    if (get().owner !== key) return;
    set({ actions, notice });
    void schedule(set, get);
  },

  /** `synchronize(tasks:userID:)` (TaskActionCoordinator.swift:62-72). */
  synchronize: async (tasks, userId, timeZone) => {
    await get().activate(userId);
    const owner = get().owner;
    if (owner === null) return;

    const actions = reconcileActions({
      previous: get().actions,
      tasks,
      now: Date.now(),
      timeZone,
      newId: () => randomUUID(),
    });
    set({ actions });
    await persist(set, get);
    void schedule(set, get);

    // A notification that arrived before this account's actions existed is replayed now.
    const pending = get().pending;
    if (pending && pending.owner === owner) {
      set({ pending: null });
      get().receive({ actionID: pending.id, owner: pending.owner, choice: pending.choice });
    }

    // `if let route, !actions.contains(where: { $0.id == route.id }) { self.route = nil }`
    const route = get().route;
    if (route && !get().actions.some((action) => action.id === route.id)) set({ route: null });
  },

  actionForTask: (taskId) => get().actions.find((action) => action.taskId === taskId),

  /** `remember(_:)` (TaskActionCoordinator.swift:74). */
  remember: (contact) => set((state) => ({ resolvedContacts: { ...state.resolvedContacts, [contact.id]: contact } })),

  /** `open(_:preferred:)` (TaskActionCoordinator.swift:75-79). */
  open: (id, preferred) => {
    const action = get().actions.find((item) => item.id === id);
    if (!action) return;
    get().transitionTo(id, 'awaitingApproval');
    set({ route: { id, preferred: preferred ?? action.preferredAction ?? null } });
  },

  /** `receive(actionID:owner:choice:)` (TaskActionCoordinator.swift:80-90). */
  receive: ({ actionID, owner, choice }) => {
    const state = get();
    // An action for another account, or one not loaded yet, is held until `synchronize` runs.
    if (state.owner !== owner || !state.actions.some((action) => action.id === actionID)) {
      set({ pending: { id: actionID, owner, choice } });
      return;
    }
    if (choice === DISMISS_ACTION_IDENTIFIER) {
      get().transitionTo(actionID, 'cancelled');
      return;
    }
    const lowered = choice.toLowerCase();
    const channel: TaskActionChannel | null =
      lowered === 'call' || lowered === 'message' || lowered === 'email' ? lowered : null;
    get().open(actionID, channel);
    // "Snooze from a notification still opens the authenticated action screen."
    if (choice === 'REMIND_LATER') get().snooze(actionID);
  },

  /** `update(_:_:)` (TaskActionCoordinator.swift:91-94): change, persist, reschedule. */
  update: (id, change) => {
    const index = get().actions.findIndex((action) => action.id === id);
    if (index < 0) return;
    const actions = [...get().actions];
    actions[index] = change(actions[index]);
    set({ actions });
    void persist(set, get);
    void schedule(set, get);
  },

  transitionTo: (id, next) => {
    get().update(id, (action) => transition(action, next, Date.now()).action);
  },

  /** `approveExecution(_:)` (TaskActionCoordinator.swift:95-102). */
  approveExecution: (id) => {
    const action = get().actions.find((item) => item.id === id);
    if (!action) return false;
    const now = Date.now();
    const approved = transition(action, 'approved', now);
    if (!approved.changed) return false;
    const executing = transition(approved.action, 'executing', now);
    if (!executing.changed) return false;
    get().update(id, () => executing.action);
    return true;
  },

  /** `snooze(_:)` / `snooze(_:until:)` (TaskActionCoordinator.swift:103-113). */
  snooze: (id, until) => {
    const date = until ?? Date.now() + DEFAULT_SNOOZE_MS;
    if (date <= Date.now()) return;
    get().update(id, (action) => transition({ ...action, snoozedUntil: date }, 'scheduled', Date.now()).action);
    set({ route: null });
  },

  /** `dismiss(_:)` (TaskActionCoordinator.swift:114-117). */
  dismiss: (id) => {
    get().transitionTo(id, 'cancelled');
    set({ route: null });
  },

  clearRoute: () => set({ route: null }),

  /** `retryNotifications()` (TaskActionCoordinator.swift:118). */
  retryNotifications: () => {
    void schedule(set, get);
  },

  reset: (next) => set({ ...EMPTY, ...next }),
}));

type Setter = (partial: Partial<CoordinatorStore>) => void;
type Getter = () => CoordinatorStore;

/** `persist()` (TaskActionCoordinator.swift:126-138). */
async function persist(set: Setter, get: Getter): Promise<void> {
  const owner = get().owner;
  if (owner === null) return;
  try {
    await writeActions(owner, get().actions);
  } catch {
    set({ notice: ACTION_NOTICES.unsaved });
  }
}

/**
 * `queueSchedule()` (TaskActionCoordinator.swift:139-157).
 *
 * Swift serialises these behind one `Task` so two rapid saves cannot interleave and leave half a
 * plan on the device; `chain` is that queue. The generation check discards work that belongs to an
 * account that has since been switched away from.
 */
let chain: Promise<void> = Promise.resolve();

function schedule(set: Setter, get: Getter): Promise<void> {
  const generation = get().generation;
  chain = chain.then(async () => {
    if (get().generation !== generation) return;
    const snapshot = get().actions;
    const now = Date.now();
    const plan = desiredNotifications(snapshot, now);
    try {
      await replaceScheduledNotifications({ notifications: plan, actions: snapshot, owner: get().owner ?? '' });
      if (get().generation !== generation) return;
      set({ notice: null });

      // Everything that was scheduled moves `pending` → `scheduled`.
      const planned = new Set(plan.map((item) => item.actionId));
      const actions = get().actions.map((action) =>
        planned.has(action.id) && action.status === 'pending' ? transition(action, 'scheduled', now).action : action,
      );
      set({ actions });
      await persist(set, get);

      if (get().notice === null && desiredNotifications(snapshot, now, Number.MAX_SAFE_INTEGER).length > plan.length) {
        set({ notice: ACTION_NOTICES.limited });
      }
    } catch (cause) {
      if (get().generation !== generation) return;
      set({ notice: cause instanceof Error ? cause.message : String(cause) });
    }
  });
  return chain;
}

/** Exposed so tests can await the scheduling queue Swift awaits with `previous?.value`. */
export function scheduledWork(): Promise<void> {
  return chain;
}

export { NOTIFICATION_LIMIT };
