import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAppearance } from '../store/appearance';

/**
 * `BriefSectionSpeech` (ios/App/BriefSectionDetailView.swift:196-255, 04fa8d8): a briefing section read aloud on
 * the phone by its own text-to-speech engine (expo-speech → Android `TextToSpeech`), independent of Ask's
 * generated voice reply. Nothing leaves the device, so it needs no OpenAI sharing.
 */

/** `showError("Nexdo couldn’t start reading this briefing. Try again.")` (:218). */
export const BRIEF_SPEECH_FAILED = 'Nexdo couldn’t start reading this briefing. Try again.';

/** `readAloud()`'s gate (:96-98): spoken replies are off in Settings. */
export const SPOKEN_REPLIES_OFF = 'Enable spoken replies in Settings to use Read aloud.';

/**
 * Android speaks at most `maxSpeechInputLength` characters (4,000) per utterance, where iOS has no limit. A longer
 * section is cut at a paragraph break, else a space, and the parts are queued in order.
 */
export function speechParts(text: string, max: number = Speech.maxSpeechInputLength || 4000): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut <= 0) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

export type BriefSectionSpeech = {
  isReading: boolean;
  error: string | null;
  read: (text: string) => void;
  stop: () => void;
  showError: (message: string) => void;
};

export function useBriefSectionSpeech(): BriefSectionSpeech {
  const [isReading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `currentUtterance` (:202): callbacks from an utterance that is no longer the current one are ignored.
  const current = useRef<object | null>(null);

  /** `stop()` (:233-239): only while something is being read. */
  const stop = () => {
    if (current.current === null) return;
    current.current = null;
    setReading(false);
    void Speech.stop();
  };

  /** `read(_:)` (:209-227). */
  const read = (text: string) => {
    if (text.trim().length === 0) return;
    stop();
    setError(null);
    const token = {};
    current.current = token;
    setReading(true);
    // `utterance.volume = Float(AppVoice.volume)` (:223): the app's own voice level.
    const volume = useAppearance.getState().voiceVolume;
    const finish = () => {
      if (current.current !== token) return;
      current.current = null;
      setReading(false);
    };
    const fail = () => {
      if (current.current !== token) return;
      finish();
      setError(BRIEF_SPEECH_FAILED);
      void Speech.stop();
    };
    const parts = speechParts(text);
    try {
      parts.forEach((part, index) => {
        const last = index === parts.length - 1;
        Speech.speak(part, { volume, onDone: last ? finish : undefined, onStopped: finish, onError: fail });
      });
    } catch {
      fail();
    }
  };

  // `.onDisappear { speech.stop() }` and `.onChange(of: scenePhase) { if phase == .background { speech.stop() } }`
  // (:87-88). The ref keeps the listener and the teardown on the current `stop`.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') stopRef.current();
    });
    return () => {
      subscription.remove();
      stopRef.current();
    };
  }, []);

  return { isReading, error, read, stop, showError: setError };
}
