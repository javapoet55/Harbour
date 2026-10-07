// Every machine formats in the Mac's en-US locale. Node takes its default locale from the OS (en-IN on
// the Windows PC, where LANG is ignored), so a call that names no locale gets en-US here instead. The
// time zone is pinned in jest.globalSetup.js.
const TEST_LOCALE = 'en-US';
const withLocale = (locales) => (locales === undefined ? TEST_LOCALE : locales);
for (const name of ['DateTimeFormat', 'NumberFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat', 'ListFormat', 'Segmenter']) {
  const Real = Intl[name];
  if (!Real) continue;
  const Pinned = function (locales, options) {
    return new Real(withLocale(locales), options);
  };
  Pinned.prototype = Real.prototype;
  Pinned.supportedLocalesOf = Real.supportedLocalesOf.bind(Real);
  Intl[name] = Pinned;
}
for (const [proto, methods] of [
  [Date.prototype, ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']],
  [Number.prototype, ['toLocaleString']],
]) {
  for (const method of methods) {
    const real = proto[method];
    proto[method] = function (locales, options) {
      return real.call(this, withLocale(locales), options);
    };
  }
}
const realLocaleCompare = String.prototype.localeCompare;
// eslint-disable-next-line no-extend-native -- replaces a built-in on purpose, tests only
String.prototype.localeCompare = function (that, locales, options) {
  return realLocaleCompare.call(this, that, withLocale(locales), options);
};

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

// react-native-keyboard-controller ships its own mock: host stand-ins for its components and inert hooks.
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

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
  IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => null),
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
    create() {
      if (!store.has(this.path)) store.set(this.path, '');
    }
    write(contents) {
      store.set(this.path, typeof contents === 'string' ? contents : '<binary>');
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

// Phase 9 Read Loud: expo-audio's real module needs the native runtime to subclass its player.
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    volume: 1,
    play: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

// react-native-webrtc and its in-call companion are native-only; the voice tests inject fakes.
jest.mock('react-native-webrtc', () => ({ RTCPeerConnection: jest.fn(), mediaDevices: { getUserMedia: jest.fn() } }));
jest.mock('react-native-incall-manager', () => ({
  default: { start: jest.fn(), stop: jest.fn(), setForceSpeakerphoneOn: jest.fn() },
}));

jest.mock('expo-contacts/legacy', () => ({
  Fields: { ID: 'id', Name: 'name', PhoneNumbers: 'phoneNumbers', Emails: 'emails' },
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getContactsAsync: jest.fn(async () => ({ data: [] })),
  getContactByIdAsync: jest.fn(async () => undefined),
  // Phase 11: the system picker Important Moments uses instead of reading the address book.
  presentContactPickerAsync: jest.fn(async () => null),
}));

// Phase 11 Important Moments native modules. Suites that exercise them mock them again.
jest.mock('expo-calendar', () => ({
  EntityTypes: { EVENT: 'event' },
  requestCalendarPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getCalendarsAsync: jest.fn(async () => []),
  getEventsAsync: jest.fn(async () => []),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

// Native view capture: the real module needs a mounted host view and a native bridge.
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///card-capture.jpg'),
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

// React Query teardown. React Query 5 delivers query results through `notifyManager`, which batches
// them onto a real `setTimeout(0)`, and a `gcTime` removal is a timer too. Every suite builds its own
// `QueryClient` and none was ever cleared, so those timers outlived their test: a late result could
// land in the NEXT assertion (the "Your profile" flake in account.test.tsx) and jest reported "A
// worker process has failed to exit gracefully". After each test: unmount what the test rendered,
// cancel and clear every client a `QueryClientProvider` mounted, then let `notifyManager`'s pending
// flush run while this test still owns the environment.
const { cleanup: unmountRendered } = require('@testing-library/react-native/pure');
const { QueryClient } = require('@tanstack/query-core');

// Captured before any suite installs fake timers, so the final tick is always a real one.
const realSetTimeout = global.setTimeout;
const mountedQueryClients = new Set();
const mountQueryClient = QueryClient.prototype.mount;
// `QueryClientProvider` calls `client.mount()` on mount, so this sees every client a test renders.
QueryClient.prototype.mount = function mount() {
  mountedQueryClients.add(this);
  return mountQueryClient.call(this);
};

afterEach(async () => {
  await unmountRendered();
  for (const client of mountedQueryClients) {
    await client.cancelQueries();
    client.clear();
  }
  mountedQueryClients.clear();
  await new Promise((resolve) => realSetTimeout(resolve, 0));
});

// iOS's Modal calls `onDismiss` once it has finished sliding away; the preset's mock never calls it. This one
// calls it when an iOS Modal is hidden (Android has no `onDismiss`). A test that needs to see what happens
// while the sheet is still sliding away sets `modalDismissals.hold = true` and later calls `flush()`.
global.modalDismissals = {
  hold: false,
  pending: [],
  flush() {
    for (const dismissed of this.pending.splice(0)) dismissed();
  },
};
afterEach(() => {
  global.modalDismissals.hold = false;
  global.modalDismissals.pending = [];
});
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const PresetModal = jest.requireActual('@react-native/jest-preset/jest/mocks/Modal').default;
  return {
    __esModule: true,
    default: class Modal extends PresetModal {
      componentDidUpdate(previous) {
        super.componentDidUpdate?.(previous);
        if (previous.visible === false || this.props.visible !== false || !this.props.onDismiss) return;
        if (require('react-native').Platform.OS !== 'ios') return;
        if (global.modalDismissals.hold) global.modalDismissals.pending.push(this.props.onDismiss);
        else this.props.onDismiss();
      }
    },
  };
});

// expo-location is native. Shopping's store search reads it (StorePages.tsx); suites that exercise it mock it again.
jest.mock('expo-location', () => ({
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'denied', canAskAgain: false })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 0, longitude: 0 } })),
  reverseGeocodeAsync: jest.fn(async () => []),
}));
