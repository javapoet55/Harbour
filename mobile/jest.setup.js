// Native modules the auth screens pull in. jest-expo does not provide these, and none of them has
// behaviour the tests care about — they only need to render and resolve.

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});

jest.mock('@react-native-masked-view/masked-view', () => {
  const { View } = require('react-native');
  return View;
});

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { View } = require('react-native');
  return View;
});

// Sign in with Apple is unavailable in tests, so the button does not render — the same branch Android takes.
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => false),
  signInAsync: jest.fn(),
  AppleAuthenticationButton: 'AppleAuthenticationButton',
  AppleAuthenticationButtonType: { CONTINUE: 2 },
  AppleAuthenticationButtonStyle: { BLACK: 0 },
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-nonce'),
  digestStringAsync: jest.fn(async () => 'digest'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

// AuthScreen reads useSafeAreaInsets() to clear the status bar on Android. The tests render screens
// without a SafeAreaProvider, which otherwise throws. Report a plain iPhone-ish inset.
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 47, right: 0, bottom: 34, left: 0 };
  const frame = { x: 0, y: 0, width: 402, height: 874 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => children,
    SafeAreaInsetsContext: { Consumer: ({ children }) => children(insets), Provider: ({ children }) => children },
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});
