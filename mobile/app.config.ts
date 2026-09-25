import type { ConfigContext, ExpoConfig } from 'expo/config';

// The DEV API, used by `expo start` and the `development` EAS profile. `preview` and `production` set
// EXPO_PUBLIC_API_URL to https://app.nexdoapp.com in eas.json. Override per shell with
// EXPO_PUBLIC_API_URL (restart `expo start` after changing it).
const DEFAULT_API_URL = 'https://app-dev.nexdoapp.com';

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
    // Firebase Analytics, the Android side of ios/App/FirebaseAnalyticsBridge.swift. Downloaded from
    // the Nexdoapp Firebase project; it holds client identifiers only, no secrets.
    googleServicesFile: './google-services.json',
    // Exact reminder times on Android 12+ (API 31+). expo-notifications schedules a DATE trigger with
    // `setExactAndAllowWhileIdle` only when `AlarmManager.canScheduleExactAlarms()` is true, and falls
    // back to the INEXACT `setAndAllowWhileIdle` otherwise (ExpoSchedulingDelegate.setupAlarm). Without
    // this permission every task-action and wish reminder on Android 12+ was inexact, which the system
    // (and battery managers such as MIUI's) can defer well past "Remind me in 15 minutes". Android 12
    // and 12L grant it at install; on Android 13+ it starts denied and the person can allow it under
    // Settings → Apps → Nexdo → Alarms & reminders. USE_EXACT_ALARM (auto-granted on 13+) is limited by
    // Play policy to alarm-clock and calendar apps, so it is not declared. Needs a native rebuild.
    permissions: ['android.permission.SCHEDULE_EXACT_ALARM'],
    // Permissions the Swift app has no equivalent for, removed from the merged manifest.
    // - SYSTEM_ALERT_WINDOW: added by the WebRTC plugin for video calling; voice never uses it.
    //   (CAMERA was blocked here until Phase 11 Run C: the Shopping item editor's "Take a Picture"
    //   needs it — expo-image-picker's `launchCameraAsync` refuses to open without the permission on
    //   Android — and Swift asks for the camera there too, ShoppingItemEditor.swift:81-84.)
    // - WRITE_CONTACTS: added by expo-contacts, which also offers contact creation. Nexdo only READS
    //   contacts — `AppleTaskActionContacts` (ios/App/TaskActionContacts.swift:18-46) opens the store
    //   read-only and never writes — so the write permission is dropped.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_CONTACTS',
      // - WRITE_CALENDAR: added by expo-calendar. Important Moments only READS the calendar the person
      //   picks (`MomentCalendarService`, ios/App/MomentEditor.swift:276-287); nothing is ever written.
      'android.permission.WRITE_CALENDAR',
      // - FOREGROUND_SERVICE / FOREGROUND_SERVICE_MEDIA_PLAYBACK: added by expo-audio for background
      //   playback. Nexdo never plays audio in the background — `VoicePlayback`
      //   (ios/App/VoicePlayback.swift) is an in-app player, and the voice session closes five
      //   seconds after the app is backgrounded (VoiceConversationSession.swift:209).
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      // - ACCESS_FINE_LOCATION: added by expo-location. Weather needs only the town, so Android asks for
      //   APPROXIMATE location (ACCESS_COARSE_LOCATION, which expo-location's manifest also declares and
      //   which alone counts as granted). expo-location's config plugin is deliberately NOT listed: its
      //   only job would be iOS usage strings, and iOS weather keeps Swift's fixed coordinates.
      'android.permission.ACCESS_FINE_LOCATION',
      // - AD_ID: added by @react-native-firebase/analytics. Nexdo never reads the advertising ID, and
      //   declaring it would make Play ask us to disclose ad-ID use in Data safety. Analytics keeps
      //   working without it — it just falls back to an app-scoped identifier.
      'com.google.android.gms.permission.AD_ID',
    ],
    adaptiveIcon: {
      // The mark is drawn on white, exactly as the Swift app's AppIcon is
      // (ios/Media.xcassets/AppIcon.appiconset/AppIcon.png), so the launcher icon matches iOS.
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // `adjustResize`. Edge to edge (always on since SDK 54) stops it resizing the window on its own;
    // react-native-keyboard-controller reads the keyboard frame instead (src/components/keyboard.tsx).
    softwareKeyboardLayoutMode: 'resize',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    [
      // Without this plugin there is no splash screen at all: the app opens on a blank white
      // window and the first frame the user sees is whatever React renders. Expo SDK 57 has no
      // top-level `splash` key — the plugin is the only way to configure one
      // (https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/).
      //
      // The image is transparent, so a single file works against both backgrounds below.
      //
      // The backgrounds and the logo size match `SplashView` (src/components/SplashView.tsx), which
      // takes over if the splash is held too long (app/_layout.tsx): its mark is 116 wide, and the
      // "N" fills about 85% of this image's width, so 137 draws it at the same size.
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 137,
        resizeMode: 'contain',
        backgroundColor: '#FFFFFF',
        dark: {
          image: './assets/splash-icon.png',
          backgroundColor: '#000000',
        },
      },
    ],
    [
      // WORKAROUND, remove when Expo ships a fixed expo-contacts.
      //
      // The precompiled ExpoContacts.xcframework published for SDK 57 (expo-contacts 57.0.5) is
      // linked against `@rpath/Testing.framework/Testing` — Swift's test-only framework, which is
      // not present at runtime — so the app dies at launch with
      // "Library not loaded: @rpath/Testing.framework/Testing". Confirmed with `otool -L`; the bad
      // binary even carries the publisher's own build path in its rpaths.
      //
      // The podspec builds from source perfectly well, so turn the precompiled modules off. The
      // generated Podfile otherwise defaults them on (`ENV['EXPO_USE_PRECOMPILED_MODULES'] ||= '1'`).
      // Cost: a slower first `pod install`, since every Expo module compiles from source.
      'expo-build-properties',
      { ios: { usePrecompiledModules: false } },
    ],
    'expo-router',
    'expo-dev-client',
    // Firebase Analytics. Android only for now: iOS still ships the Swift app, which has its own SDK.
    '@react-native-firebase/app',
    '@react-native-firebase/analytics',
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
      // ios/Nexdo.xcodeproj/project.pbxproj:321 (Phase 11: Swift added the Important Moments sentence).
      'expo-contacts',
      {
        contactsPermission:
          'Nexdo uses Contacts to let you choose who to call, message, or email for your tasks. Phone numbers and email addresses stay on this device; matching contact names may be shared during voice clarification. For Important Moments, only recipient details you review and save are synced to your Nexdo account.',
      },
    ],
    [
      // Phase 11 Important Moments. "Choose calendars and anniversary candidates" reads ONE device
      // calendar the person picks (`MomentCalendarService`, ios/App/MomentEditor.swift:276-287). The
      // usage string is the Swift target's verbatim (ios/Nexdo.xcodeproj/project.pbxproj:319); reminders
      // are never read, so that permission stays off.
      'expo-calendar',
      {
        calendarPermission: 'Nexdo reads your selected calendars to suggest birthday and anniversary moments for your review.',
        remindersPermission: false,
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
      // Phase 11 Run C: the Shopping item editor DOES offer "Take a Picture", so the camera string is
      // now the Swift target's, verbatim (ios/Nexdo.xcodeproj/project.pbxproj:320).
      'expo-image-picker',
      { photosPermission: false, cameraPermission: 'Nexdo uses the camera when you choose to attach a photo to a shopping item.' },
    ],
    [
      // Phase 0 voice PoC. Needs a development build; Expo Go cannot load react-native-webrtc.
      // TODO(phase0-decision): the plugin's compatibility table stops at SDK 56 (plugin 15.0.0); 15.0.2 declares expo >=56.
      '@config-plugins/react-native-webrtc',
      {
        microphonePermission: 'Nexdo uses the microphone for voice conversations with your assistant.',
        // The plugin always sets a camera usage string; it must match expo-image-picker's, or the later
        // plugin overwrites the shopping photo string on iOS. Voice never opens the camera.
        cameraPermission: 'Nexdo uses the camera when you choose to attach a photo to a shopping item.',
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
