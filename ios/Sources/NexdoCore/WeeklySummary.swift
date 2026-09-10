import Foundation

public struct WeeklySummary: Decodable, Sendable {
    public struct TaskGroups: Decodable, Sendable {
        public let planned: [NexdoTask]
        public let completed: [NexdoTask]
        public let overdue: [NexdoTask]
    }
    public struct Metrics: Decodable, Sendable {
        public let completed: Int
        public let planned: Int
        public let completionRate: Int?
        public let overdue: Int?
        public let focusMinutes: Int?
    }
    public struct Day: Decodable, Identifiable, Sendable {
        public let date: String
        public let planned: Int
        public let completed: Int
        public var id: String { date }
    }
    public struct Accomplishment: Decodable, Identifiable, Sendable {
        public let id: String
        public let title: String
        public let priority: String
    }
    public let timeZone: String
    public let start: String
    public let end: String
    public let generatedAt: String
    public let headline: String
    public let summary: String
    public let metrics: Metrics
    // Optional while the app and backend updates roll out independently.
    public let taskGroups: TaskGroups?
    public let days: [Day]
    public let accomplishments: [Accomplishment]
    public let productivityInsight: String?
    public let limitations: [String]

    public var taskRangeLabel: String {
        let parser = DateFormatter()
        parser.calendar = WeeklySummaryDates.calendar(timeZoneID: timeZone)
        parser.timeZone = parser.calendar.timeZone
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let first = parser.date(from: start), let last = parser.date(from: end) else { return "\(start) – \(end)" }
        parser.dateFormat = "EEE, MMM d"
        return "\(parser.string(from: first)) – \(parser.string(from: last))"
    }

    /// Compatibility with servers that do not embed taskGroups yet. Use a fresh
    /// task response and the same cohort/cutoff rules as buildWeeklySummary.
    public func taskGroups(from tasks: [NexdoTask]) throws -> TaskGroups {
        let calendar = WeeklySummaryDates.calendar(timeZoneID: timeZone)
        let parser = DateFormatter()
        parser.calendar = calendar
        parser.timeZone = calendar.timeZone
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let first = parser.date(from: start), let last = parser.date(from: end),
              let endExclusive = calendar.date(byAdding: .day, value: 1, to: last),
              let generated = ServerDate.parse(generatedAt) else { throw APIError.invalidResponse }
        let cutoff = min(endExclusive, generated)
        let planned = tasks.filter {
            guard let date = ($0.startAt ?? $0.dueAt).flatMap(ServerDate.parse) else { return false }
            return date >= first && date < endExclusive
        }.sorted { $0.id < $1.id }
        let completed = planned.filter {
            guard let date = $0.completedAt.flatMap(ServerDate.parse) else { return false }
            return date >= first && date < cutoff
        }
        let overdue = planned.filter {
            guard let due = $0.dueAt.flatMap(ServerDate.parse), due < cutoff else { return false }
            return $0.completedAt.flatMap(ServerDate.parse).map { $0 > cutoff } ?? true
        }
        return TaskGroups(planned: planned, completed: completed, overdue: overdue)
    }

}

public enum WeeklySummaryDates {
    public static func calendar(timeZoneID: String) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.timeZone = TimeZone(identifier: timeZoneID) ?? .current
        calendar.firstWeekday = 2
        return calendar
    }

    public static func startOfWeek(containing date: Date, timeZoneID: String) -> Date {
        let calendar = calendar(timeZoneID: timeZoneID)
        let day = calendar.startOfDay(for: date)
        let weekday = calendar.component(.weekday, from: day)
        return calendar.date(byAdding: .day, value: weekday == 1 ? -6 : 2 - weekday, to: day)!
    }

    public static func addingWeek(_ amount: Int, to date: Date, timeZoneID: String) -> Date {
        calendar(timeZoneID: timeZoneID).date(byAdding: .weekOfYear, value: amount, to: date)!
    }

    public static func apiDay(_ date: Date, timeZoneID: String) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar(timeZoneID: timeZoneID)
        formatter.timeZone = formatter.calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
