import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';

const mockSync = jest.fn();
jest.mock('../../../query/useProfile', () => ({ synchronizeDeviceTimeZone: (...args: unknown[]) => mockSync(...args) }));
let mockZone = 'Asia/Kolkata';
jest.mock('../../../lib/profileSettings', () => ({ deviceTimeZone: () => mockZone }));

import { useSettingsTimeZoneSync, ZONE_CHECK_MS } from '../useSettingsTimeZoneSync';

/**
 * Settings' device time-zone sync (ProfileView.swift:310-315, :645-647). ANDROID AHEAD of §24 Swift bug 12: a
 * failed sync never stops Settings loading (docs/android-polish.md §65).
 */

const onFailure = jest.fn();

function Probe({ owner }: { owner: string | null }) {
  useSettingsTimeZoneSync(owner, onFailure);
  return null;
}

async function mount(owner: string | null = 'u1') {
  const queryClient = new QueryClient();
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <Probe owner={owner} />
    </QueryClientProvider>,
  );
  await act(async () => undefined);
  return { view, queryClient };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockZone = 'Asia/Kolkata';
  mockSync.mockResolvedValue(undefined);
});
afterEach(() => jest.useRealTimers());

it('syncs the device zone when Settings opens', async () => {
  const { queryClient } = await mount();
  expect(mockSync).toHaveBeenCalledTimes(1);
  expect(mockSync).toHaveBeenCalledWith(queryClient);
});

it('keeps quiet when that first sync fails, so Settings still loads', async () => {
  mockSync.mockRejectedValueOnce(new Error('Couldn’t synchronize your device time zone.'));
  await mount();
  await act(async () => undefined);
  expect(onFailure).not.toHaveBeenCalled();
});

it('does nothing signed out', async () => {
  await mount(null);
  await act(async () => {
    jest.advanceTimersByTime(ZONE_CHECK_MS * 3);
  });
  expect(mockSync).not.toHaveBeenCalled();
});

it('syncs again when the device zone changes while Settings is open, and only then', async () => {
  await mount();
  await act(async () => {
    jest.advanceTimersByTime(ZONE_CHECK_MS * 2);
  });
  expect(mockSync).toHaveBeenCalledTimes(1);

  mockZone = 'Europe/London';
  await act(async () => {
    jest.advanceTimersByTime(ZONE_CHECK_MS);
  });
  expect(mockSync).toHaveBeenCalledTimes(2);
  await act(async () => {
    jest.advanceTimersByTime(ZONE_CHECK_MS);
  });
  expect(mockSync).toHaveBeenCalledTimes(2);
});

it('reports a failed re-sync after a zone change, as Swift does', async () => {
  await mount();
  mockSync.mockRejectedValueOnce(new Error('The server returned an unexpected response. Please try again later.'));
  mockZone = 'Europe/London';
  await act(async () => {
    jest.advanceTimersByTime(ZONE_CHECK_MS);
  });
  await act(async () => undefined);
  expect(onFailure).toHaveBeenCalledWith('The server returned an unexpected response. Please try again later.');
});

it('stops checking when Settings closes', async () => {
  const { view } = await mount();
  await act(async () => view.unmount());
  mockZone = 'Europe/London';
  await act(async () => {
    jest.advanceTimersByTime(ZONE_CHECK_MS * 2);
  });
  expect(mockSync).toHaveBeenCalledTimes(1);
});
