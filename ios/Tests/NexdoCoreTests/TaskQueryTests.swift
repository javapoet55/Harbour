import Foundation
import Testing
@testable import NexdoCore

private func fixture(_ id: String, due: String?, status: String = "PLANNED", notes: String? = nil) throws -> NexdoTask {
    let data = try JSONSerialization.data(withJSONObject: ["id": id, "title": id, "status": status, "priority": "HIGH", "durationMin": 30, "dueAt": due as Any? ?? NSNull(), "notes": notes as Any? ?? NSNull()])
    return try JSONDecoder().decode(NexdoTask.self, from: data)
}

@Test func taskSnapshotAfterCreationKeepsWeekRowsAndBadgeCountsConsistent() throws {
    let now = try #require(ServerDate.parse("2026-09-14T16:00:00Z"))
    let tasks = try [fixture("existing", due: "2026-09-14T17:00:00Z"), fixture("created", due: "2026-09-16T17:00:00Z"), fixture("done", due: "2026-09-14T18:00:00Z", status: "COMPLETED")]
    var query = TaskQuery(); query.revealCreatedTask(scheduledAt: ServerDate.parse("2026-09-16T17:00:00Z"), timeZone: "America/Los_Angeles", now: now)
    query.date = .week; query.status = "All"
    let snapshot = query.snapshot(tasks, timeZone: "America/Los_Angeles", now: now)
    #expect(snapshot.tasks.map(\.id) == ["existing", "created", "done"])
    #expect(snapshot.sections.flatMap(\.tasks).map(\.id) == snapshot.tasks.map(\.id))
    #expect(snapshot.counts[.today] == 2)
    #expect(snapshot.counts[.week] == 3)
    #expect(snapshot.counts[.tomorrow, default: 0] == 0)
    query.search = "created"
    #expect(query.snapshot(tasks, timeZone: "America/Los_Angeles", now: now).counts[.week] == 1)
}

@Test func largeTaskSnapshotHandlesRepeatedDateSwitches() throws {
    let now = try #require(ServerDate.parse("2026-09-14T16:00:00Z"))
    let tasks = try (0..<2000).map { try fixture("task-\($0)", due: "2026-09-14T17:00:00.000Z", status: $0 % 2 == 0 ? "PLANNED" : "COMPLETED") }
    var query = TaskQuery(); query.status = "All"
    let start = ContinuousClock.now
    for date in [TaskDateFilter.today, .week, .tomorrow, .all, .week] {
        query.date = date
        let snapshot = query.snapshot(tasks, timeZone: "America/Los_Angeles", now: now)
        #expect(snapshot.tasks.count == (date == .tomorrow ? 0 : 2000))
        #expect(snapshot.counts[.week] == 2000)
    }
    print("2,000 tasks across five filter switches: \(start.duration(to: .now))")
}

@Test func openTasksPrecedeCompletedAcrossEveryDateFilterAndSortDirection() throws {
    let now = try #require(ServerDate.parse("2026-09-14T16:00:00Z"))
    let tasks = try [
        fixture("done-today", due: "2026-09-14T15:00:00Z", status: "COMPLETED"),
        fixture("open-today", due: "2026-09-14T18:00:00Z"),
        fixture("done-tomorrow", due: "2026-09-15T15:00:00Z", status: "COMPLETED"),
        fixture("open-tomorrow", due: "2026-09-15T18:00:00Z"),
        fixture("undated", due: nil)
    ]
    for filter in TaskDateFilter.allCases {
        for ascending in [true, false] {
            var query = TaskQuery(); query.status = "All"; query.date = filter; query.earliestFirst = ascending
            let result = query.results(tasks, timeZone: "America/Los_Angeles", now: now)
            let sections = query.sections(tasks, timeZone: "America/Los_Angeles", now: now)
            #expect(sections.flatMap(\.tasks).map(\.id) == result.map(\.id))
            #expect(result.map(\.isDone) == result.filter { !$0.isDone }.map(\.isDone) + result.filter(\.isDone).map(\.isDone))
            #expect(Set(sections.map(\.id)).count == sections.count)
            if filter == .all || filter == .week {
                #expect(result.first?.id == (filter == .all || ascending ? "open-today" : "open-tomorrow"))
            }
            query.status = "Completed"
            #expect(query.sections(tasks, timeZone: "America/Los_Angeles", now: now).allSatisfy { $0.isDone })
        }
    }
}

@Test func filtersAtAccountMidnightAndKeepsUndatedTasksInAll() throws {
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
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["today", "before", "tomorrow"])
}

@Test func historyRangesRetainUpcomingOpenTasks() throws {
    let now = try #require(ServerDate.parse("2026-09-14T16:00:00Z"))
    let tasks = try [
        fixture("today", due: "2026-09-15T06:59:59Z"),
        fixture("yesterday", due: "2026-09-14T06:59:59Z"),
        fixture("first", due: "2026-09-01T07:00:00Z"),
        fixture("previous", due: "2026-09-01T06:59:59Z"),
        fixture("future", due: "2026-09-15T07:00:00Z"),
        fixture("undated", due: nil)
    ]
    var query = TaskQuery(); query.date = .all
    #expect(query.historyRange == .thisMonth)
    query.historyRange = .lastTwoWeeks
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["today", "yesterday", "first", "future", "undated"])
    query.historyRange = .thisMonth
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["today", "yesterday", "first", "future"])
    query.historyRange = .lastMonth
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["previous", "future", "undated"])
}

@Test func historyCalendarBoundariesHandleDSTLeapYearAndYearChange() throws {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = try #require(TimeZone(identifier: "America/Los_Angeles"))
    let march = try #require(ServerDate.parse("2026-03-10T18:00:00Z"))
    let fortnight = TaskHistoryRange.lastTwoWeeks.interval(now: march, calendar: calendar)
    #expect(calendar.dateComponents([.day], from: fortnight.start, to: fortnight.end).day == 14)
    #expect(fortnight.duration == Double(14 * 86400 - 3600))
    let leapMarch = try #require(ServerDate.parse("2024-03-15T18:00:00Z"))
    let february = TaskHistoryRange.lastMonth.interval(now: leapMarch, calendar: calendar)
    #expect(calendar.dateComponents([.day], from: february.start, to: february.end).day == 29)
    let january = try #require(ServerDate.parse("2026-01-10T18:00:00Z"))
    let december = TaskHistoryRange.lastMonth.interval(now: january, calendar: calendar)
    #expect(calendar.component(.year, from: december.start) == 2025)
    #expect(calendar.component(.month, from: december.start) == 12)
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

@Test func allKeepsWednesdayAfterTomorrowAcrossHistoryRanges() throws {
    let now = try #require(ServerDate.parse("2026-09-14T16:00:00Z"))
    let tasks = try [
        fixture("wednesday", due: "2026-09-16T17:00:00Z"),
        fixture("tomorrow", due: "2026-09-15T17:00:00Z"),
        fixture("today", due: "2026-09-14T17:00:00Z"),
        fixture("completed", due: "2026-09-14T18:00:00Z", status: "COMPLETED")
    ]
    var query = TaskQuery(); query.date = .all; query.status = "All"
    for range in TaskHistoryRange.allCases {
        query.historyRange = range
        let snapshot = query.snapshot(tasks, timeZone: "America/Los_Angeles", now: now)
        let ids = snapshot.sections.flatMap(\.tasks).map(\.id)
        #expect(ids == (range == .lastMonth ? ["tomorrow", "wednesday"] : ["today", "tomorrow", "wednesday", "completed"]))
    }
}

@Test func allDefaultsToOpenTasksWithinFullCurrentMonth() throws {
    let now = try #require(ServerDate.parse("2026-09-14T16:00:00Z"))
    var query = TaskQuery(); query.date = .all
    #expect(query.historyRange == .thisMonth)
    #expect(query.status == "Open")
    let tasks = try [
        fixture("first", due: "2026-09-01T07:00:00Z"),
        fixture("today", due: "2026-09-14T17:00:00Z"),
        fixture("last", due: "2026-10-01T06:59:59Z"),
        fixture("next-month", due: "2026-10-01T07:00:00Z"),
        fixture("previous", due: "2026-09-01T06:59:59Z"),
        fixture("done", due: "2026-09-14T18:00:00Z", status: "COMPLETED"),
        fixture("undated", due: nil)
    ]
    #expect(query.results(tasks, timeZone: "America/Los_Angeles", now: now).map(\.id) == ["today", "first", "last"])
}
