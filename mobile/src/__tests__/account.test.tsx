import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Platform, StyleSheet } from 'react-native';

import type { Profile } from '../api';
import { deliverOAuthCallback, redirectOAuthCallback, resetOAuthCallbacks } from '../lib/oauthCallbacks';
import { queryKeys } from '../query/keys';
import { useAppearance } from '../store/appearance';
import { useConsent } from '../store/consent';
import { useFocus } from '../store/focus';
import { useLastSignedIn } from '../store/lastSignedIn';
import { useSession } from '../store/session';
import { palettes } from '../theme';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetOptions = jest.fn();
const mockSetParentOptions = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockCanDismiss = jest.fn(() => false);
const mockCanGoBack = jest.fn(() => false);
jest.mock('expo-router', () => {
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: {
      push: (...args: unknown[]) => mockPush(...args),
      replace: (...args: unknown[]) => mockReplace(...args),
      back: (...args: unknown[]) => mockBack(...args),
      dismissAll: () => mockDismissAll(),
      canDismiss: () => mockCanDismiss(),
      canGoBack: () => mockCanGoBack(),
    },
    useLocalSearchParams: () => ({}),
    useNavigation: () => ({ setOptions: mockSetOptions, getParent: () => ({ setOptions: mockSetParentOptions }) }),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    Stack: { Screen: () => null },
  };
});

const mockLaunchLibrary = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
}));

const mockOpenAuthSession = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));

// `getApiUrl()` reads `Constants.expoConfig.extra.apiUrl`, which jest-expo does not populate; the
// Google start URL is built from it (ios/App/ProfileView.swift:11 hardcodes the production origin).
jest.mock('../config', () => ({ getApiUrl: () => 'https://api.example.com' }));

const mockEncodePhoto = jest.fn();
jest.mock('../photo/encodePhoto', () => ({
  encodeProfilePhoto: (...args: unknown[]) => mockEncodePhoto(...args),
}));

const mockMe = jest.fn();
const mockUpdateSettings = jest.fn();
const mockUpdatePhoto = jest.fn();
const mockSync = jest.fn();
const mockDelete = jest.fn();
const mockLogout = jest.fn();
const mockConnections = jest.fn();
const mockSetWrites = jest.fn();
const mockDisconnect = jest.fn();
const mockConnectToken = jest.fn();
const mockVoiceUsage = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    me: (...args: unknown[]) => mockMe(...args),
    updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
    updatePhoto: (...args: unknown[]) => mockUpdatePhoto(...args),
    syncCalendars: (...args: unknown[]) => mockSync(...args),
    deleteAccount: (...args: unknown[]) => mockDelete(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
    calendarConnections: (...args: unknown[]) => mockConnections(...args),
    setCalendarWrites: (...args: unknown[]) => mockSetWrites(...args),
    disconnectCalendar: (...args: unknown[]) => mockDisconnect(...args),
    calendarConnectToken: (...args: unknown[]) => mockConnectToken(...args),
    voiceUsage: (...args: unknown[]) => mockVoiceUsage(...args),
  },
}));

import Account from '../../app/account/index';
import Settings from '../../app/account/settings';

const PREFERENCES = {
  workStart: '09:00',
  workEnd: '17:00',
  quietStart: '21:00',
  quietEnd: '07:00',
  confirmationLevel: 'CHANGES_AND_DELETES',
  voiceEnabled: true,
  personalizationEnabled: false,
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  morningSummary: true,
  eveningSummary: true,
  phoneNumber: null,
};

/** The demo account's receipt in `account-voice-usage`: 8.2 min of 100 used in September. */
const SEPTEMBER = { month: '2026-09', usedSeconds: 492, limitMinutes: 100, remainingSeconds: 5508, asOf: '2026-09-21T10:00:00.000Z' };

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    timeZone: 'Asia/Kolkata',
    photo: null,
    preference: PREFERENCES,
    nextAction: { enabled: true, switchingThreshold: 10 },
    ...overrides,
  };
}

function show(node: React.ReactElement, seed: Profile | null = profile()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(queryKeys.me(), seed);
  // The seeded `me` query is stale on mount, so React Query refetches it straight away. Answering
  // with the same profile keeps the screen from flickering back to the default fixture mid-test.
  if (seed) mockMe.mockResolvedValue({ user: seed });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  mockCanDismiss.mockReset().mockReturnValue(false);
  mockCanGoBack.mockReset().mockReturnValue(false);
  for (const mock of [mockReplace, mockDismissAll, mockPush, mockBack, mockMe, mockUpdateSettings, mockUpdatePhoto, mockSync, mockDelete, mockLogout, mockLaunchLibrary, mockOpenAuthSession, mockEncodePhoto, mockConnections, mockSetWrites, mockDisconnect, mockConnectToken, mockSetOptions, mockSetParentOptions, mockVoiceUsage]) {
    mock.mockReset();
  }
  mockConnections.mockResolvedValue({ connections: [] });
  mockConnectToken.mockResolvedValue({ token: 'one-time-token' });
  mockVoiceUsage.mockResolvedValue(SEPTEMBER);
  mockMe.mockResolvedValue({ user: profile() });
  useSession.setState({ status: 'signedIn', profile: profile() });
  useConsent.setState({ ai: false, voice: false });
  useAppearance.setState({ appearance: 'system', voiceVolume: 1 });
  // `spyOn` reuses one mock across the file, so its call history has to be cleared per test.
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined).mockClear();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true).mockClear();
});

/** `AccountView` body (ios/App/ProfileView.swift:65-99). */
describe('the Account sheet', () => {
  it('renders the header, the menu rows in Swift order, and Sign out', async () => {
    await show(<Account />);

    expect(screen.getByText('My Page')).toBeTruthy();
    expect(screen.getByTestId('account-name')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByTestId('account-email')).toHaveTextContent('ada@example.com');
    expect(screen.getByText('Edit profile and settings')).toBeTruthy();
    expect(screen.getByText('Inbox')).toBeTruthy();
    expect(screen.getByText('Waiting For')).toBeTruthy();
    expect(screen.getByText('AI Planner')).toBeTruthy();
    expect(screen.getByText('Insights')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  /** A guard against inventing sections Swift does not have. */
  it('has no controls Swift keeps on the Settings screen', async () => {
    await show(<Account />);

    expect(screen.queryByText('Delete account')).toBeNull();
    expect(screen.queryByText('Appearance')).toBeNull();
    expect(screen.queryByText('Connect Google Calendar')).toBeNull();
  });

  it('falls back to "Your profile" before the profile arrives', async () => {
    // Hold `me` in flight. The shared `beforeEach` answers it with Ada's profile, and whether that
    // answer's notification (React Query's `setTimeout(0)`) landed before this assertion was a race.
    mockMe.mockReturnValue(new Promise(() => undefined));
    await show(<Account />, null);
    expect(screen.getByTestId('account-name')).toHaveTextContent('Your profile');
  });

  it('opens Settings from the standalone row', async () => {
    await show(<Account />);

    fireEvent.press(screen.getByTestId('account-edit-profile'));

    expect(mockPush).toHaveBeenCalledWith('/account/settings');
  });

  it('opens Settings from the menu card', async () => {
    await show(<Account />);

    fireEvent.press(screen.getByTestId('account-settings'));

    expect(mockPush).toHaveBeenCalledWith('/account/settings');
  });

  it('opens each web row in the browser at the production origin', async () => {
    await show(<Account />);

    fireEvent.press(screen.getByTestId('account-inbox'));

    expect(Linking.openURL).toHaveBeenCalledWith('https://app.nexdoapp.com/inbox');
  });

  /** `.confirmationDialog("Sign out of Nexdo?", …)` (ProfileView.swift:96-98). */
  it('confirms before signing out, and signs out on confirmation', async () => {
    mockLogout.mockResolvedValue({ ok: true });
    await show(<Account />);

    fireEvent.press(screen.getByTestId('account-sign-out'));

    expect(Alert.alert).toHaveBeenCalledWith('Sign out of Nexdo?', undefined, expect.any(Array));
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Sign out']);

    buttons[1].onPress?.();
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    await waitFor(() => expect(useSession.getState().status).toBe('signedOut'));
  });

  /**
   * The regression: the session gate (app/_layout.tsx) unmounts the navigator that owns this modal
   * as soon as the store reaches `signedOut`, so the sheet has to be dismissed BEFORE the session
   * clears. Dismissing after it leaves the sheet on screen and logs "GO_BACK was not handled by any
   * navigator". Swift dismisses after `logout()` (ProfileView.swift:99) because its sheet outlives
   * the presenter; the visible result — the sheet gone, sign-in behind it — is the same.
   */
  /**
   * Expo Router dispatches navigation a render late, and the session gate removes this sheet's
   * navigator in the render that ends the session. So the sheet is closed BEFORE the session clears,
   * only because there is something to close, and Sign in then replaces the stack.
   */
  it('closes the sheet while its navigator exists, then ends the session and replaces with Sign in', async () => {
    const order: string[] = [];
    mockCanGoBack.mockReturnValue(true);
    mockBack.mockImplementation(() => {
      order.push(`back while ${useSession.getState().status}`);
      mockCanGoBack.mockReturnValue(false);
    });
    mockLogout.mockImplementation(async () => {
      order.push('logout');
      return { ok: true };
    });
    mockReplace.mockImplementation((href: string) => order.push(`replace ${href} while ${useSession.getState().status}`));
    await show(<Account />);

    fireEvent.press(screen.getByTestId('account-sign-out'));
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    buttons[1].onPress?.();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/sign-in'));
    expect(order).toEqual(['logout', 'back while signedIn', 'replace /sign-in while signedOut']);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockDismissAll).not.toHaveBeenCalled();
  });

  /** The POP_TO_TOP LogBox: nothing is ever dispatched to a stack with nothing to pop. */
  it('sends no dismissal or back when there is nothing to close — only the Sign in replace', async () => {
    mockCanDismiss.mockReturnValue(false);
    mockCanGoBack.mockReturnValue(false);
    mockLogout.mockResolvedValue({ ok: true });
    await show(<Account />);

    fireEvent.press(screen.getByTestId('account-sign-out'));
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    buttons[1].onPress?.();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/sign-in'));
    expect(useSession.getState().status).toBe('signedOut');
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('closes back to the tab behind it', async () => {
    await show(<Account />);
    fireEvent.press(screen.getByTestId('account-close'));
    expect(mockBack).toHaveBeenCalled();
  });
});

/** `ProfileSettingsView` body (ProfileView.swift:146-270). */
/** `voiceUsageCard` (ios/App/ProfileView.swift:101-144), placed at `:77`. */
describe('the Real-time Voice card', () => {
  it('asks for this month’s usage on open and shows the captured receipt', async () => {
    await show(<Account />);

    await waitFor(() => expect(screen.getByTestId('voice-usage-total')).toHaveTextContent('8.2 min'));
    expect(mockVoiceUsage).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Real-time Voice')).toBeTruthy();
    expect(screen.getByText('Monthly usage')).toBeTruthy();
    expect(screen.getByText('8.2 min used')).toBeTruthy();
    expect(screen.getByText('92 min remaining')).toBeTruthy();
    expect(screen.getByText('September · updated today')).toBeTruthy();
    expect(screen.getByText('100 min / month')).toBeTruthy();
    const bar = screen.getByTestId('voice-usage-bar');
    expect(bar.props.accessibilityLabel).toBe('Real-time voice usage');
    expect(bar.props.accessibilityValue).toEqual({ text: '8.2 min used out of 100 minutes this month' });
    expect(screen.getByTestId('voice-usage-fill')).toHaveStyle({ flex: 0.082 });
  });

  it('sits between the profile header and "Edit profile and settings"', async () => {
    await show(<Account />);
    const json = JSON.stringify(screen.toJSON());
    const at = (needle: string) => json.indexOf(needle);
    expect(at('account-email')).toBeLessThan(at('account-voice-usage'));
    expect(at('account-voice-usage')).toBeLessThan(at('account-edit-profile'));
  });

  it('shows the zero state before (or without) an answer', async () => {
    mockVoiceUsage.mockReturnValue(new Promise(() => undefined));
    await show(<Account />);

    expect(screen.getByTestId('voice-usage-total')).toHaveTextContent('0 min');
    expect(screen.getByText('0 min used')).toBeTruthy();
    expect(screen.getByText('100 min remaining')).toBeTruthy();
    expect(screen.getByText('This month · updated today')).toBeTruthy();
    expect(screen.getByTestId('voice-usage-fill')).toHaveStyle({ flex: 0 });
  });

  it('keeps the zero state when the request fails', async () => {
    mockVoiceUsage.mockRejectedValue(new Error('offline'));
    await show(<Account />);
    await waitFor(() => expect(mockVoiceUsage).toHaveBeenCalled());
    expect(screen.getByText('This month · updated today')).toBeTruthy();
  });
});

describe('the Settings screen', () => {
  it('renders every card in body order', async () => {
    await show(<Settings />);

    await waitFor(() => expect(screen.getByTestId('settings-profile-time')).toBeTruthy());
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('App Voice')).toBeTruthy();
    expect(screen.getByText('Profile picture')).toBeTruthy();
    expect(screen.getByText('Profile and time')).toBeTruthy();
    expect(screen.getByText('Voice and confirmation')).toBeTruthy();
    expect(screen.getByText('Notifications and focus')).toBeTruthy();
    expect(screen.getByText('Calendars and privacy')).toBeTruthy();
    expect(screen.getByText('Save settings')).toBeTruthy();
  });

  /**
   * The guard against invented sections. None of these is anywhere in `body`, even though the
   * server's preference schema and `ProfilePreferences` carry the underlying fields.
   */
  it('has no email field, no duration, no reminder minutes, no SMS toggle and no phone field', async () => {
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-profile-time')).toBeTruthy());

    // Exact control labels, not loose matches: "reminder outcomes" is real copy in the
    // Personalized predictions caption (ProfileView.swift:207).
    for (const label of [
      'Email',
      'Email address',
      'Default duration',
      'Default reminder',
      'Reminder minutes',
      'SMS notifications',
      'Phone number',
      'Version',
      'Privacy Policy',
      'Terms of Service',
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    // "Email notifications" IS in Swift; an editable email field is not.
    expect(screen.getByText('Email notifications')).toBeTruthy();
  });

  it('shows the DEVICE time zone as a read-only value', async () => {
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-time-zone')).toBeTruthy());
    expect(screen.getByText('Time zone (Automatic)')).toBeTruthy();
  });

  it('seeds the form from the profile', async () => {
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-name')).toBeTruthy());

    expect(screen.getByTestId('settings-name').props.value).toBe('Ada Lovelace');
    expect(screen.getByTestId('working-hours-start')).toHaveTextContent('09:00');
    expect(screen.getByTestId('working-hours-end')).toHaveTextContent('17:00');
    expect(screen.getByTestId('quiet-hours-start')).toHaveTextContent('21:00');
  });

  it('offers a Retry when the profile has no preference row', async () => {
    await show(<Settings />, profile({ preference: null }));
    await waitFor(() => expect(screen.getByTestId('settings-retry')).toBeTruthy());
    expect(screen.getByText('Retry loading settings')).toBeTruthy();
  });

  /** Nothing is written until Save; Swift edits `@State` only (ProfileView.swift:132-134). */
  it('does not PATCH while a control is being changed', async () => {
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-push')).toBeTruthy());

    fireEvent(screen.getByTestId('settings-push'), 'valueChange', false);
    await waitFor(() => expect(screen.getByTestId('settings-push').props.accessibilityState).toMatchObject({ checked: false }));
    fireEvent.changeText(screen.getByTestId('settings-name'), 'Ada L');
    await waitFor(() => expect(screen.getByTestId('settings-name').props.value).toBe('Ada L'));

    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('PATCHes the whole form once, on Save', async () => {
    mockUpdateSettings.mockResolvedValue({ ok: true });
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-push')).toBeTruthy());

    fireEvent(screen.getByTestId('settings-push'), 'valueChange', false);
    await waitFor(() => expect(screen.getByTestId('settings-push').props.accessibilityState).toMatchObject({ checked: false }));
    fireEvent.press(screen.getByTestId('settings-save'));

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledTimes(1));
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      timeZone: expect.any(String),
      preference: { ...PREFERENCES, pushEnabled: false },
      nextAction: { enabled: true, switchingThreshold: 10 },
    });
    await waitFor(() => expect(screen.getByTestId('settings-message')).toHaveTextContent('Settings saved.'));
  });

  it('refuses to save an empty name and reports Swift’s message', async () => {
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-name')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('settings-name'), '   ');
    await waitFor(() => expect(screen.getByTestId('settings-name').props.value).toBe('   '));
    fireEvent.press(screen.getByTestId('settings-save'));

    await waitFor(() => expect(screen.getByTestId('settings-failure')).toHaveTextContent('Enter a display name of 1–80 characters.'));
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  /** `saveAndDismiss()` (ProfileView.swift:322-337). */
  it('saves before going back, and stays put when validation fails', async () => {
    mockUpdateSettings.mockResolvedValue({ ok: true });
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-name')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('settings-name'), '');
    await waitFor(() => expect(screen.getByTestId('settings-name').props.value).toBe(''));
    fireEvent.press(screen.getByTestId('settings-back'));
    await waitFor(() => expect(screen.getByTestId('settings-failure')).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('settings-name'), 'Ada Lovelace');
    await waitFor(() => expect(screen.getByTestId('settings-name').props.value).toBe('Ada Lovelace'));
    fireEvent.press(screen.getByTestId('settings-back'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
  });

  /** Appearance is device-local and applies immediately (`@AppStorage`, ProfileView.swift:127). */
  it('stores Appearance on the device without a request', async () => {
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('appearance-night')).toBeTruthy());

    fireEvent.press(screen.getByTestId('appearance-night'));

    await waitFor(() => expect(useAppearance.getState().appearance).toBe('night'));
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('shows the App Voice volume as a percentage', async () => {
    useAppearance.setState({ appearance: 'system', voiceVolume: 0.5 });
    await show(<Settings />);
    expect(screen.getByTestId('voice-volume-value')).toHaveTextContent('50%');
  });

  /** `.onChange(of: selectedPhoto)` (ProfileView.swift:261-271). */
  describe('the profile photo', () => {
    it('encodes the picked image and PATCHes it', async () => {
      const encoded = 'data:image/jpeg;base64,YWJj';
      mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://a.heic', width: 3000, height: 4000 }] });
      mockEncodePhoto.mockResolvedValue(encoded);
      mockUpdatePhoto.mockResolvedValue({ ok: true, profile: { id: 'u1', photo: encoded } });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-change-photo')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-change-photo'));

      await waitFor(() => expect(mockUpdatePhoto).toHaveBeenCalledWith(encoded));
      expect(mockEncodePhoto).toHaveBeenCalledWith('file://a.heic', 3000, 4000);
      await waitFor(() => expect(screen.getByTestId('settings-photo-message')).toHaveTextContent('Profile picture saved.'));
    });

    it('sends nothing when the picker is cancelled', async () => {
      mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-change-photo')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-change-photo'));

      await waitFor(() => expect(mockLaunchLibrary).toHaveBeenCalled());
      expect(mockUpdatePhoto).not.toHaveBeenCalled();
    });

    it('hides Remove photo when there is no photo', async () => {
      await show(<Settings />);

      await waitFor(() => expect(screen.getByTestId('settings-change-photo')).toBeTruthy());
      expect(screen.queryByTestId('settings-remove-photo')).toBeNull();
    });

    it('offers Remove photo when there is one', async () => {
      await show(<Settings />, profile({ photo: 'data:image/jpeg;base64,YWJj' }));

      await waitFor(() => expect(screen.getByTestId('settings-remove-photo')).toBeTruthy());
      expect(screen.getByTestId('account-photo')).toBeTruthy();
    });
  });

  /** "Calendars and privacy" (ProfileView.swift:223-244). */
  describe('calendars and privacy', () => {
    it('fetches a connect token FIRST, then opens the start URL carrying it (3a26c52)', async () => {
      mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'nexdo://calendar-connected?calendar=google-connected' });
      mockMe.mockResolvedValue({ user: profile() });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-connect-google')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-connect-google'));

      await waitFor(() => expect(mockOpenAuthSession).toHaveBeenCalled());
      expect(mockConnectToken).toHaveBeenCalledWith('google');
      expect(mockConnectToken.mock.invocationCallOrder[0]).toBeLessThan(mockOpenAuthSession.mock.invocationCallOrder[0]);
      const [url, scheme] = mockOpenAuthSession.mock.calls[0] as [string, string];
      expect(url).toBe('https://api.example.com/api/calendar/oauth/google/start?native=1&connect_token=one-time-token');
      expect(scheme).toBe('nexdo://');
      await waitFor(() =>
        expect(screen.getByTestId('settings-message')).toHaveTextContent('Google Calendar connected and synchronized.'),
      );
    });

    it('reports a callback that carries a detail as a failure', async () => {
      mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'nexdo://?calendar=error&detail=token%20expired' });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-connect-google')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-connect-google'));

      await waitFor(() =>
        expect(screen.getByTestId('settings-failure')).toHaveTextContent('Google Calendar connection failed: token expired'),
      );
    });

    it('reports a closed browser with Swift’s cancelled-login message (the error-cancelled capture)', async () => {
      mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-connect-google')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-connect-google'));

      await waitFor(() =>
        expect(screen.getByTestId('settings-failure')).toHaveTextContent(
          'Google Calendar connection failed: sign-in was cancelled or blocked. If Google showed “OAuth client was disabled”, enable that Web client in Google Cloud Console → APIs & Services → Credentials, and keep the redirect URI https://app.nexdoapp.com/api/calendar/oauth/google/callback.',
        ),
      );
      expect(Alert.alert).toHaveBeenCalledWith('Could not update profile', expect.stringContaining('sign-in was cancelled or blocked'), expect.any(Array));
    });

    // Android's `openAuthSessionAsync` polyfill reports `dismiss` as the app turns active, which can
    // be a moment before the `nexdo://calendar-connected` deep link lands (src/lib/oauthCallbacks.ts).
    it('still connects when the session comes back dismissed and the callback link lands after it', async () => {
      resetOAuthCallbacks();
      let redirected: string | null = 'unset';
      mockOpenAuthSession.mockImplementation(async () => {
        setTimeout(() => {
          redirected = redirectOAuthCallback('nexdo://calendar-connected?calendar=google-connected');
        }, 50);
        return { type: 'dismiss' };
      });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-connect-google')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-connect-google'));

      await waitFor(() =>
        expect(screen.getByTestId('settings-message')).toHaveTextContent('Google Calendar connected and synchronized.'),
      );
      // The router was told to stay put: no "Unmatched Route".
      expect(redirected).toBeNull();
    });

    it('handles a callback link that arrives with no session open, with Swift’s messages', async () => {
      resetOAuthCallbacks();
      deliverOAuthCallback('calendar', 'nexdo://calendar-connected?calendar=google-connected');
      await show(<Settings />);

      await waitFor(() =>
        expect(screen.getByTestId('settings-message')).toHaveTextContent('Google Calendar connected and synchronized.'),
      );
      expect(mockMe).toHaveBeenCalled();
      expect(mockOpenAuthSession).not.toHaveBeenCalled();
    });

    it('reports an error callback link that arrives with no session open', async () => {
      resetOAuthCallbacks();
      deliverOAuthCallback('calendar', 'nexdo://calendar-connected?calendar=error&detail=Authorization+was+cancelled');
      await show(<Settings />);

      await waitFor(() =>
        expect(screen.getByTestId('settings-failure')).toHaveTextContent('Google Calendar connection failed: Authorization was cancelled'),
      );
    });

    it('never opens the browser when the connect token cannot be issued', async () => {
      mockConnectToken.mockResolvedValue({ token: '' });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-connect-google')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-connect-google'));

      await waitFor(() =>
        expect(screen.getByTestId('settings-failure')).toHaveTextContent('Nexdo could not start the calendar connection. Please try again.'),
      );
      expect(mockOpenAuthSession).not.toHaveBeenCalled();
    });

    it('surfaces the API’s own message when the token request fails', async () => {
      mockConnectToken.mockRejectedValue(new Error('Sign in required'));
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-connect-google')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-connect-google'));

      await waitFor(() => expect(screen.getByTestId('settings-failure')).toHaveTextContent('Sign in required'));
      expect(mockOpenAuthSession).not.toHaveBeenCalled();
    });

    it('shows Connecting…, blocks the screen and the sheet, and never shows Saving… while connecting', async () => {
      let finish: (value: unknown) => void = () => undefined;
      mockOpenAuthSession.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-connect-google')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-connect-google'));

      await waitFor(() => expect(screen.getByTestId('settings-connect-label')).toHaveTextContent('Connecting…'));
      expect(screen.getByTestId('settings-column').props.pointerEvents).toBe('none');
      expect(screen.getByTestId('settings-back').props.accessibilityState).toMatchObject({ disabled: true });
      expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
      expect(mockSetParentOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
      expect(screen.getByText('Save settings')).toBeTruthy();
      expect(screen.queryByText('Saving…')).toBeNull();

      finish({ type: 'cancel' });
      await waitFor(() => expect(screen.getByTestId('settings-connect-label')).toHaveTextContent('Connect Google Calendar'));
      expect(screen.getByTestId('settings-column').props.pointerEvents).toBe('auto');
      expect(mockSetParentOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
    });

    it('synchronizes now and shows the server’s outcome', async () => {
      mockSync.mockResolvedValue({ results: [{ error: null }] });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-sync-now')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-sync-now'));

      await waitFor(() => expect(screen.getByTestId('settings-message')).toHaveTextContent('Calendars synchronized.'));
    });

    it('reports sharing as off, with no withdraw button', async () => {
      await show(<Settings />);

      await waitFor(() => expect(screen.getByTestId('settings-consent-state')).toBeTruthy());
      expect(screen.getByTestId('settings-consent-state')).toHaveTextContent('OpenAI sharing is off.');
      expect(screen.queryByTestId('settings-withdraw-consent')).toBeNull();
    });

    it('offers Withdraw AI permission while sharing is on, and withdraws locally', async () => {
      useConsent.setState({ ai: true, voice: false });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-withdraw-consent')).toBeTruthy());
      expect(screen.getByTestId('settings-consent-state')).toHaveTextContent('OpenAI sharing is allowed for this session.');

      fireEvent.press(screen.getByTestId('settings-withdraw-consent'));

      await waitFor(() => expect(useConsent.getState().ai).toBe(false));
      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    /** `.confirmationDialog("Permanently delete this account?", …)` (ProfileView.swift:267-269). */
    it('confirms with Swift’s exact copy before deleting the account', async () => {
      mockDelete.mockResolvedValue({ ok: true });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-delete-account')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-delete-account'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Permanently delete this account?',
        'This removes your Nexdo data permanently and cannot be undone.',
        expect.any(Array),
      );
      const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
      expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Delete account']);

      buttons[1].onPress?.();
      await waitFor(() => expect(mockDelete).toHaveBeenCalled());
      await waitFor(() => expect(useSession.getState().status).toBe('signedOut'));
    });

    /**
     * The Android bug: after a successful delete the app stayed on the profile screen, and Back or Sign
     * out then threw GO_BACK. `deleteAccount()` → `reset()` (NexdoApp.swift:781-803) lands on Sign in.
     */
    it('after a successful delete, forgets the account and replaces the stack with Sign in', async () => {
      const router = { replace: mockReplace };
      // Settings is pushed in the Account sheet: it pops to the sheet, then the sheet closes, both
      // while the session (and so the navigators) still exist.
      const order: string[] = [];
      mockCanDismiss.mockReturnValue(true);
      mockDismissAll.mockImplementation(() => {
        order.push(`dismissAll while ${useSession.getState().status}`);
        mockCanDismiss.mockReturnValue(false);
        mockCanGoBack.mockReturnValue(true);
      });
      mockBack.mockImplementation(() => {
        order.push(`back while ${useSession.getState().status}`);
        mockCanGoBack.mockReturnValue(false);
      });
      mockDelete.mockResolvedValue({ ok: true });
      useLastSignedIn.setState({ value: 'Ada' });
      useConsent.setState({ ai: true, voice: true });
      const clearFocus = jest.spyOn(useFocus.getState(), 'clear');
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-delete-account')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-delete-account'));
      const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
      buttons[1].onPress?.();

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
      expect(useSession.getState()).toMatchObject({ status: 'signedOut', profile: null });
      // Sign in must not greet the deleted account by name.
      expect(useLastSignedIn.getState().value).toBeNull();
      expect(useConsent.getState()).toMatchObject({ ai: false, voice: false });
      expect(clearFocus).toHaveBeenCalled();
      // Closed while signed in; nothing sent once the session — and the stacks — are gone.
      expect(order).toEqual(['dismissAll while signedIn', 'back while signedIn']);
    });

    it('when the delete fails, says why and stays put, still signed in', async () => {
      const router = { replace: mockReplace };
      mockCanDismiss.mockReturnValue(true);
      mockDelete.mockRejectedValue(new Error('A wish is being submitted. Wait for its status before deleting your account.'));
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-delete-account')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-delete-account'));
      const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
      buttons[1].onPress?.();

      // `model.error`'s alert (RootView.swift:76-78).
      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          'Unable to complete request',
          'A wish is being submitted. Wait for its status before deleting your account.',
          [{ text: 'OK' }],
        ),
      );
      expect(useSession.getState().status).toBe('signedIn');
      expect(router.replace).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockDismissAll).not.toHaveBeenCalled();
    });
  });
});

/**
 * The connected-calendar list (ProfileView.swift:290-331, commit 3ef906d). No capture exists — the
 * demo account has no connected calendar — so these assert the Swift source.
 */
describe('calendar connections', () => {
  const GOOGLE = {
    id: 'c1',
    provider: 'google',
    accountEmail: 'ada@example.com',
    calendarName: 'Work',
    status: 'connected',
    lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    writeEnabled: false,
  };

  it('says "No calendars connected yet." once an empty list has loaded', async () => {
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-no-calendars')).toHaveTextContent('No calendars connected yet.'));
    expect(screen.getByTestId('settings-connect-label')).toHaveTextContent('Connect Google Calendar');
  });

  it('treats a failed load as an empty list, as Swift does', async () => {
    mockConnections.mockRejectedValue(new Error('offline'));
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-no-calendars')).toBeTruthy());
    expect(screen.queryByTestId('settings-failure')).toBeNull();
  });

  it('lists each connection with its name, detail and last sync, and relabels the button', async () => {
    mockConnections.mockResolvedValue({ connections: [GOOGLE] });
    await show(<Settings />);

    await waitFor(() => expect(screen.getByTestId('settings-connection-c1')).toBeTruthy());
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('Google Calendar · ada@example.com')).toBeTruthy();
    expect(screen.getByText('Synchronized 5 minutes ago')).toBeTruthy();
    expect(screen.getByTestId('settings-connect-label')).toHaveTextContent('Connect another calendar');
    expect(screen.queryByTestId('settings-no-calendars')).toBeNull();
  });

  it('names an unhealthy status in the detail', async () => {
    mockConnections.mockResolvedValue({ connections: [{ ...GOOGLE, status: 'ERROR', calendarName: null }] });
    await show(<Settings />);
    // With no calendar name, the account is the name, so it is not repeated in the detail.
    await waitFor(() => expect(screen.getByText('Google Calendar · Error')).toBeTruthy());
    expect(screen.getByText('ada@example.com')).toBeTruthy();
  });

  it('shows the read-only caption only while writes are off', async () => {
    mockConnections.mockResolvedValue({ connections: [GOOGLE, { ...GOOGLE, id: 'c2', writeEnabled: true }] });
    await show(<Settings />);

    await waitFor(() => expect(screen.getByTestId('settings-read-only-c1')).toBeTruthy());
    expect(screen.getByTestId('settings-read-only-c1')).toHaveTextContent(
      'Read-only: events come into Nexdo, but tasks and events you create in Nexdo are not added to this calendar.',
    );
    expect(screen.queryByTestId('settings-read-only-c2')).toBeNull();
  });

  it('turns writes on with PATCH { id, writeEnabled }, reloads the list and says so', async () => {
    mockConnections.mockResolvedValue({ connections: [GOOGLE] });
    mockSetWrites.mockResolvedValue({ ok: true });
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-writes-c1')).toBeTruthy());
    const loads = mockConnections.mock.calls.length;

    fireEvent(screen.getByTestId('settings-writes-c1'), 'valueChange', true);

    await waitFor(() => expect(mockSetWrites).toHaveBeenCalledWith('c1', true));
    await waitFor(() =>
      expect(screen.getByTestId('settings-message')).toHaveTextContent('Nexdo can now add your scheduled tasks and events to this calendar.'),
    );
    expect(mockConnections.mock.calls.length).toBeGreaterThan(loads);
  });

  it('turns writes off with Swift’s message', async () => {
    mockConnections.mockResolvedValue({ connections: [{ ...GOOGLE, writeEnabled: true }] });
    mockSetWrites.mockResolvedValue({ ok: true });
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-writes-c1')).toBeTruthy());

    fireEvent(screen.getByTestId('settings-writes-c1'), 'valueChange', false);

    await waitFor(() => expect(screen.getByTestId('settings-message')).toHaveTextContent('Nexdo will no longer add events to this calendar.'));
  });

  it('asks "Disconnect X?" with Disconnect and Keep it, and Keep it does nothing', async () => {
    mockConnections.mockResolvedValue({ connections: [GOOGLE] });
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-disconnect-c1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('settings-disconnect-c1'));

    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string, { text: string; style: string; onPress?: () => void }[]];
    expect(title).toBe('Disconnect Work?');
    expect(body).toBe('Events imported from this calendar are removed with the connection.');
    expect(buttons.map((button) => [button.text, button.style])).toEqual([
      ['Disconnect', 'destructive'],
      ['Keep it', 'cancel'],
    ]);
    buttons[1].onPress?.();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('Disconnect sends DELETE ?id= and reports it', async () => {
    mockConnections.mockResolvedValue({ connections: [GOOGLE] });
    mockDisconnect.mockResolvedValue({ ok: true });
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-disconnect-c1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('settings-disconnect-c1'));
    mockConnections.mockResolvedValue({ connections: [] });
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Disconnect')?.onPress?.();

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith('c1'));
    await waitFor(() =>
      expect(screen.getByTestId('settings-message')).toHaveTextContent('Calendar disconnected. Imported events were removed with the connection.'),
    );
    await waitFor(() => expect(screen.getByTestId('settings-no-calendars')).toBeTruthy());
  });

  it('shows a failed disconnect in the profile alert', async () => {
    mockConnections.mockResolvedValue({ connections: [GOOGLE] });
    mockDisconnect.mockRejectedValue(new Error('Not found'));
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-disconnect-c1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('settings-disconnect-c1'));
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Disconnect')?.onPress?.();

    await waitFor(() => expect(screen.getByTestId('settings-failure')).toHaveTextContent('Not found'));
  });
});

/**
 * docs/android-polish.md §5: Settings on Android. Tests render in the light scheme; Settings is an
 * elevated sheet, so a card is the elevated `fieldSurface` and a field in it `fieldOnGroupElevated`.
 */
describe('the Settings screen on Android', () => {
  const light = palettes.light;
  const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
  const textStyle = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);

  afterEach(() => jest.restoreAllMocks());

  async function showAndroid() {
    jest.replaceProperty(Platform, 'OS', 'android');
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-notifications')).toBeTruthy());
  }

  it('keeps a picker row’s label at 40% of the row and ellipsises the value instead', async () => {
    await showAndroid();
    for (const [label, value] of [
      ['AI confirmation', 'settings-confirmation-value'],
      ['Protect my current focus', 'settings-switching-threshold-value'],
    ]) {
      expect(textStyle(label)).toMatchObject({ flex: 1, flexShrink: 1, minWidth: '40%' });
      expect(screen.getByTestId(value).props.numberOfLines).toBe(1);
      expect(flat(value)).toMatchObject({ flexShrink: 1 });
    }
    // The text is unchanged.
    expect(screen.getByText('Confirm changes and deletions')).toBeTruthy();
    expect(screen.getByText('Balanced')).toBeTruthy();
    // The read-only time zone row gets the same room rules.
    expect(textStyle('Time zone (Automatic)')).toMatchObject({ minWidth: '40%' });
  });

  it('draws every card as a form group, with a separator between adjacent rows only', async () => {
    await showAndroid();
    for (const card of ['settings-appearance', 'settings-profile-time', 'settings-voice', 'settings-notifications', 'settings-calendars']) {
      expect(flat(card)).toMatchObject({ backgroundColor: light.fieldSurfaceElevated, borderWidth: 1, borderColor: light.fieldBorder });
    }
    // Notifications: next action | focus picker, then push | email | morning | evening.
    expect(screen.getAllByTestId('settings-notifications-separator')).toHaveLength(4);
    // Voice: confirmation | spoken replies; the existing divider already splits the next pair.
    expect(screen.getAllByTestId('settings-voice-separator')).toHaveLength(1);
    // Profile and time: its rows are fields, not list rows.
    expect(screen.queryByTestId('settings-profile-time-separator')).toBeNull();
    expect(flat('settings-voice-separator')).toMatchObject({ height: 1, backgroundColor: light.fieldBorder });
  });

  it('gives the name and the four time fields the field surface inside the card', async () => {
    await showAndroid();
    const field = { backgroundColor: light.fieldOnGroupElevated, borderWidth: 1, borderColor: light.fieldBorder, borderRadius: 12 };
    expect(flat('settings-name')).toMatchObject(field);
    for (const id of ['working-hours-start', 'working-hours-end', 'quiet-hours-start', 'quiet-hours-end']) {
      expect(flat(id)).toMatchObject({ ...field, minHeight: 40, paddingHorizontal: 12 });
    }
    fireEvent(screen.getByTestId('settings-name'), 'focus');
    await waitFor(() => expect(flat('settings-name')).toMatchObject({ borderColor: light.accent }));
    // The time zone is read-only, so it stays a row.
    expect(flat('settings-time-zone').borderWidth).toBeUndefined();
  });

  it('draws its links in the Ask blue in dark, and keeps Delete account red (§6)', async () => {
    useAppearance.setState({ appearance: 'night', voiceVolume: 1 });
    await showAndroid();
    const dark = palettes.dark;
    for (const link of ['Open Notification Center', 'Synchronize now', 'Change photo']) {
      expect(textStyle(link).color).toBe(dark.askBlue);
    }
    expect(textStyle('Delete account').color).toBe(dark.danger);
  });

  it('marks the selected appearance with the accent tint and accent text', async () => {
    await showAndroid();
    expect(flat('appearance-system')).toMatchObject({ backgroundColor: light.accentTint, borderColor: light.accentBorder });
    expect(textStyle('System')).toMatchObject({ color: light.accent });
    expect(flat('appearance-day').backgroundColor).toBeUndefined();
    expect(textStyle('Day').color).toBe(light.label);
  });
});

describe('the Settings screen on iOS', () => {
  const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

  it('keeps the Swift rows, cards and segments', async () => {
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-notifications')).toBeTruthy());
    expect(screen.queryByTestId('settings-notifications-separator')).toBeNull();
    expect(screen.getByTestId('settings-confirmation-value').props.numberOfLines).toBeUndefined();
    expect(flat('settings-notifications').borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(flat('appearance-system')).toMatchObject({ backgroundColor: palettes.light.segmentSelected });
    expect(flat('settings-name').borderRadius).toBe(12);
    expect(flat('settings-name').borderWidth).toBe(StyleSheet.hairlineWidth);
  });
});

