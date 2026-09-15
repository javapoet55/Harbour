// PHASE 0 PROOF OF CONCEPT. The only file that touches react-native-webrtc and react-native-incall-manager.
import { NativeModules } from 'react-native';

import type { PeerLike, StreamLike, WebRtcDriver } from './session';

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
    },
  };
}
