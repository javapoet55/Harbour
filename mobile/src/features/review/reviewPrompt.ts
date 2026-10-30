import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

import { consumeOpportunity, parseReviewSchedule } from './reviewSchedule';

/**
 * `AppReviewPromptStore` (ios/App/AppReviewPrompt.swift:4-24): the schedule lives on the device under
 * Swift's key. AsyncStorage is the UserDefaults analogue, as for the appearance store.
 */
export const REVIEW_SCHEDULE_KEY = 'nexdo.appReviewSchedule.v1';

/** The device's zone, read each time like `TimeZone.autoupdatingCurrent`. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * `recordFirstLaunch()` (`:9-14`), called once at launch (`NexdoApp.init`): only the first launch ever is
 * recorded, so an update never resets the clock.
 */
export async function recordFirstLaunch(now: number = Date.now()): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(REVIEW_SCHEDULE_KEY)) !== null) return;
    await AsyncStorage.setItem(REVIEW_SCHEDULE_KEY, JSON.stringify({ firstLaunch: now }));
  } catch {
    // Like `try?`: a storage failure only means no review request.
  }
}

/**
 * `consumeOpportunity()` (`:16-23`): `true` when this week's request may be made, after the week has been
 * written. A write that fails returns `false`, so a request is never made that could repeat.
 */
export async function consumeReviewOpportunity(now: number = Date.now(), timeZone: string = deviceTimeZone()): Promise<boolean> {
  try {
    const schedule = parseReviewSchedule(await AsyncStorage.getItem(REVIEW_SCHEDULE_KEY));
    const updated = schedule ? consumeOpportunity(schedule, now, timeZone) : null;
    if (!updated) return false;
    await AsyncStorage.setItem(REVIEW_SCHEDULE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

/**
 * `requestReview()`: the platform's own rating sheet, with no pre-prompt (`:26`). On Android this is the Play
 * In-App Review API: quota-limited, silent when it declines, and never shown on internal test tracks.
 * `isAvailableAsync` keeps expo-store-review from falling back to opening a store URL.
 */
export async function requestStoreReview(): Promise<void> {
  try {
    if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
  } catch {
    // A sheet that does not appear is never an error the user sees; StoreKit reports nothing either.
  }
}
