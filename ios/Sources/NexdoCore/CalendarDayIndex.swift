import Foundation

/// Parse each timestamp once per data refresh, outside the UI's rendering path.
public struct CalendarDayIndex: Sendable {
    public var tasks: [String: [NexdoTask]] = [:]
    public var events: [String: [CalendarEvent]] = [:]
    public init() {}
    public init(days: [String], timeZone: String, tasks: [NexdoTask], events: [CalendarEvent]) {
        let validDays = Set(days)
        let plain = ISO8601DateFormatter()
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let dayFormat = DateFormatter()
        dayFormat.locale = Locale(identifier: "en_US_POSIX")
        dayFormat.calendar = Calendar(identifier: .gregorian)
        dayFormat.dateFormat = "yyyy-MM-dd"
        let zone = TimeZone(identifier: timeZone) ?? .current
        func parse(_ raw: String) -> Date? { fractional.date(from: raw) ?? plain.date(from: raw) }
        func day(_ date: Date, in timeZone: TimeZone) -> String {
            dayFormat.timeZone = timeZone
            return dayFormat.string(from: date)
        }
        for task in tasks {
            if Task.isCancelled { return }
            let keys = Set([task.startAt, task.dueAt].compactMap { $0 }.compactMap(parse).map { day($0, in: zone) })
            for key in keys where validDays.contains(key) { self.tasks[key, default: []].append(task) }
        }
        for event in events {
            if Task.isCancelled { return }
            guard let start = parse(event.startAt), let end = parse(event.endAt), end > start else { continue }
            let eventZone = event.isDeviceCalendarEvent && event.allDay == true
                ? (event.timeZone.flatMap(TimeZone.init(identifier:)) ?? zone) : zone
            let first = day(start, in: eventZone)
            let last = day(end.addingTimeInterval(-0.001), in: eventZone)
            for key in days where key >= first && key <= last { self.events[key, default: []].append(event) }
        }
    }
}
