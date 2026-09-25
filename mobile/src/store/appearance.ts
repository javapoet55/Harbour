import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * The two DEVICE-LOCAL settings, ported from `ios/App/AppAppearance.swift`.
 *
 * Both are `@AppStorage` in `ProfileSettingsView` (ios/App/ProfileView.swift:127-128), so they live
 * in `UserDefaults` and never reach the server — no PATCH, no /api/me field. The same keys are reused
 * here so a value means the same thing in both apps. AsyncStorage is the UserDefaults analogue, as it
 * is for [[lastSignedIn]].
 *
 * This corrects a Phase 2 note: `nexdo.lastSignedInFirstName` is NOT the only UserDefaults key the
 * Swift app writes. `nexdo.appearance` and `nexdo.appVoiceVolume` are two more.
 */

/** `AppAppearance.storageKey` (AppAppearance.swift:21). */
const APPEARANCE_KEY = 'nexdo.appearance';
/** `AppVoice.volumeStorageKey` (AppAppearance.swift:4). */
const VOLUME_KEY = 'nexdo.appVoiceVolume';

/** `AppVoice.defaultVolume` (AppAppearance.swift:5). */
export const DEFAULT_VOICE_VOLUME = 1;

/** `enum AppAppearance { case system, day, night }` (AppAppearance.swift:19-20). */
export type Appearance = 'system' | 'day' | 'night';

function isAppearance(value: string | null): value is Appearance {
  return value === 'system' || value === 'day' || value === 'night';
}

type AppearanceStore = {
  /** The stored choice. `system` until hydration proves otherwise, as `@AppStorage`'s default is. */
  appearance: Appearance;
  /** `AppVoice.volume` (AppAppearance.swift:8-11), clamped to 0…1. */
  voiceVolume: number;
  /** Read both from storage. Called once at launch, before the first paint. */
  hydrate: () => Promise<void>;
  setAppearance: (next: Appearance) => Promise<void>;
  setVoiceVolume: (next: number) => Promise<void>;
};

export const useAppearance = create<AppearanceStore>()((set) => ({
  appearance: 'system',
  voiceVolume: DEFAULT_VOICE_VOLUME,
  hydrate: async () => {
    const [stored, volume] = await Promise.all([
      AsyncStorage.getItem(APPEARANCE_KEY).catch(() => null),
      AsyncStorage.getItem(VOLUME_KEY).catch(() => null),
    ]);
    const parsed = volume === null ? Number.NaN : Number.parseFloat(volume);
    set({
      appearance: isAppearance(stored) ? stored : 'system',
      voiceVolume: Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_VOICE_VOLUME,
    });
  },
  setAppearance: async (next) => {
    // `@AppStorage` applies immediately and writes through; so does this.
    set({ appearance: next });
    await AsyncStorage.setItem(APPEARANCE_KEY, next).catch(() => undefined);
  },
  setVoiceVolume: async (next) => {
    const value = clamp(next);
    set({ voiceVolume: value });
    await AsyncStorage.setItem(VOLUME_KEY, String(value)).catch(() => undefined);
  },
}));

/** `min(max(value, 0), 1)` (AppAppearance.swift:10). */
function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
