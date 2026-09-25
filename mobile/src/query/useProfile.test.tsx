import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';

import type { Profile } from '../api';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

const mockUpdateSettings = jest.fn();
const mockUpdatePhoto = jest.fn();
const mockMe = jest.fn();
const mockSync = jest.fn();
const mockDelete = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
    updatePhoto: (...args: unknown[]) => mockUpdatePhoto(...args),
    me: (...args: unknown[]) => mockMe(...args),
    syncCalendars: (...args: unknown[]) => mockSync(...args),
    deleteAccount: (...args: unknown[]) => mockDelete(...args),
  },
}));

const mockDeviceZone = jest.fn(() => 'Asia/Kolkata');
jest.mock('../lib/profileSettings', () => ({
  ...jest.requireActual('../lib/profileSettings'),
  deviceTimeZone: () => mockDeviceZone(),
}));

import {
  PHOTO_UNCONFIRMED,
  synchronizeDeviceTimeZone,
  useDeleteAccount,
  useSyncNow,
  useUpdateProfile,
  useUploadPhoto,
} from './useProfile';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    timeZone: 'Asia/Kolkata',
    photo: null,
    preference: null,
    nextAction: { enabled: false, switchingThreshold: 10 },
    ...overrides,
  };
}

function makeClient(seed: Profile | null = profile()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(queryKeys.me(), seed);
  return queryClient;
}

/**
 * Mounts a hook and flushes React 19's concurrent first commit, as the screen tests do.
 *
 * The probe also OBSERVES the `me` query without fetching it. With `gcTime: 0` an unobserved query is
 * collected the instant it is written, and these tests read the profile back out of the cache.
 */
async function harness<T>(queryClient: QueryClient, use: () => T) {
  const result: { current: T } = { current: null as unknown as T };
  function Probe() {
    useQuery({ queryKey: queryKeys.me(), enabled: false });
    result.current = use();
    return null;
  }
  await render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(result.current).toBeTruthy());
  return result;
}

beforeEach(() => {
  for (const mock of [mockUpdateSettings, mockUpdatePhoto, mockMe, mockSync, mockDelete]) mock.mockReset();
  mockDeviceZone.mockReturnValue('Asia/Kolkata');
  useSession.setState({ status: 'signedIn', profile: profile() });
});

/** `synchronizeDeviceTimeZone()` (ios/App/NexdoApp.swift:225-233). */
describe('the device time-zone rule', () => {
  it('sends NOTHING when the profile zone already equals the device zone', async () => {
    const queryClient = makeClient(profile({ timeZone: 'Asia/Kolkata' }));
    mockDeviceZone.mockReturnValue('Asia/Kolkata');

    await synchronizeDeviceTimeZone(queryClient);

    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(mockMe).not.toHaveBeenCalled();
  });

  it('PATCHes only the zone when they differ, then re-reads the profile', async () => {
    const queryClient = makeClient(profile({ timeZone: 'America/Los_Angeles' }));
    mockDeviceZone.mockReturnValue('Asia/Kolkata');
    mockUpdateSettings.mockResolvedValue({ ok: true });
    mockMe.mockResolvedValue({ user: profile({ timeZone: 'Asia/Kolkata' }) });

    await synchronizeDeviceTimeZone(queryClient);

    expect(mockUpdateSettings).toHaveBeenCalledWith({ timeZone: 'Asia/Kolkata' });
    expect(queryClient.getQueryData<Profile>(queryKeys.me())?.timeZone).toBe('Asia/Kolkata');
    expect(useSession.getState().profile?.timeZone).toBe('Asia/Kolkata');
  });

  it('does nothing at all when nobody is signed in', async () => {
    await synchronizeDeviceTimeZone(makeClient(null));
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  /** "guard … profile?.timeZone == deviceZone else { throw APIError.invalidResponse }" (`:232`). */
  it('throws when the server accepted the PATCH but did not persist the zone', async () => {
    const queryClient = makeClient(profile({ timeZone: 'America/Los_Angeles' }));
    mockUpdateSettings.mockResolvedValue({ ok: true });
    mockMe.mockResolvedValue({ user: profile({ timeZone: 'America/Los_Angeles' }) });

    await expect(synchronizeDeviceTimeZone(queryClient)).rejects.toThrow(/unexpected response/);
  });
});

/** `saveProfileSettings(_:)` (NexdoApp.swift:234-240). */
it('saves the settings form, reloads the profile and refreshes derived data', async () => {
  const queryClient = makeClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  mockUpdateSettings.mockResolvedValue({ ok: true });
  mockMe.mockResolvedValue({ user: profile({ name: 'Ada L' }) });
  const result = await harness(queryClient, () => useUpdateProfile());

  await act(async () => {
    await result.current.mutateAsync({
      name: 'Ada L',
      timeZone: 'Asia/Kolkata',
      preference: {
        workStart: '09:00',
        workEnd: '17:00',
        quietStart: '21:00',
        quietEnd: '07:00',
        confirmationLevel: 'ALWAYS',
        voiceEnabled: true,
        personalizationEnabled: false,
        pushEnabled: true,
        emailEnabled: true,
        smsEnabled: false,
        morningSummary: true,
        eveningSummary: true,
        phoneNumber: null,
      },
      nextAction: { enabled: true, switchingThreshold: 5 },
    });
  });

  expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
  expect(mockMe).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData<Profile>(queryKeys.me())?.name).toBe('Ada L');
  const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
  expect(keys).toEqual(
    expect.arrayContaining([queryKeys.tasks.all(), queryKeys.agenda.all(), queryKeys.scheduleIntelligence()]),
  );
});

/** `saveProfilePhoto(_:)` (NexdoApp.swift:241-272). */
describe('the profile photo', () => {
  const PHOTO = 'data:image/jpeg;base64,YWJj';

  it('publishes the photo once the PATCH response confirms it', async () => {
    const queryClient = makeClient();
    mockUpdatePhoto.mockResolvedValue({ ok: true, profile: { id: 'u1', photo: PHOTO } });
    const result = await harness(queryClient, () => useUploadPhoto());

    await act(async () => {
      await result.current.mutateAsync(PHOTO);
    });

    expect(mockUpdatePhoto).toHaveBeenCalledWith(PHOTO);
    expect(queryClient.getQueryData<Profile>(queryKeys.me())?.photo).toBe(PHOTO);
    expect(useSession.getState().profile?.photo).toBe(PHOTO);
    // A server that returned the row is trusted; no second read.
    expect(mockMe).not.toHaveBeenCalled();
  });

  it('re-reads /api/me when an older server answers only { ok: true }', async () => {
    const queryClient = makeClient();
    mockUpdatePhoto.mockResolvedValue({ ok: true });
    mockMe.mockResolvedValue({ user: profile({ photo: PHOTO }) });
    const result = await harness(queryClient, () => useUploadPhoto());

    await act(async () => {
      await result.current.mutateAsync(PHOTO);
    });

    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData<Profile>(queryKeys.me())?.photo).toBe(PHOTO);
  });

  it('rejects a server that silently ignored the field, and restores the old photo', async () => {
    const queryClient = makeClient(profile({ photo: 'data:image/jpeg;base64,b2xk' }));
    mockUpdatePhoto.mockResolvedValue({ ok: true, profile: { id: 'u1', photo: null } });
    const result = await harness(queryClient, () => useUploadPhoto());

    await expect(result.current.mutateAsync(PHOTO)).rejects.toThrow(PHOTO_UNCONFIRMED);
    expect(queryClient.getQueryData<Profile>(queryKeys.me())?.photo).toBe('data:image/jpeg;base64,b2xk');
  });

  it('restores the old photo when the request itself fails', async () => {
    const queryClient = makeClient(profile({ photo: 'data:image/jpeg;base64,b2xk' }));
    mockUpdatePhoto.mockRejectedValue(new Error('offline'));
    const result = await harness(queryClient, () => useUploadPhoto());

    await expect(result.current.mutateAsync(PHOTO)).rejects.toThrow('offline');
    expect(queryClient.getQueryData<Profile>(queryKeys.me())?.photo).toBe('data:image/jpeg;base64,b2xk');
    expect(useSession.getState().profile?.photo).toBe('data:image/jpeg;base64,b2xk');
  });

  it('removes the photo with null', async () => {
    const queryClient = makeClient(profile({ photo: PHOTO }));
    mockUpdatePhoto.mockResolvedValue({ ok: true, profile: { id: 'u1', photo: null } });
    const result = await harness(queryClient, () => useUploadPhoto());

    await act(async () => {
      await result.current.mutateAsync(null);
    });

    expect(mockUpdatePhoto).toHaveBeenCalledWith(null);
    expect(queryClient.getQueryData<Profile>(queryKeys.me())?.photo).toBeNull();
  });
});

/** `syncProfileCalendars()` (NexdoApp.swift:286-295): three distinct messages. */
describe('Synchronize now', () => {
  it.each([
    [[], 'No calendars connected yet.'],
    [[{ error: null }], 'Calendars synchronized.'],
    [[{ error: null }, { error: 'token expired' }], 'Some calendars could not synchronize. Check their connections in calendar settings.'],
  ])('reports the right message for %j', async (results, expected) => {
    const queryClient = makeClient();
    mockSync.mockResolvedValue({ results });
    const hook = await harness(queryClient, () => useSyncNow());

    let message = '';
    await act(async () => {
      message = await hook.current.mutateAsync();
    });

    expect(message).toBe(expected);
  });
});

/** `deleteAccount()` (NexdoApp.swift:739-744). */
it('deletes the account and tears down the session', async () => {
  const queryClient = makeClient();
  mockDelete.mockResolvedValue({ ok: true });
  const result = await harness(queryClient, () => useDeleteAccount());

  await act(async () => {
    await result.current.mutateAsync();
  });

  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(useSession.getState().status).toBe('signedOut');
  expect(useSession.getState().profile).toBeNull();
  expect(queryClient.getQueryData(queryKeys.me())).toBeNull();
});
