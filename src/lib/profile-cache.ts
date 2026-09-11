const PROFILE_CACHE_KEY = 'harbor:profile-cache:v1';

export type ProfileCache = {
  name?: string;
  timeZone?: string;
};

export function readCachedProfile(): ProfileCache {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as ProfileCache;
    return {
      name: typeof data?.name === 'string' ? data.name : undefined,
      timeZone: typeof data?.timeZone === 'string' ? data.timeZone : undefined,
    };
  } catch {
    return {};
  }
}

export function writeCachedProfile(profile: ProfileCache) {
  if (typeof window === 'undefined') return;
  try {
    const next: ProfileCache = {};
    if (profile.name && profile.name.trim()) next.name = profile.name.trim();
    if (profile.timeZone && profile.timeZone.trim()) next.timeZone = profile.timeZone.trim();

    if (next.name || next.timeZone) {
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    return;
  }
}

export function firstName(profileName?: string): string {
  return profileName ? profileName.split(/\s+/)[0] : '';
}

