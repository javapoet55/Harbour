import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Whether the first-install introduction has been seen. A DEVICE-LOCAL flag, like the appearance store:
 * `@AppStorage("nexdo.installIntroductionCompleted")` (ios/App/RootView.swift:16), under the same key.
 *
 * ANDROID AHEAD (docs/android-polish.md §48): Swift's flag defaults to false on every existing install, so
 * an upgrader who is signed out sees the "first-install" pages (§24 Swift bug 8). Here an install that
 * already holds Nexdo data counts as having seen them, and the flag is written so the answer stays put.
 */
export const INTRODUCTION_KEY = 'nexdo.installIntroductionCompleted';

/**
 * Keys only an install that has been used before can hold. `nexdo.lastSignedInFirstName` is written by
 * every sign-in and kept after sign-out; the others are written from Settings and the task lists.
 * Keys this version writes at launch (the review schedule) are deliberately not here.
 */
export const EXISTING_INSTALL_KEYS = ['nexdo.lastSignedInFirstName', 'nexdo.appearance', 'nexdo.appVoiceVolume', 'nexdo.taskDisplayOrders'] as const;

type IntroductionStore = {
  /** `undefined` until read from storage. */
  completed: boolean | undefined;
  hydrate: () => Promise<void>;
  /** Skip, Get Started or Sign In (`introductionCompleted = true`, RootView.swift:133). */
  complete: () => Promise<void>;
};

export const useIntroduction = create<IntroductionStore>()((set) => ({
  completed: undefined,
  hydrate: async () => {
    let entries: readonly (readonly [string, string | null])[];
    try {
      entries = await AsyncStorage.multiGet([INTRODUCTION_KEY, ...EXISTING_INSTALL_KEYS]);
    } catch {
      // Storage that cannot be read proves nothing about a first install, so the pages are not shown.
      set({ completed: true });
      return;
    }
    const values = new Map(entries);
    if (values.get(INTRODUCTION_KEY) === 'true') {
      set({ completed: true });
      return;
    }
    const existing = EXISTING_INSTALL_KEYS.some((key) => values.get(key) != null);
    set({ completed: existing });
    if (existing) await AsyncStorage.setItem(INTRODUCTION_KEY, 'true').catch(() => undefined);
  },
  complete: async () => {
    set({ completed: true });
    await AsyncStorage.setItem(INTRODUCTION_KEY, 'true').catch(() => undefined);
  },
}));
