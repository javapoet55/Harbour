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
  // Phase 8: `ownerKeyFor` asks for hex, the way `TaskActionCoordinator.ownerKey` does.
  CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
}));

// Phase 8 native modules. None of them has behaviour these tests care about; the suites that do
// exercise them mock them again with their own answers.
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getPresentedNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  dismissNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'scheduled'),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-file-system', () => {
  const store = new Map();
  class File {
    constructor(directory, name) {
      this.path = `${directory?.path ?? ''}/${name}`;
    }
    get exists() {
      return store.has(this.path);
    }
    textSync() {
      return store.get(this.path) ?? '';
    }
    write(contents) {
      store.set(this.path, contents);
    }
    delete() {
      store.delete(this.path);
    }
  }
  class Directory {
    constructor(base, name) {
      this.path = `${typeof base === 'string' ? base : (base?.path ?? '')}/${name}`;
    }
    get exists() {
      return true;
    }
    create() {}
  }
  return { File, Directory, Paths: { document: 'document' }, __store: store };
});

jest.mock('expo-contacts', () => ({
  Fields: { ID: 'id', Name: 'name', PhoneNumbers: 'phoneNumbers', Emails: 'emails' },
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getContactsAsync: jest.fn(async () => ({ data: [] })),
  getContactByIdAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sms', () => ({
  isAvailableAsync: jest.fn(async () => true),
  sendSMSAsync: jest.fn(async () => ({ result: 'sent' })),
}));

jest.mock('expo-mail-composer', () => ({
  MailComposerStatus: { SENT: 'sent', SAVED: 'saved', CANCELLED: 'cancelled', UNDETERMINED: 'undetermined' },
  isAvailableAsync: jest.fn(async () => true),
  composeAsync: jest.fn(async () => ({ status: 'sent' })),
}));
