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

@Test func newlyCreatedTaskIsRevealedUnderTodayAcrossFilters() throws {
    let task = try fixture("Created on iPhone", due: ISO8601DateFormatter().string(from: Date()))
    var query = TaskQuery()
    query.search = "unrelated"
    query.status = "Completed"
    query.priority = "LOW"
    query.earliestFirst = false
    #expect(query.results([task], timeZone: "America/Los_Angeles").isEmpty)
    query.revealCreatedTask()
    #expect(query.results([task], timeZone: "America/Los_Angeles").map(\.id) == [task.id])
    #expect(query.date == .today)
    #expect(!query.earliestFirst)
}

@Test func scheduledTasksWithoutDeadlineAppearOnTheirScheduledDay() throws {
    let data = Data(#"{"id":"scheduled","title":"Scheduled task","status":"PLANNED","priority":"NORMAL","durationMin":30,"startAt":"2026-09-07T16:00:00Z","dueAt":null}"#.utf8)
    let task = try JSONDecoder().decode(NexdoTask.self, from: data)
    let now = try #require(ServerDate.parse("2026-09-07T20:00:00Z"))
    #expect(TaskQuery().results([task], timeZone: "America/Los_Angeles", now: now).map(\.id) == [task.id])
}

@Test func coupledDueDatePrefersScheduledTime() throws {
    let data = Data(#"{"id":"deadline","title":"Deadline task","status":"PLANNED","priority":"NORMAL","durationMin":30,"startAt":"2026-09-07T16:00:00Z","dueAt":"2026-09-08T16:00:00Z"}"#.utf8)
    let task = try JSONDecoder().decode(NexdoTask.self, from: data)
    let now = try #require(ServerDate.parse("2026-09-07T20:00:00Z"))
    #expect(TaskQuery().results([task], timeZone: "America/Los_Angeles", now: now).map(\.id) == [task.id])
}

@Test func staleDueDateDoesNotHideScheduledTaskFromToday() throws {
    let scheduled = Data(#"{"id":"coupled","title":"Edited scheduled task","status":"PLANNED","priority":"NORMAL","durationMin":30,"startAt":"2026-09-07T16:00:00Z","dueAt":"2026-09-08T16:00:00Z"}"#.utf8)
    let task = try JSONDecoder().decode(NexdoTask.self, from: scheduled)
    let stale = Data(#"{"id":"uncoupled","title":"Deadline task","status":"PLANNED","priority":"NORMAL","durationMin":30,"startAt":null,"dueAt":"2026-09-07T16:00:00Z"}"#.utf8)
    let uncoupled = try JSONDecoder().decode(NexdoTask.self, from: stale)
    let now = try #require(ServerDate.parse("2026-09-07T20:00:00Z"))
    let query = TaskQuery()
    #expect(query.results([task, uncoupled], timeZone: "America/Los_Angeles", now: now).map(\.id) == ["coupled", "uncoupled"])
}

@Test func createSendsTodayAndEditPreservesSchedule() throws {
    let now = try #require(ServerDate.parse("2026-09-08T02:30:00Z"))
    let input = TaskSaveInput(title: "Today task", notes: "", durationMin: 30, isNew: true, now: now)
    #expect(ServerDate.day(try #require(input.startAt), timeZone: "America/Los_Angeles") == "2026-09-07")
    #expect(ServerDate.day(try #require(input.startAt), timeZone: "Asia/Kolkata") == "2026-09-08")
    let edit = TaskSaveInput(title: "Rename", notes: "", durationMin: 30, isNew: false, now: now)
    let json = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(edit)) as? [String: Any])
    #expect(json["startAt"] == nil)
}

@Test func tomorrowSelectionUsesCalendarDaysAcrossDST() throws {
    let now = try #require(ServerDate.parse("2026-03-07T20:00:00Z"))
    let zone = try #require(TimeZone(identifier: "America/Los_Angeles"))
    let tomorrow = TaskCreationDate.tomorrow.resolve(customDate: now, timeZone: zone, now: now)
    #expect(tomorrow.timeIntervalSince(now) == 23 * 3600)
    var query = TaskQuery()
    query.revealCreatedTask(scheduledAt: tomorrow, timeZone: zone.identifier, now: now)
    #expect(query.date == .tomorrow)
    let input = TaskSaveInput(title: "Tomorrow", notes: "", durationMin: 30, isNew: true, now: now, scheduledAt: tomorrow)
    #expect(input.startAt.flatMap(ServerDate.parse) == tomorrow)
}

@Test func customDateIsPersistedAndVisibleAfterCreation() throws {
    let now = try #require(ServerDate.parse("2026-09-07T20:30:00Z"))
    let custom = try #require(ServerDate.parse("2026-09-15T07:00:00Z"))
    let zone = try #require(TimeZone(identifier: "America/Los_Angeles"))
    let selected = TaskCreationDate.custom.resolve(customDate: custom, timeZone: zone, now: now)
    #expect(ServerDate.day(ISO8601DateFormatter().string(from: selected), timeZone: zone.identifier) == "2026-09-15")
    var query = TaskQuery()
    query.revealCreatedTask(scheduledAt: selected, timeZone: zone.identifier, now: now)
    #expect(query.date == .all)
}
