import { create } from 'zustand';

import { beginSearch, DEFAULT_TASK_QUERY, endSearch, searchFilters, type SearchFilters, type TaskQuery } from '../lib/taskQuery';

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
  /** `TaskQuery.beginSearch()` (TaskQuery.swift:53-60), from the magnifier (RootView.swift:1792-1797). */
  beginSearch: () => void;
  /** Closing search: clears the term and restores the filters `beginSearch` reset (`endSearch`). */
  endSearch: () => void;
  /** The filters as they were when the search began. */
  beforeSearch: SearchFilters | null;
  replace: (next: TaskQuery) => void;
};

export const useTaskQuery = create<TaskQueryStore>()((set) => ({
  query: DEFAULT_TASK_QUERY,
  setQuery: (next) => set((state) => ({ query: { ...state.query, ...next } })),
  resetFilters: () => set((state) => ({ query: { ...state.query, status: 'Open', priority: 'All', earliestFirst: true } })),
  beforeSearch: null,
  beginSearch: () => set((state) => ({ query: beginSearch(state.query), beforeSearch: searchFilters(state.query) })),
  endSearch: () => set((state) => ({ query: endSearch(state.query, state.beforeSearch), beforeSearch: null })),
  replace: (next) => set({ query: next }),
}));
