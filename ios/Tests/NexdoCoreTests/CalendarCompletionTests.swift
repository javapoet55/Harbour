import Foundation
import Testing
@testable import NexdoCore

@Test func completedCalendarEventsRespectSavedStatusAndSelectedDate() throws {
    for completed in [false, true] {
        var payload = ["id": "event", "title": "Appointment", "startAt": "2026-09-14T17:00:00Z", "endAt": "2026-09-14T18:00:00Z"]
        if completed { payload["completedAt"] = "2026-09-14T19:00:00Z" }
        let item = try JSONDecoder().decode(CalendarEvent.self, from: JSONSerialization.data(withJSONObject: payload))
        #expect(CalendarEventFilter.matches(item, day: "2026-09-14", timeZone: "America/Los_Angeles", completedOnly: true) == completed)
        #expect(!CalendarEventFilter.matches(item, day: "2026-09-13", timeZone: "America/Los_Angeles", completedOnly: true))
        #expect(CalendarEventFilter.matches(item, day: "2026-09-14", timeZone: "America/Los_Angeles", completedOnly: false))
    }
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
