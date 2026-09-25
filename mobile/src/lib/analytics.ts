import { getAnalytics, logEvent as firebaseLogEvent } from '@react-native-firebase/analytics';

/**
 * Port of `NexdoAnalytics.logEvent` (ios/App/FirebaseAnalyticsBridge.swift:17-20).
 *
 * Swift needs a WebView bridge because its events came from web content; here the screens are
 * native, so events go straight to the SDK.
 */
export function logEvent(name: string, params?: Record<string, unknown>): void {
  firebaseLogEvent(getAnalytics(), name, params);
}
