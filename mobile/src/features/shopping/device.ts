import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createAudioPlayer, requestRecordingPermissionsAsync } from 'expo-audio';
import { Share } from 'react-native';
import { create } from 'zustand';

import { useAppearance } from '../../store/appearance';
import { createNativeDriver } from '../../voice/nativeDriver';
import { WebRtcTransport } from '../../voice/transport';
import { shoppingStore } from './store';
import { ShoppingVoice } from './voice';

/** A live `ShoppingVoice`: the Phase 9 WebRTC transport, the server's transcription session, expo-audio's permission. */
export function createShoppingVoice(): ShoppingVoice {
  return new ShoppingVoice({
    credential: () => shoppingStore.getState().credential(),
    createTransport: () => new WebRtcTransport({ driver: createNativeDriver(), volume: () => useAppearance.getState().voiceVolume }),
    requestMicrophone: async () => (await requestRecordingPermissionsAsync()).granted,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    setTimer: (callback, ms) => {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
    uuid: () => Crypto.randomUUID().toUpperCase(),
  });
}

/**
 * `ShoppingVoiceBell` (ios/App/ShoppingVoice.swift:130-140): a short local cue at half volume when the
 * mic is tapped to start. It does not record and does not change the audio mode. Played through
 * expo-audio, the module Phase 9's Read Loud already uses.
 */
export function playStartBell(): void {
  try {
    const player = createAudioPlayer(require('../../../assets/shopping-mic-bell.wav'));
    player.volume = 0.5;
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (!status.didJustFinish) return;
      subscription.remove();
      player.remove();
    });
    player.play();
  } catch {
    // `guard let url … else { return }` / `try? AVAudioPlayer`: a cue that cannot play is skipped.
  }
}

/** `@AppStorage("shopping.liveTranscriptionEnabled")`, default on (0837810). Same key as Swift. */
export const CONSENT_KEY = 'shopping.liveTranscriptionEnabled';

type ConsentState = { enabled: boolean; hydrate: () => Promise<void>; setEnabled: (value: boolean) => void };

export const useTranscriptionConsent = create<ConsentState>()((set) => ({
  enabled: true,
  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(CONSENT_KEY);
      if (stored !== null) set({ enabled: stored === 'true' });
    } catch {
      // Keep the default.
    }
  },
  setEnabled: (value) => {
    set({ enabled: value });
    void AsyncStorage.setItem(CONSENT_KEY, String(value)).catch(() => undefined);
  },
}));

/**
 * `ShareLink(item:)` — the system share sheet with plain text or the link. Android shares a `message`
 * only, so the URL travels as the message text.
 */
export async function shareMessage(message: string): Promise<void> {
  await Share.share({ message });
}
