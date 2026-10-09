import Foundation
import Testing
@testable import NexdoCore

private func deviceEvent(start: String, end: String, allDay: Bool = false, identifier: String = "series", calendarID: String = "personal") -> CalendarEvent {
    DeviceCalendarEvent.make(identifier: identifier, calendarID: calendarID, title: "Apple appointment",
                             start: ServerDate.parse(start)!, end: ServerDate.parse(end)!, allDay: allDay,
                             timeZone: "America/Los_Angeles")
}

@Test func appleTimedEventsAppearOnTheProfileDay() {
    let event = deviceEvent(start: "2026-10-10T01:00:00Z", end: "2026-10-10T02:00:00Z")
    #expect(CalendarEventFilter.matches(event, day: "2026-10-09", timeZone: "America/Los_Angeles", completedOnly: false))
    #expect(!CalendarEventFilter.matches(event, day: "2026-10-10", timeZone: "America/Los_Angeles", completedOnly: false))
    #expect(CalendarEventFilter.matches(event, day: "2026-10-10", timeZone: "Asia/Kolkata", completedOnly: false))
    #expect(event.isDeviceCalendarEvent)
    #expect(event.connectionId == nil)
}

@Test func appleAllDayEventsKeepFloatingDatesAcrossTimeZonesAndDST() {
    let event = deviceEvent(start: "2026-03-07T08:00:00Z", end: "2026-03-09T07:00:00Z", allDay: true)
    for zone in ["America/Los_Angeles", "Pacific/Honolulu", "Asia/Tokyo"] {
        #expect(!ServerDate.occurs(event, on: "2026-03-06", timeZone: zone))
        #expect(ServerDate.occurs(event, on: "2026-03-07", timeZone: zone))
        #expect(ServerDate.occurs(event, on: "2026-03-08", timeZone: zone))
        #expect(!ServerDate.occurs(event, on: "2026-03-09", timeZone: zone))
    }
    #expect(ServerDate.parse(event.startAt) != nil) // Details and Open in Calendar need an instant.
}

@Test func appleRecurringOccurrencesAndDifferentCalendarsHaveDistinctIdentity() {
    let first = deviceEvent(start: "2026-10-09T12:00:00Z", end: "2026-10-09T13:00:00Z")
    let repeatOccurrence = deviceEvent(start: "2026-10-10T12:00:00Z", end: "2026-10-10T13:00:00Z")
    let otherCalendar = deviceEvent(start: "2026-10-09T12:00:00Z", end: "2026-10-09T13:00:00Z", calendarID: "work")
    #expect(Set([first.id, repeatOccurrence.id, otherCalendar.id]).count == 3)
}

@Test func appleMidnightEndDoesNotAddAnotherDayAndPastDoesNotMeanCompleted() {
    let event = deviceEvent(start: "2026-10-09T23:00:00-07:00", end: "2026-10-10T00:00:00-07:00")
    #expect(ServerDate.occurs(event, on: "2026-10-09", timeZone: "America/Los_Angeles"))
    #expect(!ServerDate.occurs(event, on: "2026-10-10", timeZone: "America/Los_Angeles"))
    #expect(!CalendarEventFilter.matches(event, day: "2026-10-09", timeZone: "America/Los_Angeles", completedOnly: true))
}
