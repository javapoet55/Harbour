import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import type { Profile } from '../api';
import { queryKeys } from '../query/keys';
import { useAppearance } from '../store/appearance';
import { useConsent } from '../store/consent';
import { useSession } from '../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

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
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    me: (...args: unknown[]) => mockMe(...args),
    updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
    updatePhoto: (...args: unknown[]) => mockUpdatePhoto(...args),
    syncCalendars: (...args: unknown[]) => mockSync(...args),
    deleteAccount: (...args: unknown[]) => mockDelete(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
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
  for (const mock of [mockPush, mockBack, mockMe, mockUpdateSettings, mockUpdatePhoto, mockSync, mockDelete, mockLogout, mockLaunchLibrary, mockOpenAuthSession, mockEncodePhoto]) {
    mock.mockReset();
  }
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

    expect(Linking.openURL).toHaveBeenCalledWith('https://harbour-production-f8a0.up.railway.app/inbox');
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
  it('dismisses the sheet before the session clears', async () => {
    const order: string[] = [];
    mockBack.mockImplementation(() => order.push('dismiss'));
    mockLogout.mockImplementation(async () => {
      order.push('logout');
      return { ok: true };
    });
    await show(<Account />);

    fireEvent.press(screen.getByTestId('account-sign-out'));
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    buttons[1].onPress?.();

    // Dismissed in the press itself, while the session — and so the navigator — is still there.
    expect(order).toEqual(['dismiss']);
    expect(useSession.getState().status).toBe('signedIn');

    await waitFor(() => expect(useSession.getState().status).toBe('signedOut'));
    expect(order).toEqual(['dismiss', 'logout']);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('closes back to the tab behind it', async () => {
    await show(<Account />);
    fireEvent.press(screen.getByTestId('account-close'));
    expect(mockBack).toHaveBeenCalled();
  });
});

/** `ProfileSettingsView` body (ProfileView.swift:146-270). */
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
    await waitFor(() => expect(screen.getByTestId('settings-push').props.value).toBe(false));
    fireEvent.changeText(screen.getByTestId('settings-name'), 'Ada L');
    await waitFor(() => expect(screen.getByTestId('settings-name').props.value).toBe('Ada L'));

    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('PATCHes the whole form once, on Save', async () => {
    mockUpdateSettings.mockResolvedValue({ ok: true });
    await show(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-push')).toBeTruthy());

    fireEvent(screen.getByTestId('settings-push'), 'valueChange', false);
    await waitFor(() => expect(screen.getByTestId('settings-push').props.value).toBe(false));
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
    it('opens the Google session at the start URL with the nexdo callback scheme', async () => {
      mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'nexdo://?calendar=connected' });
      mockMe.mockResolvedValue({ user: profile() });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-connect-google')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-connect-google'));

      await waitFor(() => expect(mockOpenAuthSession).toHaveBeenCalled());
      const [url, scheme] = mockOpenAuthSession.mock.calls[0] as [string, string];
      expect(url).toMatch(/\/api\/calendar\/oauth\/google\/start\?native=1$/);
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

    it('reports a dismissed session as cancelled', async () => {
      mockOpenAuthSession.mockResolvedValue({ type: 'dismiss' });
      await show(<Settings />);
      await waitFor(() => expect(screen.getByTestId('settings-connect-google')).toBeTruthy());

      fireEvent.press(screen.getByTestId('settings-connect-google'));

      await waitFor(() =>
        expect(screen.getByTestId('settings-failure')).toHaveTextContent('Google Calendar authorization was cancelled.'),
      );
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
  });
});
