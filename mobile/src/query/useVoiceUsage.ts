import { useQuery, type QueryClient } from '@tanstack/react-query';

import { endpoints, type VoiceUsage } from '../api';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

/**
 * `AppModel.voiceUsage` and `refreshVoiceUsage()` (ios/App/NexdoApp.swift:16, `:529-532`): this
 * month's real-time voice receipt from `GET /api/voice/usage`.
 *
 * Swift stores an answer only if the profile it asked for is still signed in (`profile?.id==owner`).
 * Here the key carries the owner id, so an answer can only ever land under the account that asked,
 * and sign-out's `queryClient.clear()` is Swift's `voiceUsage = nil` (NexdoApp.swift:790).
 */
export function useVoiceUsage() {
  const ownerId = useSession((state) => state.profile?.id);
  return useQuery<VoiceUsage>({
    queryKey: queryKeys.voiceUsage(ownerId ?? ''),
    queryFn: () => endpoints.voiceUsage(),
    enabled: Boolean(ownerId),
  });
}

/**
 * `AppModel.recordVoiceUsage(sessionID:duration:)` (NexdoApp.swift:534-539): POST the session's
 * cumulative active seconds and keep the receipt it answers with, but only if the same account is
 * still signed in when it arrives. A zero duration sends nothing; any failure is swallowed (`try?`).
 */
export async function recordVoiceUsage(queryClient: QueryClient, sessionId: string, durationSeconds: number): Promise<void> {
  if (!(durationSeconds > 0)) return;
  const owner = useSession.getState().profile?.id;
  try {
    const usage = await endpoints.recordVoiceUsage({ sessionId, durationSeconds });
    const current = useSession.getState().profile?.id;
    if (owner && current === owner) queryClient.setQueryData(queryKeys.voiceUsage(owner), usage);
  } catch {
    // Swift: `if let usage = try? await ...` — a failed report changes nothing; the next one covers it.
  }
}
