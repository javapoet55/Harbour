import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

import { consumeReviewOpportunity, recordFirstLaunch, REVIEW_SCHEDULE_KEY, requestStoreReview } from '../reviewPrompt';
import { consumeOpportunity, eligibleWeek, parseReviewSchedule, type ReviewSchedule } from '../reviewSchedule';

jest.mock('expo-store-review', () => ({ isAvailableAsync: jest.fn(), requestReview: jest.fn() }));

/**
 * One for one with ios/Tests/NexdoCoreTests/AppReviewScheduleTests.swift (bfa5b73), same instants and
 * zones, then the storage rules of AppReviewPrompt.swift.
 */

const date = (value: string) => Date.parse(value);
const LA = 'America/Los_Angeles';
const installed = date('2026-10-18T19:00:00Z'); // Sunday noon PDT

it('reviewWaitsAFullWeekAndForFridayEvening', () => {
  const schedule: ReviewSchedule = { firstLaunch: installed };
  expect(eligibleWeek(schedule, date('2026-10-24T01:00:00Z'), LA)).toBeNull();
  expect(eligibleWeek(schedule, date('2026-10-30T23:59:59Z'), LA)).toBeNull();
  expect(eligibleWeek(schedule, date('2026-10-31T00:00:00Z'), LA)).toBe(0);
  expect(eligibleWeek(schedule, date('2026-10-31T07:00:00Z'), LA)).toBeNull();
});

it('reviewRunsForOnlyFiveConsecutiveFridaysAcrossDST', () => {
  const schedule: ReviewSchedule = { firstLaunch: installed };
  ['2026-10-31T00:00:00Z', '2026-11-07T01:00:00Z', '2026-11-14T01:00:00Z', '2026-11-21T01:00:00Z', '2026-11-28T01:00:00Z'].forEach((value, week) => {
    expect(eligibleWeek(schedule, date(value), LA)).toBe(week);
  });
  expect(eligibleWeek(schedule, date('2026-12-05T01:00:00Z'), LA)).toBeNull();
});

it('reviewDeduplicatesAfterRelaunchAndDoesNotCatchUp', () => {
  const consumed = consumeOpportunity({ firstLaunch: installed }, date('2026-11-14T01:00:00Z'), LA);
  expect(consumed).not.toBeNull();
  const restored = parseReviewSchedule(JSON.stringify(consumed));
  expect(restored?.lastRequestedWeek).toBe(2);
  expect(eligibleWeek(restored!, date('2026-11-14T05:00:00Z'), LA)).toBeNull();
  expect(eligibleWeek(restored!, date('2026-11-07T01:00:00Z'), LA)).toBeNull();
  expect(eligibleWeek(restored!, date('2026-11-21T01:00:00Z'), LA)).toBe(3);
});

it('reviewUsesDeviceLocalTimeNotUTC', () => {
  const schedule: ReviewSchedule = { firstLaunch: installed };
  const now = date('2026-10-30T21:00:00Z');
  expect(eligibleWeek(schedule, now, LA)).toBeNull();
  expect(eligibleWeek(schedule, now, 'America/New_York')).toBe(0);
  expect(eligibleWeek(schedule, now, 'Asia/Tokyo')).toBeNull();
});

it('fridayInstallationWaitsUntilAnniversaryTime', () => {
  const schedule: ReviewSchedule = { firstLaunch: date('2026-10-24T02:00:00Z') }; // Friday 7 p.m.
  expect(eligibleWeek(schedule, date('2026-10-31T01:59:59Z'), LA)).toBeNull();
  expect(eligibleWeek(schedule, date('2026-10-31T02:00:00Z'), LA)).toBe(0);
});

it('reviewDoesNotConsumeIneligibleDateOrResetForAnUpdate', () => {
  const schedule: ReviewSchedule = { firstLaunch: installed };
  expect(consumeOpportunity(schedule, installed, LA)).toBeNull();
  expect(schedule.lastRequestedWeek).toBeUndefined();
  expect(schedule.firstLaunch).toBe(installed);
  expect(eligibleWeek(schedule, date('2027-10-30T00:00:00Z'), LA)).toBeNull();
});

// Not in Swift's suite: 17:00 is inclusive, and the week is counted in calendar days across the DST end.
it('opens at 17:00 sharp, and keeps the wall-clock anniversary across DST', () => {
  // Installed Sunday 1 Nov 2026 12:00 PST (DST ended that morning); a week on is Sunday 8 Nov 12:00 PST.
  const schedule: ReviewSchedule = { firstLaunch: date('2026-11-01T20:00:00Z') };
  expect(eligibleWeek(schedule, date('2026-11-14T00:59:59Z'), LA)).toBeNull(); // Fri 13 Nov 16:59:59 PST
  expect(eligibleWeek(schedule, date('2026-11-14T01:00:00Z'), LA)).toBe(0); // Fri 13 Nov 17:00 PST
  expect(eligibleWeek(schedule, date('2026-11-07T01:00:00Z'), LA)).toBeNull(); // Fri 6 Nov: inside the week
});

it('reads a stored schedule, or nothing', () => {
  expect(parseReviewSchedule(null)).toBeNull();
  expect(parseReviewSchedule('not json')).toBeNull();
  expect(parseReviewSchedule('{"lastRequestedWeek":1}')).toBeNull();
  expect(parseReviewSchedule('{"firstLaunch":1,"lastRequestedWeek":1.5}')).toBeNull();
  expect(parseReviewSchedule('{"firstLaunch":1}')).toEqual({ firstLaunch: 1 });
  expect(parseReviewSchedule('{"firstLaunch":1,"lastRequestedWeek":0}')).toEqual({ firstLaunch: 1, lastRequestedWeek: 0 });
});

describe('the stored schedule (AppReviewPromptStore)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('records the first launch once, under Swift’s key', async () => {
    await recordFirstLaunch(installed);
    await recordFirstLaunch(installed + 1_000_000);
    expect(JSON.parse((await AsyncStorage.getItem(REVIEW_SCHEDULE_KEY))!)).toEqual({ firstLaunch: installed });
  });

  it('writes the week before saying yes, and says yes once a week', async () => {
    await recordFirstLaunch(installed);
    const friday = date('2026-10-31T00:30:00Z');

    await expect(consumeReviewOpportunity(friday, LA)).resolves.toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem(REVIEW_SCHEDULE_KEY))!)).toEqual({ firstLaunch: installed, lastRequestedWeek: 0 });
    await expect(consumeReviewOpportunity(friday + 60_000, LA)).resolves.toBe(false);
    await expect(consumeReviewOpportunity(date('2026-11-07T01:00:00Z'), LA)).resolves.toBe(true);
  });

  it('says no with nothing stored, or when the write fails', async () => {
    await expect(consumeReviewOpportunity(date('2026-10-31T00:30:00Z'), LA)).resolves.toBe(false);

    await recordFirstLaunch(installed);
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(consumeReviewOpportunity(date('2026-10-31T00:30:00Z'), LA)).resolves.toBe(false);
  });

  it('asks the store only when it can show its own sheet', async () => {
    (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    await requestStoreReview();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();

    (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    await requestStoreReview();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);

    (StoreReview.isAvailableAsync as jest.Mock).mockRejectedValueOnce(new Error('no play services'));
    await expect(requestStoreReview()).resolves.toBeUndefined();
  });
});
