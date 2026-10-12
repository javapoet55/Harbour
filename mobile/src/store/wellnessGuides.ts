import { create } from 'zustand';

import type { WellnessModule } from '../features/wellness/art';
import { useSession } from './session';

/**
 * Which Wellness module guides this SIGN-IN has already shown (8f7e492, 2edb3f0):
 * `AppModel.seenWellnessGuides` (ios/App/NexdoApp.swift), a `Set<String>` of guide kinds.
 *
 * - In memory only, as Swift's `@Published` set: a relaunch shows each guide again.
 * - Emptied on every sign-in (`finishAuthentication` clears it before publishing the profile) and on
 *   every sign-out, password change or account deletion (`reset()`).
 * - NOT emptied by a profile refresh (`reloadProfile`), which the Swift checks pin.
 *
 * Each kind is independent: seeing the Shopping guide does not skip the Moments one.
 */
type WellnessGuidesState = {
  seen: WellnessModule[];
  /**
   * `WellnessModuleEntrance(showGuide:)` and its `.onAppear` (WellnessChooserView.swift): whether this
   * entrance opens on the guide, decided ONCE, and the kind marked seen in the same step. The screen
   * keeps the answer for as long as it is open, so marking it seen never dismisses a guide on screen.
   */
  enter: (kind: WellnessModule) => boolean;
  hasSeen: (kind: WellnessModule) => boolean;
  reset: () => void;
};

export const useWellnessGuides = create<WellnessGuidesState>()((set, get) => ({
  seen: [],
  enter: (kind) => {
    const showGuide = !get().seen.includes(kind);
    if (showGuide) set({ seen: [...get().seen, kind] });
    return showGuide;
  },
  hasSeen: (kind) => get().seen.includes(kind),
  reset: () => set({ seen: [] }),
}));

/** `seenWellnessGuides.removeAll()` in `finishAuthentication` — called by `useAuth.finishAuthentication`. */
export function resetWellnessGuidesForSignIn(): void {
  useWellnessGuides.getState().reset();
}

// `reset()` runs on every way out of an account. Here that is the session's account changing — to
// another account or to none — which every sign-out path goes through (`useSession.clear()`). A
// refresh of the same account keeps the id, so it keeps the guides seen.
useSession.subscribe((state, previous) => {
  if (state.profile?.id !== previous.profile?.id) useWellnessGuides.getState().reset();
});
