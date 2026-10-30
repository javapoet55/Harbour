import AsyncStorage from '@react-native-async-storage/async-storage';

import { EXISTING_INSTALL_KEYS, INTRODUCTION_KEY, useIntroduction } from './introduction';

/**
 * The first-install introduction flag (35b40f2, `@AppStorage("nexdo.installIntroductionCompleted")`,
 * RootView.swift:16), with the Android-ahead rule: an install that already holds Nexdo data never sees
 * the "first-install" pages (§24 Swift bug 8).
 */

beforeEach(async () => {
  await AsyncStorage.clear();
  useIntroduction.setState({ completed: undefined });
  jest.restoreAllMocks();
});

it('is undecided until read', () => {
  expect(useIntroduction.getState().completed).toBeUndefined();
});

it('shows the introduction on a true first install', async () => {
  await useIntroduction.getState().hydrate();
  expect(useIntroduction.getState().completed).toBe(false);
  expect(await AsyncStorage.getItem(INTRODUCTION_KEY)).toBeNull();
});

it('remembers completion under Swift’s key', async () => {
  await useIntroduction.getState().complete();
  expect(useIntroduction.getState().completed).toBe(true);
  expect(await AsyncStorage.getItem(INTRODUCTION_KEY)).toBe('true');

  useIntroduction.setState({ completed: undefined });
  await useIntroduction.getState().hydrate();
  expect(useIntroduction.getState().completed).toBe(true);
});

// The case Swift gets wrong: a signed-out upgrader who has signed in on this device before.
it('skips it for a signed-out install that has signed in before, and writes the flag', async () => {
  await AsyncStorage.setItem('nexdo.lastSignedInFirstName', 'Visakan');

  await useIntroduction.getState().hydrate();

  expect(useIntroduction.getState().completed).toBe(true);
  expect(await AsyncStorage.getItem(INTRODUCTION_KEY)).toBe('true');
});

it.each(EXISTING_INSTALL_KEYS.map((key) => [key]))('counts %s as existing app data', async (key) => {
  await AsyncStorage.setItem(key, 'x');
  await useIntroduction.getState().hydrate();
  expect(useIntroduction.getState().completed).toBe(true);
});

// This version writes the review schedule at launch, before the introduction shows; it proves nothing.
it('does not count the review schedule written at launch', async () => {
  await AsyncStorage.setItem('nexdo.appReviewSchedule.v1', '{"firstLaunch":1}');
  await useIntroduction.getState().hydrate();
  expect(useIntroduction.getState().completed).toBe(false);
});

it('does not show it when storage cannot be read', async () => {
  jest.spyOn(AsyncStorage, 'multiGet').mockRejectedValueOnce(new Error('unavailable'));
  await useIntroduction.getState().hydrate();
  expect(useIntroduction.getState().completed).toBe(true);
});
