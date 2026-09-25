import { create } from 'zustand';

import type { Profile } from '../api/types';

export type SessionStatus = 'unknown' | 'signedOut' | 'signedIn';

type SessionState = {
  status: SessionStatus;
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  clear: () => void;
};

export const useSession = create<SessionState>()((set) => ({
  status: 'unknown',
  profile: null,
  setProfile: (profile) => set({ status: 'signedIn', profile }),
  clear: () => set({ status: 'signedOut', profile: null }),
}));
