import { create } from 'zustand';

/**
 * `TodayAttentionSheet`'s `@State private var saving` and `failure`
 * (ios/App/TodayAttentionSheet.swift:10-11).
 *
 * In Swift the Reschedule all form is a `.sheet` declared INSIDE the attention sheet, so both read the
 * same two properties: the failure shows in both, and the attention sheet's Close is disabled while a
 * reschedule is saving. Here the two sheets are separate routes, so the state they share lives here.
 */
type AttentionStore = {
  saving: boolean;
  failure: string | null;
  setSaving: (saving: boolean) => void;
  setFailure: (failure: string | null) => void;
  reset: () => void;
};

export const useAttentionSheet = create<AttentionStore>()((set) => ({
  saving: false,
  failure: null,
  setSaving: (saving) => set({ saving }),
  setFailure: (failure) => set({ failure }),
  reset: () => set({ saving: false, failure: null }),
}));
