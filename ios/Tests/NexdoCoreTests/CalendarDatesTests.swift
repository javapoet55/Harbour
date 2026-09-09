import Foundation
import Testing
@testable import NexdoCore

@Test func calendarKeywordSearchHandlesCaseAccentsAndWhitespace() {
    #expect(CalendarSearch.matches("Café with Alex", query: " CAFE \n"))
    #expect(CalendarSearch.matches("Call roofing company", query: "roofing"))
    #expect(CalendarSearch.matches("Team meeting", query: "  \n"))
    #expect(!CalendarSearch.matches("Team meeting", query: "dentist"))
}

@Test func calendarWeekCrossesYearAndUsesMonday() {
    let dates = CalendarDates(timeZone: "America/Los_Angeles")
    let week = dates.week(ServerDate.parse("2027-01-01T20:00:00Z")!)
    #expect(week.map(dates.key) == ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"])
}
@Test func monthIncludesAdjacentDaysAndSixWeekMonths() {
    let dates = CalendarDates(timeZone: "Asia/Kolkata")
    let september = dates.month(ServerDate.parse("2026-09-07T12:00:00Z")!)
    #expect(september.count == 35)
    #expect(dates.key(september.first!) == "2026-08-30")
    #expect(dates.key(september.last!) == "2026-10-03")
    #expect(dates.month(ServerDate.parse("2026-08-15T12:00:00Z")!).count == 42)
    #expect(dates.month(ServerDate.parse("2028-02-15T12:00:00Z")!).contains { dates.key($0) == "2028-02-29" })
}
@Test func calendarArithmeticSurvivesDST() {
    let dates = CalendarDates(timeZone: "America/Los_Angeles")
    let start = ServerDate.parse("2026-03-08T08:00:00Z")!
    let next = dates.addingDays(1, to: start)
    #expect(dates.key(next) == "2026-03-09")
    #expect(next.timeIntervalSince(start) == 23 * 3600)
    #expect(Set(dates.week(start).map(dates.key)).count == 7)
}
@Test func taskAppearsOnScheduledDayAndSeparateDeadline() {
    let dates = CalendarDates(timeZone: "America/Los_Angeles")
    var task = NexdoTask(id: "test", title: "Test", status: "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: "2026-09-07T16:00:00Z", dueAt: "2026-09-09T01:00:00Z")
    #expect(dates.taskOccurs(task, on: ServerDate.parse("2026-09-07T12:00:00Z")!))
    #expect(dates.taskOccurs(task, on: ServerDate.parse("2026-09-08T12:00:00Z")!))
    #expect(!dates.taskOccurs(task, on: ServerDate.parse("2026-09-09T12:00:00Z")!))
    task = NexdoTask(id: "test", title: "Test", status: "COMPLETED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: "2026-09-07T16:00:00Z", dueAt: nil)
    #expect(!dates.taskOccurs(task, on: ServerDate.parse("2026-09-07T12:00:00Z")!))
}
