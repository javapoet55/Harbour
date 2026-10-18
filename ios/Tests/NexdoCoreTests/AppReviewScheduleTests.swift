import Foundation
import Testing
@testable import NexdoCore

private func date(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
private let la = TimeZone(identifier: "America/Los_Angeles")!
private let installed = date("2026-10-18T19:00:00Z") // Sunday noon PDT

@Test func reviewWaitsAFullWeekAndForFridayEvening() {
    let schedule = AppReviewSchedule(firstLaunch: installed)
    #expect(schedule.eligibleWeek(at: date("2026-10-24T01:00:00Z"), timeZone: la) == nil)
    #expect(schedule.eligibleWeek(at: date("2026-10-30T23:59:59Z"), timeZone: la) == nil)
    #expect(schedule.eligibleWeek(at: date("2026-10-31T00:00:00Z"), timeZone: la) == 0)
    #expect(schedule.eligibleWeek(at: date("2026-10-31T07:00:00Z"), timeZone: la) == nil)
}

@Test func reviewRunsForOnlyFiveConsecutiveFridaysAcrossDST() {
    let schedule = AppReviewSchedule(firstLaunch: installed)
    for (week, value) in ["2026-10-31T00:00:00Z", "2026-11-07T01:00:00Z", "2026-11-14T01:00:00Z", "2026-11-21T01:00:00Z", "2026-11-28T01:00:00Z"].enumerated() {
        #expect(schedule.eligibleWeek(at: date(value), timeZone: la) == week)
    }
    #expect(schedule.eligibleWeek(at: date("2026-12-05T01:00:00Z"), timeZone: la) == nil)
}

@Test func reviewDeduplicatesAfterRelaunchAndDoesNotCatchUp() throws {
    var schedule = AppReviewSchedule(firstLaunch: installed)
    let consumed = schedule.consumeOpportunity(at: date("2026-11-14T01:00:00Z"), timeZone: la)
    #expect(consumed)
    let restored = try JSONDecoder().decode(AppReviewSchedule.self, from: JSONEncoder().encode(schedule))
    #expect(restored.lastRequestedWeek == 2)
    #expect(restored.eligibleWeek(at: date("2026-11-14T05:00:00Z"), timeZone: la) == nil)
    #expect(restored.eligibleWeek(at: date("2026-11-07T01:00:00Z"), timeZone: la) == nil)
    #expect(restored.eligibleWeek(at: date("2026-11-21T01:00:00Z"), timeZone: la) == 3)
}

@Test func reviewUsesDeviceLocalTimeNotUTC() {
    let schedule = AppReviewSchedule(firstLaunch: installed)
    let now = date("2026-10-30T21:00:00Z")
    #expect(schedule.eligibleWeek(at: now, timeZone: la) == nil)
    #expect(schedule.eligibleWeek(at: now, timeZone: TimeZone(identifier: "America/New_York")!) == 0)
    #expect(schedule.eligibleWeek(at: now, timeZone: TimeZone(identifier: "Asia/Tokyo")!) == nil)
}

@Test func fridayInstallationWaitsUntilAnniversaryTime() {
    let schedule = AppReviewSchedule(firstLaunch: date("2026-10-24T02:00:00Z")) // Friday 7 p.m.
    #expect(schedule.eligibleWeek(at: date("2026-10-31T01:59:59Z"), timeZone: la) == nil)
    #expect(schedule.eligibleWeek(at: date("2026-10-31T02:00:00Z"), timeZone: la) == 0)
}

@Test func reviewDoesNotConsumeIneligibleDateOrResetForAnUpdate() {
    var schedule = AppReviewSchedule(firstLaunch: installed)
    let consumed = schedule.consumeOpportunity(at: installed, timeZone: la)
    #expect(!consumed)
    #expect(schedule.lastRequestedWeek == nil)
    #expect(schedule.firstLaunch == installed)
    #expect(schedule.eligibleWeek(at: date("2027-10-30T00:00:00Z"), timeZone: la) == nil)
}
