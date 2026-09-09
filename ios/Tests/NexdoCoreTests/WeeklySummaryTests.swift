import XCTest
@testable import NexdoCore

final class WeeklySummaryTests: XCTestCase {
    func testSundayBelongsToPreviousMondayAndNextMondayStartsANewWeek() {
        for (timestamp, expected) in [("2026-09-14T06:59:00Z", "2026-09-07"), ("2026-09-14T07:00:00Z", "2026-09-14")] {
            let date = ISO8601DateFormatter().date(from: timestamp)!
            let start = WeeklySummaryDates.startOfWeek(containing: date, timeZoneID: "America/Los_Angeles")
            XCTAssertEqual(WeeklySummaryDates.apiDay(start, timeZoneID: "America/Los_Angeles"), expected)
            let sunday = WeeklySummaryDates.calendar(timeZoneID: "America/Los_Angeles").date(byAdding: .day, value: 6, to: start)!
            XCTAssertEqual(WeeklySummaryDates.calendar(timeZoneID: "America/Los_Angeles").component(.weekday, from: sunday), 1)
        }
    }
    func testWeekStartsMondayInAccountTimeZone() {
        let date = ISO8601DateFormatter().date(from: "2026-09-08T02:00:00Z")!
        let start = WeeklySummaryDates.startOfWeek(containing: date, timeZoneID: "America/Los_Angeles")
        XCTAssertEqual(WeeklySummaryDates.apiDay(start, timeZoneID: "America/Los_Angeles"), "2026-09-07")
    }

    func testAddingWeekAcrossDaylightSavingUsesCalendarDays() {
        let start = WeeklySummaryDates.startOfWeek(containing: ISO8601DateFormatter().date(from: "2026-03-07T20:00:00Z")!, timeZoneID: "America/Los_Angeles")
        let next = WeeklySummaryDates.addingWeek(1, to: start, timeZoneID: "America/Los_Angeles")
        XCTAssertEqual(WeeklySummaryDates.apiDay(next, timeZoneID: "America/Los_Angeles"), "2026-03-09")
    }
}
