import Foundation
import Testing
@testable import NexdoCore

private func fixture(_ id: String, due: String?, status: String = "PLANNED", notes: String? = nil) throws -> NexdoTask {
    let data = try JSONSerialization.data(withJSONObject: ["id": id, "title": id, "status": status, "priority": "HIGH", "durationMin": 30, "dueAt": due as Any? ?? NSNull(), "notes": notes as Any? ?? NSNull()])
    return try JSONDecoder().decode(NexdoTask.self, from: data)
}

@Test func filtersAtAccountMidnightAndExcludesUndatedTasks() throws {
    let tasks = try [fixture("before", due: "2026-09-07T06:59:59Z"), fixture("today", due: "2026-09-07T07:00:00Z", notes: "Buy groceries"), fixture("tomorrow", due: "2026-09-08T07:00:00Z"), fixture("undated", due: nil)]
    let now = try #require(ServerDate.parse("2026-09-07T20:00:00Z"))
    var query = TaskQuery()
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["today"])
    query.search = " GROCERIES "
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["today"])
    query.date = .tomorrow
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).isEmpty)
    query.search = ""
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["tomorrow"])
    query.date = .all
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).count == 4)
}

@Test func dayFilterHandlesSpringDSTAndStatus() throws {
    let tasks = try [fixture("start", due: "2026-03-08T08:00:00Z"), fixture("end", due: "2026-03-09T06:59:59Z"), fixture("next", due: "2026-03-09T07:00:00Z"), fixture("done", due: "2026-03-08T10:00:00Z", status: "COMPLETED"), fixture("cancelled", due: "2026-03-08T11:00:00Z", status: "CANCELLED")]
    let now = try #require(ServerDate.parse("2026-03-08T20:00:00Z"))
    var query = TaskQuery()
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["start", "end"])
    query.status = "Completed"
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["done"])
}

@Test func weekUsesCalendarRulesAndExclusiveEnd() throws {
    var calendar = Calendar(identifier: .gregorian)
    calendar.firstWeekday = 2
    var query = TaskQuery(); query.date = .week
    let now = try #require(ServerDate.parse("2026-09-09T12:00:00Z"))
    let tasks = try [fixture("monday", due: "2026-09-07T07:00:00Z"), fixture("sunday", due: "2026-09-14T06:59:59Z"), fixture("next", due: "2026-09-14T07:00:00Z")]
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now, calendar: calendar).map(\.id) == ["monday", "sunday"])
    query.priority = "LOW"
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now, calendar: calendar).isEmpty)
}
