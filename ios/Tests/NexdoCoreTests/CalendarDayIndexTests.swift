import Foundation
import Testing
@testable import NexdoCore

@Test func calendarIndexMatchesExistingDateRules() throws {
    let dates = CalendarDates(timeZone: "America/Los_Angeles")
    let days = dates.month(ServerDate.parse("2026-03-08T12:00:00Z")!).map(dates.key)
    let events = [
        DeviceCalendarEvent.make(identifier: "all-day", calendarID: "a", title: "Trip",
            start: ServerDate.parse("2026-03-07T08:00:00Z")!, end: ServerDate.parse("2026-03-09T07:00:00Z")!,
            allDay: true, timeZone: "America/Los_Angeles"),
        DeviceCalendarEvent.make(identifier: "timed", calendarID: "a", title: "Meeting",
            start: ServerDate.parse("2026-03-08T07:00:00Z")!, end: ServerDate.parse("2026-03-08T08:00:00Z")!,
            allDay: false, timeZone: "America/Los_Angeles")
    ]
    let task = try JSONDecoder().decode(NexdoTask.self, from: Data("""
    {"id":"task","title":"Task","status":"PLANNED","priority":"NORMAL","durationMin":30,
     "startAt":"2026-03-08T17:00:00Z","dueAt":"2026-03-08T20:00:00Z"}
    """.utf8))
    for zone in ["America/Los_Angeles", "Asia/Tokyo"] {
        let index = CalendarDayIndex(days: days, timeZone: zone, tasks: [task], events: events)
        for day in days {
            #expect((index.events[day] ?? []).map(\.id) == events.filter { ServerDate.occurs($0, on: day, timeZone: zone) }.map(\.id))
        }
        #expect(index.tasks.values.allSatisfy { $0.count == 1 })
    }
}

@Test func populatedMonthCanBeIndexedWithoutBlockingDateSelection() {
    let dates = CalendarDates(timeZone: "America/Los_Angeles")
    let first = ServerDate.parse("2026-10-01T16:00:00Z")!
    let events = (0..<2000).map { i in
        DeviceCalendarEvent.make(identifier: "\(i)", calendarID: "a", title: "Event \(i)",
            start: first.addingTimeInterval(Double(i % 31) * 86400),
            end: first.addingTimeInterval(Double(i % 31) * 86400 + 3600),
            allDay: false, timeZone: "America/Los_Angeles")
    }
    let days = dates.month(first).map(dates.key)
    let start = Date()
    let index = CalendarDayIndex(days: days, timeZone: dates.calendar.timeZone.identifier, tasks: [], events: events)
    #expect(index.events.values.reduce(0) { $0 + $1.count } == events.count)
    // Selecting different dates uses dictionary lookups; no timestamps are reparsed.
    for _ in 0..<100 { for day in days { _ = index.events[day]?.count } }
    #expect(Date().timeIntervalSince(start) < 5)
}
