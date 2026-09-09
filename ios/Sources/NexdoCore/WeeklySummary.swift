import Foundation

public struct WeeklySummary: Decodable, Sendable {
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
    public let days: [Day]
    public let accomplishments: [Accomplishment]
    public let productivityInsight: String?
    public let limitations: [String]
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
