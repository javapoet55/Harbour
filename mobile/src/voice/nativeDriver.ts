// The only file that touches react-native-webrtc and react-native-incall-manager.
import { NativeModules } from 'react-native';

import type { PeerLike, StreamLike, WebRtcDriver } from './transport';

/** False in Expo Go, which does not contain react-native-webrtc's native code. */
export function isWebRtcAvailable(): boolean {
  return NativeModules.WebRTCModule != null;
}

export function createNativeDriver(): WebRtcDriver {
  // Required lazily: importing react-native-webrtc throws when its native module is missing (Expo Go),
  // and Expo Router may evaluate this route's module there.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native import, see above
  const webrtc = require('react-native-webrtc') as typeof import('react-native-webrtc');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native import, see above
  const InCallManager = (require('react-native-incall-manager') as typeof import('react-native-incall-manager')).default;

  return {
    // No ICE servers, like the Swift transport: OpenAI's answer carries its candidates.
    createPeer: () => new webrtc.RTCPeerConnection({ iceServers: [] }) as unknown as PeerLike,
    getMicrophone: async () => (await webrtc.mediaDevices.getUserMedia({ audio: true, video: false })) as unknown as StreamLike,
    audioRoute: {
      // TODO(phase0-decision): react-native-webrtc has no speaker API and Android voice-call audio defaults to the
      // earpiece. react-native-incall-manager forces the loudspeaker (the Swift app uses .defaultToSpeaker).
      start: () => {
        InCallManager.start({ media: 'audio' });
        InCallManager.setForceSpeakerphoneOn(true);
      },
      stop: () => {
        InCallManager.setForceSpeakerphoneOn(false);
        InCallManager.stop();
      },
      /**
       * VISUAL GAP, carried from Phase 0. `VoiceWebRTCTransport.applyVoiceVolume()`
       * (ios/App/VoiceWebRTCTransport.swift:141-144) sets `remoteAudio.source.volume` — a per-TRACK
       * gain that WebRTC allows above unity, which is how Swift reaches +200% at the slider's 100%.
       * react-native-webrtc exposes no equivalent on `MediaStreamTrack`, and incall-manager has no
       * volume API either, so the ×3 gain cannot be applied on Android: the reply plays at the
       * device volume. The slider is still stored and still drives Read Loud, where the volume IS
       * applied. Revisit if react-native-webrtc adds a track gain.
       */
      setVolume: () => undefined,
    },
  };
}
