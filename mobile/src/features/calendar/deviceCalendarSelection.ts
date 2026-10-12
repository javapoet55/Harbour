import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { deviceCalendarSelectionKey } from '../../lib/deviceCalendarEvent';

/**
 * `AppleCalendarSelection` (ios/App/AppleCalendarService.swift:56-66): which of the phone's calendars
 * this account shows, kept on the device only. No saved choice means every calendar; an empty saved
 * choice means none. Swift posts `NexdoAppleCalendarSelectionChanged` on every save and the Calendar tab,
 * Settings and the selection screen reload on it; here that is `revision`, which the readers depend on.
 */
export type DeviceCalendarSelectionState = {
  owner: string | null;
  /** The saved ids, `null` for "all" (nothing saved yet) — never an empty array for that case. */
  selection: string[] | null;
  /** Whether the saved choice for `owner` has been read from storage. */
  loaded: boolean;
  revision: number;
  load: (owner: string | null) => Promise<void>;
  save: (owner: string, ids: Iterable<string>) => Promise<void>;
};

async function readSelection(owner: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(deviceCalendarSelectionKey(owner));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

export const deviceCalendarSelection = create<DeviceCalendarSelectionState>()((set, get) => ({
  owner: null,
  selection: null,
  loaded: false,
  revision: 0,
  load: async (owner) => {
    if (get().owner !== owner) set({ owner, selection: null, loaded: false });
    if (owner === null) {
      set({ loaded: true });
      return;
    }
    const selection = await readSelection(owner);
    // The account changed while reading: that read belongs to the old one.
    if (get().owner !== owner) return;
    set({ selection, loaded: true });
  },
  save: async (owner, ids) => {
    const selection = [...new Set(ids)].sort();
    set((state) => ({ owner, selection, loaded: true, revision: state.revision + 1 }));
    try {
      await AsyncStorage.setItem(deviceCalendarSelectionKey(owner), JSON.stringify(selection));
    } catch {
      // The choice still applies for this session; the next launch reads whatever was last written.
    }
  },
}));

/** `selectedIDs(owner:)`: the chosen ids as a set, or `null` for every calendar. */
export function selectedCalendarIds(state: Pick<DeviceCalendarSelectionState, 'selection'>): ReadonlySet<string> | null {
  return state.selection === null ? null : new Set(state.selection);
}

/** Whether a calendar is shown under a saved choice (`selected.contains`; everything when nothing is saved). */
export function calendarShown(selection: string[] | null, id: string): boolean {
  return selection === null || selection.includes(id);
}
