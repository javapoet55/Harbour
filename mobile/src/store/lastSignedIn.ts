import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * The first name of whoever signed in last, so sign-in can greet them.
 *
 * Port of `AppModel.lastSignedInFirstName` (ios/App/NexdoApp.swift:126, 237–238, 301–306), which
 * reads and writes `UserDefaults` under "nexdo.lastSignedInFirstName". The same key is reused here so
 * the value means the same thing in both apps. AsyncStorage is the UserDefaults analogue.
 *
 * Swift keeps the name after signing out — `reset()` writes the name it just had — which is what puts
 * "Welcome back, <name>" on the sign-in screen for a returning person.
 */
const STORAGE_KEY = 'nexdo.lastSignedInFirstName';

/** `ProfileName.firstName(from:)` (ios/Sources/NexdoCore/Models.swift:3–11). */
export function firstName(fullName: string): string | null {
  const [first] = fullName.trim().split(/\s+/);
  return first && first.length > 0 ? first : null;
}

type LastSignedInStore = {
  /** `undefined` until read from storage; `null` when nobody has signed in on this device. */
  value: string | null | undefined;
  hydrate: () => Promise<void>;
  remember: (fullName: string) => Promise<void>;
};

export const useLastSignedIn = create<LastSignedInStore>()((set) => ({
  value: undefined,
  hydrate: async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    set({ value: stored });
  },
  remember: async (fullName) => {
    const name = firstName(fullName);
    set({ value: name });
    // NexdoApp.swift:302–305: a name is written, an empty one removes the key.
    if (name) await AsyncStorage.setItem(STORAGE_KEY, name).catch(() => undefined);
    else await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  },
}));
