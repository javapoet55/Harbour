import Foundation

public enum CalendarSearch {
    public static func matches(_ title: String, query: String) -> Bool {
        let keyword = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return keyword.isEmpty || title.localizedStandardContains(keyword)
    }
}

/// Calendar arithmetic in the account timezone, shared by all native calendar modes.
public struct CalendarDates {
    public let calendar: Calendar
    public init(timeZone: String) {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: timeZone) ?? .current
        value.firstWeekday = 2
        calendar = value
    }
    public func key(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = calendar; f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
    public func addingDays(_ count: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: count, to: date)!
    }
    public func week(_ date: Date) -> [Date] {
        let start = addingDays(-((calendar.component(.weekday, from: date) + 5) % 7), to: calendar.startOfDay(for: date))
        return (0..<7).map { addingDays($0, to: start) }
    }
    public func month(_ date: Date) -> [Date] {
        let first = calendar.dateInterval(of: .month, for: date)!.start
        let offset = calendar.component(.weekday, from: first) - 1
        let start = addingDays(-offset, to: first)
        let count = ((offset + calendar.range(of: .day, in: .month, for: first)!.count + 6) / 7) * 7
        return (0..<count).map { addingDays($0, to: start) }
    }
    public func taskOccurs(_ task: NexdoTask, on date: Date, completedOnly: Bool = false) -> Bool {
        guard task.isDone == completedOnly, task.status != "CANCELLED" else { return false }
        return [task.startAt, task.dueAt].compactMap { $0 }.contains { ServerDate.day($0, timeZone: calendar.timeZone.identifier) == key(date) }
    }
}

/// Events have no completion flag: their exclusive end time determines completion.
public enum CalendarEventFilter {
    public static func matches(_ event: CalendarEvent, day: String, timeZone: String, completedOnly: Bool, now: Date = Date()) -> Bool {
        guard ServerDate.occurs(event, on: day, timeZone: timeZone) else { return false }
        guard completedOnly else { return true }
        guard let end = ServerDate.parse(event.endAt) else { return false }
        return end <= now
    }
}
