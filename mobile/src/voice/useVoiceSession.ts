import { randomUUID } from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getApi } from '../api';
import { synchronizeDeviceTimeZone } from '../query/useProfile';
import { recordVoiceUsage } from '../query/useVoiceUsage';
import { useConsent } from '../store/consent';
import { useAppearance } from '../store/appearance';
import { useSession } from '../store/session';
import { INITIAL_STATE, VoiceConversation, type VoiceCredential, type VoiceState } from './conversation';
import { createNativeDriver, isWebRtcAvailable } from './nativeDriver';
import { TASK_SESSION_PATH, type VoiceScope } from './protocol';
import { VoiceToolExecutor } from './toolExecutor';
import { WebRtcTransport } from './transport';
import { VoiceUsageMeter } from './usageMeter';

/**
 * The React side of `AddTaskByVoiceView`'s session ownership
 * (ios/App/AddTaskByVoiceView.swift:11-12, `:92-124`, `:125-131`).
 *
 * Swift builds the session, the transport and the executor in `init`, starts them from `.task`, ticks
 * them once a second, follows the scene phase, and tears everything down in `.onDisappear`. This hook
 * is that lifecycle.
 */

/** `AppModel.voiceTaskSession(calendarOnly:)` (ios/App/NexdoApp.swift:470-474). */
export const START_FAILED = 'Couldn’t start voice. Close this screen and try again.';

export type UseVoiceSession = {
  state: VoiceState;
  starting: boolean;
  startupError: string | null;
  toggleMute: () => void;
  finish: () => void;
  close: () => void;
};

export function useVoiceSession({
  scope,
  enabled,
  onClose,
}: {
  scope: VoiceScope;
  /** False until consent has been given, which is when Swift calls `start()`. */
  enabled: boolean;
  onClose: () => void;
}): UseVoiceSession {
  const queryClient = useQueryClient();
  const profile = useSession((current) => current.profile);
  const ownerId = profile?.id;

  const [state, setState] = useState<VoiceState>(INITIAL_STATE);
  const [starting, setStarting] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);

  const session = useRef<VoiceConversation | null>(null);
  const executor = useRef<VoiceToolExecutor | null>(null);
  const transport = useRef<WebRtcTransport | null>(null);
  const meter = useRef<VoiceUsageMeter | null>(null);
  const closer = useRef(onClose);
  useEffect(() => {
    closer.current = onClose;
  });

  useEffect(() => {
    if (!enabled || !ownerId || session.current) return;

    // Expo Go has no react-native-webrtc native code; the Swift app's `connect` would have thrown.
    if (!isWebRtcAvailable()) {
      const timer = setTimeout(() => setStartupError(START_FAILED), 0);
      return () => clearTimeout(timer);
    }

    const tools = new VoiceToolExecutor({
      queryClient,
      ownerId,
      scope,
      uuid: randomUUID,
      consent: () => ({ ai: useConsent.getState().ai, voice: useConsent.getState().voice }),
      currentOwnerId: () => useSession.getState().profile?.id,
    });
    const peer = new WebRtcTransport({
      driver: createNativeDriver(),
      volume: () => useAppearance.getState().voiceVolume,
    });
    // `usageSessionID=UUID()` and `voice.onTelemetry` (AddTaskByVoiceView.swift:38, `:125`): one usage
    // session per conversation, reported once more when the conversation closes.
    const usage = new VoiceUsageMeter({
      sessionId: randomUUID().toUpperCase(),
      record: (sessionId, durationSeconds) => recordVoiceUsage(queryClient, sessionId, durationSeconds),
    });
    const conversation = new VoiceConversation({
      transport: peer,
      executor: tools,
      uuid: randomUUID,
      onState: setState,
      onClose: () => closer.current(),
      onTelemetry: () => usage.finish(),
    });

    meter.current = usage;
    executor.current = tools;
    transport.current = peer;
    session.current = conversation;

    // `start()` (AddTaskByVoiceView.swift:125-131): sync the zone, ask for a credential, connect.
    // Deferred by a microtask so the flag is not written during this effect's own commit.
    void (async () => {
      await Promise.resolve();
      setStarting(true);
      try {
        // The THIRD `synchronizeDeviceTimeZone()` call site (NexdoApp.swift:472), left open in Phase 7.
        await synchronizeDeviceTimeZone(queryClient);
        const credential = await getApi().request<VoiceCredential>(TASK_SESSION_PATH, {
          method: 'POST',
          body: { consent: true, scope },
          timeoutMs: 25_000,
        });
        conversation.start(credential);
      } catch {
        setStartupError(START_FAILED);
      } finally {
        setStarting(false);
      }
    })();

    return () => {
      conversation.close();
      tools.clear();
      session.current = null;
      meter.current = null;
      executor.current = null;
      transport.current = null;
    };
  }, [enabled, ownerId, queryClient, scope]);

  // `.onReceive(clock)` (AddTaskByVoiceView.swift:128-138): tick the session, then meter the phase it
  // is in afterwards.
  useEffect(() => {
    const timer = setInterval(() => {
      const conversation = session.current;
      if (!conversation) return;
      conversation.tick();
      meter.current?.tick(conversation.snapshot.phase);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // `.onChange(of: scenePhase)` (`:110-118`).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const conversation = session.current;
      if (!conversation) return;
      if (next === 'background') conversation.background(true);
      else if (next === 'active') {
        conversation.tick();
        conversation.background(false);
      }
    });
    return () => subscription.remove();
  }, []);

  /**
   * `.onChange(of: model.profile?.id)` / `aiConsent` / `voiceConsent` (`:122-124`): losing the account
   * or either consent closes the session at once.
   */
  const consent = useConsent();
  useEffect(() => {
    if (!consent.ai || !consent.voice) session.current?.close();
  }, [consent.ai, consent.voice]);
  useEffect(() => {
    if (!ownerId) session.current?.close();
  }, [ownerId]);

  // The slider can move while a session is live (VoiceWebRTCTransport.swift:23-27).
  const volume = useAppearance((current) => current.voiceVolume);
  useEffect(() => {
    transport.current?.applyVolume();
  }, [volume]);

  return {
    state,
    starting,
    startupError,
    toggleMute: () => session.current?.toggleMute(),
    finish: () => session.current?.finish(),
    close: () => session.current?.close(),
  };
}
