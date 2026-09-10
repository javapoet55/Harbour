import XCTest
@testable import NexdoCore

final class WeeklySummaryTests: XCTestCase {
    func testTaskBreakdownDecodingAndOlderServerCompatibility() throws {
        let base = #"{"timeZone":"America/Los_Angeles","start":"2026-09-07","end":"2026-09-13","generatedAt":"2026-09-09T14:00:00Z","headline":"Test","summary":"Test","metrics":{"completed":1,"planned":1,"completionRate":100,"overdue":0,"focusMinutes":0},"days":[],"accomplishments":[],"limitations":[]}"#
        var json = try JSONSerialization.jsonObject(with: Data(base.utf8)) as! [String: Any]
        let decoder = JSONDecoder()
        let older = try decoder.decode(WeeklySummary.self, from: Data(base.utf8))
        XCTAssertNil(older.taskGroups, "An older server's missing list must not become an empty list")
        let task: [String: Any] = ["id": "one", "title": "Done", "status": "COMPLETED", "priority": "HIGH", "durationMin": 25]
        json["taskGroups"] = ["planned": [task], "completed": [task], "overdue": []]
        let summary = try decoder.decode(WeeklySummary.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertEqual(summary.taskGroups?.completed.count, summary.metrics.completed)
        XCTAssertEqual(summary.taskGroups?.planned.first?.id, "one")
        XCTAssertEqual(summary.taskGroups?.overdue.count, 0)
    }

    func testLegacyTaskListsMatchReportDatesAndCompletionCutoff() throws {
        let json = #"{"timeZone":"America/Los_Angeles","start":"2026-09-07","end":"2026-09-13","generatedAt":"2026-09-09T16:00:00Z","headline":"Test","summary":"Test","metrics":{"completed":1,"planned":3},"days":[],"accomplishments":[],"limitations":[]}"#
        let summary = try JSONDecoder().decode(WeeklySummary.self, from: Data(json.utf8))
        XCTAssertEqual(summary.taskRangeLabel, "Mon, Sep 7 – Sun, Sep 13")
        func task(_ id: String, start: String? = nil, due: String?, completed: String? = nil) -> NexdoTask {
            var value = NexdoTask(id: id, title: id, status: completed == nil ? "PLANNED" : "COMPLETED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: start, dueAt: due)
            value.completedAt = completed
            return value
        }
        let groups = try summary.taskGroups(from: [
            task("done", due: "2026-09-07T07:00:00Z", completed: "2026-09-08T12:00:00Z"),
            task("lateCompletion", due: "2026-09-08T07:00:00Z", completed: "2026-09-10T12:00:00Z"),
            task("open", due: "2026-09-09T15:00:00Z"),
            task("priorWeek", due: "2026-09-07T06:59:59Z", completed: "2026-09-08T12:00:00Z"),
            task("nextWeek", due: "2026-09-14T07:00:00Z"),
            task("startWins", start: "2026-09-06T12:00:00Z", due: "2026-09-08T12:00:00Z"),
            task("undated", due: nil)
        ])
        XCTAssertEqual(groups.planned.map(\.id), ["done", "lateCompletion", "open"])
        XCTAssertEqual(groups.completed.map(\.id), ["done"])
        XCTAssertEqual(groups.overdue.map(\.id), ["lateCompletion", "open"])
    }

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
