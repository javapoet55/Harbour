import type { ConfigContext, ExpoConfig } from 'expo/config';

// The production API. Override per shell with EXPO_PUBLIC_API_URL (restart `expo start` after changing it).
const DEFAULT_API_URL = 'https://harbour-production-f8a0.up.railway.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Nexdo',
  slug: 'nexdo',
  owner: 'nexdoapp.com',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'nexdo',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.pinslots.nexdo',
    // Sign in with Apple entitlement, matching ios/App/Nexdo.entitlements on the Swift app.
    // This is a native capability: it needs a new EAS build and cannot work in Expo Go.
    usesAppleSignIn: true,
    // TODO(phase1-decision): template default kept; the Swift app is iPhone-first. Revisit before the first EAS build.
    supportsTablet: true,
  },
  android: {
    // TODO(phase0-decision): EAS and prebuild need an Android package name; this mirrors the iOS bundle ID.
    package: 'com.pinslots.nexdo',
    // The WebRTC config plugin adds these for video calling; voice does not use them.
    blockedPermissions: ['android.permission.CAMERA', 'android.permission.SYSTEM_ALERT_WINDOW'],
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-apple-authentication',
    // Phase 7. `expo-web-browser` drives the Google Calendar OAuth session
    // (`openAuthSessionAsync`), the analogue of Swift's `ASWebAuthenticationSession`
    // (ios/App/ProfileView.swift:12). It declares no permissions of its own.
    'expo-web-browser',
    [
      // Phase 7 profile photo. Swift uses `PhotosPicker` (ios/App/ProfileView.swift:181), which is
      // PHPickerViewController: it runs out of process and needs NO usage description, which is why
      // ios/Nexdo.xcodeproj/project.pbxproj declares NSContactsUsageDescription and
      // NSMicrophoneUsageDescription but NO NSPhotoLibraryUsageDescription and no camera string.
      //
      // Both permissions are therefore switched OFF, so the generated Info.plist and
      // AndroidManifest.xml stay as close to the Swift app as the plugin allows.
      // `launchImageLibraryAsync` uses the system photo picker, which needs neither.
      // Swift offers NO camera option, so `cameraPermission` is off as well.
      'expo-image-picker',
      { photosPermission: false, cameraPermission: false },
    ],
    [
      // Phase 0 voice PoC. Needs a development build; Expo Go cannot load react-native-webrtc.
      // TODO(phase0-decision): the plugin's compatibility table stops at SDK 56 (plugin 15.0.0); 15.0.2 declares expo >=56.
      '@config-plugins/react-native-webrtc',
      {
        microphonePermission: 'Nexdo uses the microphone for voice conversations with your assistant.',
        // TODO(phase0-decision): the plugin always sets a camera usage string; voice never opens the camera.
        cameraPermission: 'Nexdo does not use the camera for voice conversations.',
      },
    ],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL,
    eas: {
      projectId: '516b1728-b251-4002-bbb2-4db914857000',
    },
  },
});
