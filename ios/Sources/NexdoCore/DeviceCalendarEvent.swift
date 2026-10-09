import Foundation

/// A device event has no server record. Its identifier includes the recurrence occurrence.
public enum DeviceCalendarEvent {
    public static func make(identifier: String, calendarID: String, title: String, start: Date, end: Date,
                            allDay: Bool, timeZone: String, notes: String? = nil, location: String? = nil) -> CalendarEvent {
        let format = ISO8601DateFormatter()
        return CalendarEvent(id: "apple-device:\(calendarID):\(identifier):\(start.timeIntervalSince1970)", title: title,
                             startAt: format.string(from: start),
                             endAt: format.string(from: end), allDay: allDay,
                             notes: notes, location: location, timeZone: timeZone, source: "apple-device",
                             connectionId: nil, completedAt: nil)
    }
}

extension CalendarEvent {
    public var isDeviceCalendarEvent: Bool { source == "apple-device" }
}
