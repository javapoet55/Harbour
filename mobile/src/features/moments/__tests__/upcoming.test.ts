import { upcomingFilterEmptyTitle, upcomingFilterIncludes, type UpcomingFilter } from '../dates';
import { scheduleSummaryLabels } from '../domain';
import { plan } from '../testFixtures';

/** Ports of the Swift tests in ios/Tests/NexdoCoreTests/ImportantMomentTests.swift (Phase 12). */

// momentDateFiltersRespectLocalDaysAndWeekBoundaries
describe('MomentUpcomingFilter', () => {
  // Saturday 26 September 2026, 7 pm in Los Angeles; already Sunday the 27th in Tokyo.
  const now = Date.parse('2026-09-27T02:00:00Z');
  const matches = (filter: UpcomingFilter, day: string, zone = 'America/Los_Angeles') => upcomingFilterIncludes(filter, day, zone, now);

  it('judges Today in the moment’s own zone', () => {
    expect(matches('Today', '2026-09-26')).toBe(true);
    expect(matches('Today', '2026-09-27')).toBe(false);
    expect(matches('Today', '2026-09-27', 'Asia/Tokyo')).toBe(true);
  });

  it('ends This Week on Saturday (a Sunday-first week) and starts Later after tomorrow', () => {
    expect(matches('Tomorrow', '2026-09-27')).toBe(true);
    expect(matches('This Week', '2026-09-26')).toBe(true);
    expect(matches('This Week', '2026-09-27')).toBe(false);
    expect(matches('Later', '2026-09-27')).toBe(false);
    expect(matches('Later', '2026-09-28')).toBe(true);
    expect(matches('This Week', '2026-09-25')).toBe(false);
  });

  it('keeps Tomorrow right across a DST change', () => {
    const dst = Date.parse('2026-03-08T09:00:00Z');
    expect(upcomingFilterIncludes('Tomorrow', '2026-03-09', 'America/Los_Angeles', dst)).toBe(true);
  });

  it('words each empty state after its chip', () => {
    expect(upcomingFilterEmptyTitle('Today')).toBe('No moments today');
    expect(upcomingFilterEmptyTitle('This Week')).toBe('No moments this week');
    expect(upcomingFilterEmptyTitle('Later')).toBe('No moments later');
  });
});

// momentScheduleBadgesGroupMatchingTimes
describe('MomentScheduleSummary', () => {
  const at = (id: string, time: string) => plan({ id, draftID: id, idempotencyKey: id, scheduledAtUTC: time, timeZoneID: 'America/Los_Angeles' });

  it('groups plans that share a send time, soonest first', () => {
    const labels = scheduleSummaryLabels([at('a', '2026-09-26T15:00:00Z'), at('b', '2026-09-26T15:00:00Z'), at('c', '2026-09-26T17:00:00Z')], 'en-US');
    expect(labels).toHaveLength(2);
    expect(labels[0]).toMatch(/^2 scheduled @ 8:00/);
    expect(labels[1]).toMatch(/^1 scheduled @ 10:00/);
    expect(scheduleSummaryLabels([])).toEqual([]);
  });

  it('adds the zone only when the plans span more than one', () => {
    const labels = scheduleSummaryLabels([at('a', '2026-09-26T15:00:00Z'), plan({ id: 'b', scheduledAtUTC: '2026-09-26T15:00:00Z', timeZoneID: 'UTC' })], 'en-US');
    expect(labels).toHaveLength(2);
    expect(labels.every((label) => /scheduled @ \d+:\d\d\s?[AP]M \S+/.test(label))).toBe(true);
  });
});
