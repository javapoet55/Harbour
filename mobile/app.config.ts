import type { ConfigContext, ExpoConfig } from 'expo/config';

// The production API. Override per shell with EXPO_PUBLIC_API_URL (restart `expo start` after changing it).
const DEFAULT_API_URL = 'https://harbour-production-f8a0.up.railway.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Nexdo',
  slug: 'nexdo',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'nexdo',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.pinslots.nexdo',
    // TODO(phase1-decision): template default kept; the Swift app is iPhone-first. Revisit before the first EAS build.
    supportsTablet: true,
  },
  android: {
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
  plugins: ['expo-router'],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL,
  },
});
