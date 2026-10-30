import { randomUUID } from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getApi, isVoiceLimitReached } from '../api';
import { synchronizeDeviceTimeZone } from '../query/useProfile';
import { recordVoiceUsage } from '../query/useVoiceUsage';
import { useConsent } from '../store/consent';
import { useAppearance } from '../store/appearance';
import { useSession } from '../store/session';
import { INITIAL_STATE, VoiceConversation, type VoiceCredential, type VoiceState } from './conversation';
import { createNativeDriver, isWebRtcAvailable } from './nativeDriver';
import { TASK_SESSION_PATH, type VoiceScope } from './protocol';
import { VoiceToolExecutor } from './toolExecutor';
import type { FoodVoiceContext } from '../features/shopping/foodVoice';
import { WebRtcTransport } from './transport';
import { VoiceUsageMeter } from './usageMeter';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { authorizeMicrophone, MICROPHONE_DENIED, MicrophoneDenied, PermissionCancelled } from '../lib/permissionAccess';

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

/**
 * The line a failed start shows. Swift shows `error.localizedDescription` (AddTaskByVoiceView.swift:
 * 292-294), so the monthly limit (94da063) reads as the server wrote it — "You have used your 100
 * minutes of voice this month. …" — while every other failure keeps this screen's own line.
 */
/**
 * dc6445c (AddTaskByVoiceView.swift:337-340): startup was cancelled while the screen is still open, so offer
 * a retry rather than an idle "Ready" with no live microphone.
 */
export const START_INTERRUPTED = 'Voice setup was interrupted. Try again to start listening.';

export function startupErrorFor(error: unknown): string {
  if (error instanceof MicrophoneDenied) return MICROPHONE_DENIED;
  return isVoiceLimitReached(error) ? error.message : START_FAILED;
}

export type UseVoiceSession = {
  state: VoiceState;
  starting: boolean;
  startupError: string | null;
  /** b61801c: the microphone was refused, so the screen offers "Open Settings" (AddTaskByVoiceView.swift:97-104). */
  microphoneDenied: boolean;
  /** `start()` again, for **Start listening** (dc6445c). A no-op while starting or once a session is live. */
  start: () => void;
  toggleMute: () => void;
  finish: () => void;
  close: () => void;
};

export function useVoiceSession({
  scope,
  enabled,
  onClose,
  foodContext,
}: {
  scope: VoiceScope;
  /** The two products a food conversation compares, sent with the session (NexdoApp.swift:539). */
  foodContext?: FoodVoiceContext;
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
  const [microphoneDenied, setMicrophoneDenied] = useState(false);

  const session = useRef<VoiceConversation | null>(null);
  const executor = useRef<VoiceToolExecutor | null>(null);
  const transport = useRef<WebRtcTransport | null>(null);
  const meter = useRef<VoiceUsageMeter | null>(null);
  const food = useRef(foodContext);
  // `start()` for the session the effect below owns; replaced each time it builds one.
  const starter = useRef<() => void>(() => undefined);
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

    // `start()` (AddTaskByVoiceView.swift:315-341): the microphone first (b61801c), then sync the zone,
    // ask for a credential and connect. `guard !starting, voice.phase == .idle`, so a second tap of Start
    // listening cannot open a second session. Deferred by a microtask so the flags are not written during
    // this effect's own commit.
    let unmounted = false;
    let startingNow = false;
    const start = async () => {
      await Promise.resolve();
      if (unmounted || startingNow || conversation.snapshot.phase !== 'idle') return;
      startingNow = true;
      setStarting(true);
      setStartupError(null);
      setMicrophoneDenied(false);
      try {
        // `VoicePermissionGate.authorize` — before any paid session exists, and abandoned if the screen
        // closed while the system prompt was up (`guard isVisible`).
        await authorizeMicrophone(async () => (await requestRecordingPermissionsAsync()).granted, () => unmounted);
        // The THIRD `synchronizeDeviceTimeZone()` call site (NexdoApp.swift:472), left open in Phase 7.
        await synchronizeDeviceTimeZone(queryClient);
        if (unmounted) return;
        const credential = await getApi().request<VoiceCredential>(TASK_SESSION_PATH, {
          method: 'POST',
          body: { consent: true, scope, ...(scope === 'food' && food.current ? { foodContext: food.current } : {}) },
          timeoutMs: 25_000,
        });
        // dc6445c `guard isVisible else { return }`: a screen closed while the credential loaded must not
        // open a microphone session behind the user's back.
        if (unmounted) return;
        conversation.start(credential);
      } catch (error) {
        if (error instanceof PermissionCancelled) {
          // Dismissing the screen cancels startup; it is not a connection failure. Still open, it is the
          // interrupted setup Swift offers to retry (`if isVisible { startupError = … }`).
          if (!unmounted) setStartupError(START_INTERRUPTED);
          return;
        }
        if (error instanceof MicrophoneDenied) setMicrophoneDenied(true);
        if (!unmounted) setStartupError(startupErrorFor(error));
      } finally {
        startingNow = false;
        if (!unmounted) setStarting(false);
      }
    };
    starter.current = () => void start();
    void start();

    return () => {
      unmounted = true;
      starter.current = () => undefined;
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
      // "Permission setup has no live session to suspend (including trips to Settings)" (b61801c).
      if (conversation.snapshot.phase === 'idle') return;
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
    microphoneDenied,
    start: () => starter.current(),
    toggleMute: () => session.current?.toggleMute(),
    finish: () => session.current?.finish(),
    close: () => session.current?.close(),
  };
}
