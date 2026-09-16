import { create } from 'zustand';

import { DEFAULT_TASK_QUERY, type TaskQuery } from '../lib/taskQuery';

/**
 * The live task filter. `AppModel.taskQuery` (ios/App/NexdoApp.swift) is a property on the model, not
 * view state, because the list, the filter sheet and `revealCreatedTask` after a save all read and
 * write the same value. It is held here for the same reason: the filter sheet is its own route.
 *
 * In-memory only, like Swift: the filter resets to `Today` / `Open` on every launch. Nothing about it
 * is persisted, and `search` in particular must not be, or a relaunch would show a filtered list with
 * no visible reason.
 */
type TaskQueryStore = {
  query: TaskQuery;
  setQuery: (next: Partial<TaskQuery>) => void;
  /** `Button("Reset filters")` (RootView.swift:1718): only these three, not the date or the search. */
  resetFilters: () => void;
  replace: (next: TaskQuery) => void;
};

export const useTaskQuery = create<TaskQueryStore>()((set) => ({
  query: DEFAULT_TASK_QUERY,
  setQuery: (next) => set((state) => ({ query: { ...state.query, ...next } })),
  resetFilters: () => set((state) => ({ query: { ...state.query, status: 'Open', priority: 'All', earliestFirst: true } })),
  replace: (next) => set({ query: next }),
}));
