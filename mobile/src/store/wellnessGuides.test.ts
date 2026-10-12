import { QueryClient } from '@tanstack/react-query';

import type { Profile } from '../api';

const mockEndpoints = { me: jest.fn(), updateSettings: jest.fn() };
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    me: (...args: unknown[]) => mockEndpoints.me(...args),
    updateSettings: (...args: unknown[]) => mockEndpoints.updateSettings(...args),
  },
}));

import { finishAuthentication } from '../query/useAuth';
import { reloadProfile } from '../query/useProfile';
import { useSession } from './session';
import { useWellnessGuides } from './wellnessGuides';

/**
 * The guide-once-per-sign-in rules (8f7e492, 2edb3f0), as the Swift checks pin them
 * (ios/Tests/AppModelChecks/EmailVerificationChecks.swift) and the UI tests walk them
 * (ios/Tests/MomentUITests/WellnessMenuUITests.swift).
 */

const ADA = { id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } as Profile;
const clients: QueryClient[] = [];

function client(): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(queryClient);
  return queryClient;
}

beforeEach(() => {
  mockEndpoints.me.mockResolvedValue({ user: ADA });
  mockEndpoints.updateSettings.mockResolvedValue({ user: ADA });
  useSession.getState().clear();
  useWellnessGuides.getState().reset();
});
afterEach(() => clients.splice(0).forEach((queryClient) => queryClient.clear()));

test('a guide shows once, and stays on screen after it is marked seen', () => {
  // testShoppingGuideIsSkippedAfterContinuing: the first entrance opens on the guide…
  expect(useWellnessGuides.getState().enter('shopping')).toBe(true);
  expect(useWellnessGuides.getState().hasSeen('shopping')).toBe(true);
  // …the next one goes straight to My Lists.
  expect(useWellnessGuides.getState().enter('shopping')).toBe(false);
  // 2edb3f0: every module keeps its own.
  expect(useWellnessGuides.getState().enter('moments')).toBe(true);
  expect(useWellnessGuides.getState().hasSeen('calories')).toBe(false);
});

test('a fresh sign-in shows every guide again; a profile refresh does not', async () => {
  const queryClient = client();
  await finishAuthentication(queryClient);
  useWellnessGuides.getState().enter('shopping');

  // "A profile refresh reset the shopping guide"
  await reloadProfile(queryClient);
  expect(useWellnessGuides.getState().hasSeen('shopping')).toBe(true);

  // "A fresh sign-in did not reset the shopping guide" — even as the same account, still signed in.
  await finishAuthentication(queryClient);
  expect(useWellnessGuides.getState().hasSeen('shopping')).toBe(false);
});

test('signing out shows every guide again', async () => {
  await finishAuthentication(client());
  useWellnessGuides.getState().enter('pomodoro');
  // "Signing out did not reset the shopping guide": every sign-out path ends in `useSession.clear()`.
  useSession.getState().clear();
  expect(useWellnessGuides.getState().seen).toEqual([]);
});

test('another account never inherits the guides seen', () => {
  useSession.getState().setProfile(ADA);
  useWellnessGuides.getState().enter('calories');
  useSession.getState().setProfile({ ...ADA, id: 'u2' });
  expect(useWellnessGuides.getState().hasSeen('calories')).toBe(false);
});
