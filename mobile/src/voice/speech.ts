import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import { getApiUrl } from '../config';
import { useAppearance } from '../store/appearance';

/**
 * `VoicePlayback` (ios/App/VoicePlayback.swift:4-54) — the Read Loud path.
 *
 * WHAT SYNTHESISES THE SPEECH: neither `AVSpeechSynthesizer` nor the realtime model. Swift POSTs the
 * text to `/api/speech`, which answers with `audio/mpeg`, and plays that MP3 through `AVAudioPlayer`
 * (`AppModel.speechAudio(for:)`, ios/App/NexdoApp.swift:682-691). So this does the same: one request
 * per chunk, written to a temporary file, played by `expo-audio`.
 *
 * VOLUME: `player.volume = Float(AppVoice.volume)` (`:31`) — the plain 0…1 slider value, with NO ×3
 * gain. The gain belongs to the realtime track alone (`VoiceWebRTCTransport.swift:143`). Swift also
 * re-applies the volume to a PLAYING player when the slider moves (`:15-19`), which is reproduced by
 * the subscription below.
 */

/** `AppModel.speechAudio(for:)` (NexdoApp.swift:682-691), which is not JSON, so it bypasses the client. */
export async function fetchSpeech(text: string, fetchImpl: typeof fetch = fetch): Promise<ArrayBuffer> {
  const response = await fetchImpl(`${getApiUrl()}/api/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text }),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Nexdo could not play the voice response.');
  const type = response.headers.get('content-type') ?? '';
  // `expectedMimeType: "audio/mpeg"` — a JSON error page must not be handed to the player.
  if (!type.includes('audio/')) throw new Error('Nexdo could not play the voice response.');
  return response.arrayBuffer();
}

export type SpeechHandlers = {
  /** The request for this chunk is in flight (`preparingSpeech`). */
  onPreparing: (preparing: boolean) => void;
  /** `playback.isPlaying`. */
  onPlaying: (playing: boolean) => void;
  /** Every chunk has been spoken. */
  onFinished: () => void;
  /** `audioPlayerDidFinishPlaying(_:successfully: false)` or a failed request. */
  onError: (message: string) => void;
};

export type SpeechPlayback = { stop: () => void };

/** `stop()` (VoicePlayback.swift:43) plus `speakChunks` (AskNexdoView.swift:428-445). */
export function playSpeech(chunks: string[], handlers: SpeechHandlers, fetchImpl: typeof fetch = fetch): SpeechPlayback {
  let cancelled = false;
  let player: AudioPlayer | null = null;
  let unsubscribe: (() => void) | null = null;

  const release = () => {
    unsubscribe?.();
    unsubscribe = null;
    player?.remove();
    player = null;
  };

  const speak = async (index: number) => {
    if (cancelled) return;
    if (index >= chunks.length) {
      handlers.onPlaying(false);
      handlers.onFinished();
      return;
    }
    handlers.onPreparing(true);
    let file: File;
    try {
      const audio = await fetchSpeech(chunks[index], fetchImpl);
      if (cancelled) return;
      file = writeChunk(audio, index);
      // `session.setCategory(.playback, mode: .spokenAudio)` (VoicePlayback.swift:26).
      await setAudioModeAsync({ playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    } catch (cause) {
      if (cancelled) return;
      handlers.onPreparing(false);
      handlers.onError(cause instanceof Error ? cause.message : 'Nexdo could not play the voice response.');
      return;
    }

    if (cancelled) return;
    handlers.onPreparing(false);
    handlers.onPlaying(true);

    release();
    const next = createAudioPlayer(file);
    player = next;
    next.volume = useAppearance.getState().voiceVolume;
    // "player?.volume = Float(AppVoice.volume)" on `volumeDidChange` (VoicePlayback.swift:15-19).
    unsubscribe = useAppearance.subscribe((state) => {
      if (player === next) next.volume = state.voiceVolume;
    });

    const listener = next.addListener('playbackStatusUpdate', (status) => {
      if (cancelled || player !== next || !status.didJustFinish) return;
      listener.remove();
      release();
      void speak(index + 1);
    });
    next.play();
  };

  void speak(0);

  return {
    stop: () => {
      cancelled = true;
      release();
      handlers.onPreparing(false);
      handlers.onPlaying(false);
    },
  };
}

/** `expo-audio` plays from a URI, so each chunk is written to the cache first. */
function writeChunk(audio: ArrayBuffer, index: number): File {
  const directory = new Directory(Paths.cache, 'speech');
  if (!directory.exists) directory.create({ intermediates: true });
  const file = new File(directory, `chunk-${index}.mp3`);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(audio));
  return file;
}
