import { create } from 'zustand';

/**
 * Voice and AI consent — in memory only, reset on every launch.
 *
 * This matches Swift exactly: `AppModel.voiceConsent` and `AppModel.aiConsent`
 * (ios/App/NexdoApp.swift:124-125) are plain `@Published` properties with no `@AppStorage` and no
 * `UserDefaults` key, so consent does not survive a relaunch, and `withdrawConsent()`
 * (NexdoApp.swift:720) only clears the in-memory flags.
 *
 * Phase 2 persisted this to AsyncStorage on request; that went beyond the Swift app and was reverted
 * in Phase 3 housekeeping. PHASE 6 MUST NOT REINTRODUCE PERSISTENCE: a consent flag that outlives the
 * process would let a relaunched app share task and calendar data with the assistant without the
 * person re-consenting, which is precisely what the Swift app avoids.
 */
export type ConsentState = {
  /** Sharing task and calendar data with the assistant. Gates every AI request. */
  ai: boolean;
  /** Microphone capture for voice conversations. Voice needs `ai` as well. */
  voice: boolean;
};

type ConsentStore = ConsentState & {
  setConsent: (next: Partial<ConsentState>) => void;
  /** `AppModel.withdrawConsent()`: clears both flags. */
  withdraw: () => void;
};

const EMPTY: ConsentState = { ai: false, voice: false };

export const useConsent = create<ConsentStore>()((set) => ({
  ...EMPTY,
  setConsent: (next) => set((state) => ({ ai: next.ai ?? state.ai, voice: next.voice ?? state.voice })),
  withdraw: () => set({ ...EMPTY }),
}));
