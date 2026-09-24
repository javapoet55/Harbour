import 'server-only';

// First line of defence in front of the backend's durable limits (per 15 minutes: 3 code requests per
// email, 10 per IP, 20 code attempts per IP). Counts code requests and code attempts together.
// Per instance and in memory only: it resets on restart and is not shared across replicas.
const WINDOW_MS = 15 * 60_000;
export const LOGIN_ATTEMPTS_PER_IP = 20;
const MAX_TRACKED = 5_000;
const attempts = new Map<string, number[]>();

export function allowLoginAttempt(ip: string | null, now = Date.now()) {
  const key = ip ?? 'unknown';
  const recent = (attempts.get(key) ?? []).filter((time) => time > now - WINDOW_MS);
  if (recent.length >= LOGIN_ATTEMPTS_PER_IP) { attempts.set(key, recent); return false; }
  recent.push(now);
  attempts.delete(key);
  attempts.set(key, recent);
  if (attempts.size > MAX_TRACKED) attempts.delete(attempts.keys().next().value!);
  return true;
}

export function resetLoginAttempts() { attempts.clear(); }
