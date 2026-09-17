import type { ConfigContext, ExpoConfig } from 'expo/config';

// The production API. Override per shell with EXPO_PUBLIC_API_URL (restart `expo start` after changing it).
const DEFAULT_API_URL = 'https://harbour-production-f8a0.up.railway.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Nexdo',
  slug: 'nexdo',
  owner: 'nexdoapp.com',
  /**
   * The Android review candidate.
   *
   * The Swift app's `MARKETING_VERSION` is 0.1.0 (ios/Nexdo.xcodeproj/project.pbxproj:255) and it
   * STAYS the shipping iOS product, so reusing its number for this separate Android artefact would
   * make two different builds claim the same version. `-rc.1` says what this build is: the first
   * candidate for the team's parity review.
   *
   * IOS CAVEAT: `CFBundleShortVersionString` must be numeric, so this string cannot be submitted to
   * App Store Connect as-is. Drop the pre-release suffix before the first TestFlight upload; see the
   * iOS-pending list in docs/IOS_TO_REACT_NATIVE.md.
   *
   * `android.versionCode` is deliberately absent: `cli.appVersionSource` is "remote" in eas.json, so
   * EAS owns the build number and the `production` profile increments it.
   */
  version: '1.0.0-rc.1',
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
    // Permissions the Swift app has no equivalent for, removed from the merged manifest.
    // - CAMERA and SYSTEM_ALERT_WINDOW: added by the WebRTC plugin for video calling; voice uses neither.
    // - WRITE_CONTACTS: added by expo-contacts, which also offers contact creation. Nexdo only READS
    //   contacts — `AppleTaskActionContacts` (ios/App/TaskActionContacts.swift:18-46) opens the store
    //   read-only and never writes — so the write permission is dropped.
    blockedPermissions: [
      'android.permission.CAMERA',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_CONTACTS',
      // - FOREGROUND_SERVICE / FOREGROUND_SERVICE_MEDIA_PLAYBACK: added by expo-audio for background
      //   playback. Nexdo never plays audio in the background — `VoicePlayback`
      //   (ios/App/VoicePlayback.swift) is an in-app player, and the voice session closes five
      //   seconds after the app is backgrounded (VoiceConversationSession.swift:209).
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    ],
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
      // Phase 9 Read Loud. `VoicePlayback` (ios/App/VoicePlayback.swift:21-42) plays the MP3 that
      // /api/speech returns through `AVAudioPlayer`; React Native's core has no audio player, so this
      // is the module that provides one. The microphone string is NOT enabled here — the WebRTC
      // plugin already declares it, with the Swift target's own wording.
      'expo-audio',
      { microphonePermission: false },
    ],
    [
      // Phase 8 reminders. Local notifications only — the Swift app registers no device token and the
      // server has no APNs or FCM path (see "Backend gaps" in docs/IOS_TO_REACT_NATIVE.md).
      //
      // The small icon and colour are ANDROID-ONLY and have no Swift counterpart: Android requires a
      // monochrome small icon, and without one the launcher icon is used and renders as a grey square.
      'expo-notifications',
      {
        icon: './assets/android-icon-monochrome.png',
        color: '#3D29F0',
      },
    ],
    [
      // Phase 8 contacts. `AppleTaskActionContacts` (ios/App/TaskActionContacts.swift:19-26) asks the
      // first time a channel is chosen, and the Swift target's usage string is reused verbatim from
      // ios/Nexdo.xcodeproj/project.pbxproj:246.
      'expo-contacts',
      {
        contactsPermission:
          'Nexdo uses Contacts to let you choose who to call, message, or email for your tasks. Phone numbers and email addresses stay on this device; matching contact names may be shared during voice clarification.',
      },
    ],
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
