import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Voice and AI consent.
 *
 * TODO(phase2-decision): the Swift app does NOT store consent on the device. `AppModel.voiceConsent`
 * and `AppModel.aiConsent` are plain `@Published` properties (ios/App/NexdoApp.swift:124–125) with no
 * `@AppStorage` or `UserDefaults` key, so in Swift consent resets on every launch and
 * `withdrawConsent()` (NexdoApp.swift:720) only clears the in-memory flags. Phase 2 was asked for a
 * device-backed store, so this persists — Phase 6 must decide whether to keep that or match Swift and
 * reset per launch.
 *
 * AsyncStorage rather than expo-secure-store: these are preference booleans, not secrets, and the
 * Swift analogue (had it persisted) would have been UserDefaults, whose semantics AsyncStorage shares.
 * The Keychain also survives app deletion, which would silently keep consent after a reinstall.
 */
const STORAGE_KEY = 'nexdo.consent';

export type ConsentState = {
  /** Sharing task and calendar data with the assistant. Gates every AI request. */
  ai: boolean;
  /** Microphone capture for voice conversations. Voice needs `ai` as well. */
  voice: boolean;
};

type ConsentStore = ConsentState & {
  /** False until the stored value has been read, so the UI does not flash a withdrawn state. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setConsent: (next: Partial<ConsentState>) => Promise<void>;
  /** `AppModel.withdrawConsent()`: clears both flags. */
  withdraw: () => Promise<void>;
};

const EMPTY: ConsentState = { ai: false, voice: false };

function parse(raw: string | null): ConsentState {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return EMPTY;
    const record = value as Record<string, unknown>;
    return { ai: record.ai === true, voice: record.voice === true };
  } catch {
    return EMPTY;
  }
}

export const useConsent = create<ConsentStore>()((set, get) => ({
  ...EMPTY,
  hydrated: false,
  hydrate: async () => {
    const stored = parse(await AsyncStorage.getItem(STORAGE_KEY).catch(() => null));
    set({ ...stored, hydrated: true });
  },
  setConsent: async (next) => {
    const value: ConsentState = { ai: next.ai ?? get().ai, voice: next.voice ?? get().voice };
    set(value);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value)).catch(() => undefined);
  },
  withdraw: async () => {
    set(EMPTY);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  },
}));
