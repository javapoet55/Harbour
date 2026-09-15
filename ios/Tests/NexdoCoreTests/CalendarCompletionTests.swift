import Foundation
import Testing
@testable import NexdoCore

@Test func completedCalendarEventsRespectEndTimeAndSelectedDate() throws {
    let now = try #require(ServerDate.parse("2026-09-14T19:00:00Z"))
    func event(_ start: String, _ end: String) throws -> CalendarEvent {
        let data = try JSONSerialization.data(withJSONObject: ["id": "event", "title": "Appointment", "startAt": start, "endAt": end])
        return try JSONDecoder().decode(CalendarEvent.self, from: data)
    }
    let ended = try event("2026-09-14T17:00:00Z", "2026-09-14T18:00:00Z")
    let ongoing = try event("2026-09-14T18:00:00Z", "2026-09-14T20:00:00Z")
    let future = try event("2026-09-14T21:00:00Z", "2026-09-14T22:00:00Z")
    for (item, expected) in [(ended, true), (ongoing, false), (future, false)] {
        #expect(CalendarEventFilter.matches(item, day: "2026-09-14", timeZone: "America/Los_Angeles", completedOnly: true, now: now) == expected)
        #expect(!CalendarEventFilter.matches(item, day: "2026-09-13", timeZone: "America/Los_Angeles", completedOnly: true, now: now))
        #expect(CalendarEventFilter.matches(item, day: "2026-09-14", timeZone: "America/Los_Angeles", completedOnly: false, now: now))
    }
    let allDay = try event("2026-09-13T07:00:00Z", "2026-09-14T07:00:00Z")
    #expect(CalendarEventFilter.matches(allDay, day: "2026-09-13", timeZone: "America/Los_Angeles", completedOnly: true, now: now))
    #expect(!CalendarEventFilter.matches(allDay, day: "2026-09-14", timeZone: "America/Los_Angeles", completedOnly: true, now: now))
    #expect(CalendarEventFilter.matches(ongoing, day: "2026-09-14", timeZone: "America/Los_Angeles", completedOnly: true, now: try #require(ServerDate.parse(ongoing.endAt))))
}

@Test func completedCalendarTasksRespectStatusAndDate() throws {
    let dates = CalendarDates(timeZone: "America/Los_Angeles")
    let day = try #require(ServerDate.parse("2026-09-14T19:00:00Z"))
    for status in ["PLANNED", "COMPLETED", "CANCELLED"] {
        let data = try JSONSerialization.data(withJSONObject: ["id": status, "title": "Task", "status": status, "priority": "NORMAL", "durationMin": 30, "startAt": "2026-09-14T17:00:00Z"])
        let task = try JSONDecoder().decode(NexdoTask.self, from: data)
        #expect(dates.taskOccurs(task, on: day, completedOnly: true) == (status == "COMPLETED"))
        #expect(dates.taskOccurs(task, on: day) == (status == "PLANNED"))
        #expect(!dates.taskOccurs(task, on: dates.addingDays(-1, to: day), completedOnly: true))
    }
}
