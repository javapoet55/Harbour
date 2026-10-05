import { chartValues, e164, goalsFrom, goalsPayload, intake, needsReview, nutritionDay, nutritionZone, zoneChoices } from '../model';

/**
 * The Daily Food Check-in helpers (ios/App/CalorieTrackerView.swift). Swift has no unit tests for
 * this screen; these pin the rules the port copies.
 */

describe('e164 (CalorieStore.e164, :216-227)', () => {
  it('accepts an international number and strips its punctuation', () => {
    expect(e164(' +1 (650) 555-0123 ', 'IN')).toBe('+16505550123');
    expect(e164('+44 20 7946 0958', null)).toBe('+442079460958');
  });
  it('refuses a leading zero, too few or too many digits', () => {
    expect(e164('+0123456789', 'US')).toBeNull();
    expect(e164('+1234567', 'US')).toBeNull();
    expect(e164('+1234567890123456', 'US')).toBeNull();
  });
  it('reads a bare national number as +1 only on a US device', () => {
    expect(e164('650 555 0123', 'US')).toBe('+16505550123');
    expect(e164('1 650 555 0123', 'us')).toBe('+16505550123');
    expect(e164('650 555 0123', 'GB')).toBeNull();
    expect(e164('650 555 0123', null)).toBeNull();
  });
});

test('the date key is the day in the settings zone, falling back to the device zone', () => {
  const at = Date.parse('2026-09-28T03:00:00Z');
  expect(nutritionDay(at, 'America/Los_Angeles')).toBe('2026-09-27');
  expect(nutritionDay(at, 'Asia/Kolkata')).toBe('2026-09-28');
  expect(nutritionZone({ timeZone: 'Asia/Kolkata' }, 'UTC')).toBe('Asia/Kolkata');
  expect(nutritionZone({ timeZone: 'Not/AZone' }, 'UTC')).toBe('UTC');
  expect(nutritionZone(null, 'UTC')).toBe('UTC');
});

test('intake rounds half away from zero and keeps unknown key nutrients unknown', () => {
  const totals = { kcal: 1200, proteinG: 82.5, carbsG: 180.4, fatG: 52, fiberG: null, calciumMg: 600.5 };
  expect([0, 1, 2, 3, 4, 5, 6, 7].map((index) => intake(totals, index))).toEqual([83, 180, 52, null, 601, null, null, null]);
  expect(intake(null, 0)).toBeNull();
});

test('goals restore by label and are sent back by label as whole numbers', () => {
  expect(goalsFrom({ Protein: 120.9, Iron: 20 })).toEqual([120, 250, 67, 25, 1000, 20, 800, 1000]);
  expect(goalsFrom(null)).toEqual([150, 250, 67, 25, 1000, 18, 800, 1000]);
  expect(goalsPayload([150, 250, 67, 25, 1000, 18, 800, 1000.7])).toEqual({
    Protein: 150, Carbs: 250, Fats: 67, Fiber: 25, Calcium: 1000, Iron: 18, 'Vitamin D': 800, 'Omega-3': 1000,
  });
});

test('the user zone is listed first only when it is not a common one', () => {
  expect(zoneChoices('UTC')[0]).toBe('America/Los_Angeles');
  expect(zoneChoices('Australia/Sydney').slice(0, 2)).toEqual(['Australia/Sydney', 'America/Los_Angeles']);
});

describe('chartValues (:676-711)', () => {
  // The server's week runs Monday to Sunday (mondayOf, src/server/nutrition/log.ts:104).
  const week = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'].map((date, index) => ({ date, kcal: 1500 + index }));

  it('labels a week by weekday letter, Monday first', () => {
    expect(chartValues({ daily: week }, 'Week')).toEqual({ values: week.map((day) => day.kcal), labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] });
  });

  it('groups a month into Monday–Sunday weeks averaged over logged days only', () => {
    const daily = [
      { date: '2026-09-19', kcal: 1000 }, // Sat → week of Mon 9/14
      { date: '2026-09-20', kcal: 0 }, // Sun, same week, not logged
      { date: '2026-09-21', kcal: 2001 }, // Mon → a new week
      { date: '2026-09-22', kcal: 2000 },
      { date: 'garbage', kcal: 9999 }, // skipped, as Swift skips an unparseable date
      { date: '2026-09-28', kcal: 0 }, // Mon, nothing logged → 0
    ];
    expect(chartValues({ daily }, 'Month')).toEqual({ values: [1000, 2000, 0], labels: ['9/14', '9/21', '9/28'] });
  });
});

test('anything but CONFIRMED needs review', () => {
  expect(needsReview({ status: 'CONFIRMED' })).toBe(false);
  expect(needsReview({ status: 'NEEDS_REVIEW' })).toBe(true);
});
