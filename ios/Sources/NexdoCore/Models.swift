import Foundation

public enum ProfileName {
    public static func firstName(from fullName: String) -> String? {
        fullName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: { $0.isWhitespace })
            .first
            .map(String.init)
    }
}

public struct Profile: Decodable, Sendable {
    public let id: String
    public let name: String
    public let email: String
    public let timeZone: String
    public var photo: String? = nil
    public var preference: ProfilePreferences? = nil
    public var nextAction: NextActionPreference? = nil
}
public struct ProfileResponse: Decodable, Sendable { public let user: Profile }
public struct VoiceUsage: Codable, Equatable, Sendable {
    public let month:String
    public let usedSeconds:Int
    public let limitMinutes:Int
    public let remainingSeconds:Int
    public let asOf:String
    public var progress:Double {min(1,max(0,Double(usedSeconds)/Double(max(1,limitMinutes*60))))}
    /// A billing month is a calendar label, not an instant to convert to device time.
    public static func monthName(_ value: String, locale: Locale = .current) -> String? {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0].count == 4, parts[1].count == 2,
              let year = Int(parts[0]), year > 0,
              let month = Int(parts[1]), (1...12).contains(month) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = Calendar(identifier: .gregorian)
        return formatter.monthSymbols[month - 1]
    }
}
public struct PasswordResetResponse: Decodable, Sendable {
    public let message: String
    public let delivered: Bool
}
public struct TaskCategoryMetadata: Decodable, Sendable {
    public let name: String
}
public struct NexdoTask: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let status: String
    public let priority: String
    public let durationMin: Int
    public let notes: String?
    public let startAt: String?
    public let dueAt: String?
    public var category: TaskCategoryMetadata? = nil
    public var completedAt: String? = nil
    public var projectId: String? = nil
    public var energyLevel: String? = nil
    public var splittable: Bool? = nil
    public var critical: Bool? = nil
    public var minFocusMin: Int? = nil
    public var timeZone: String? = nil
    public var subtasks: [TaskStep]? = nil
    public var recurrence: TaskRecurrence? = nil
    public var reminderAt: String? = nil
    public var lifeReminderType: String? = nil
    public var lifeReminderConfidence: Double? = nil
    public var originalUserText: String? = nil
    public var isDone: Bool { status == "COMPLETED" }
    public var lifeReminderLabel: String? {
        switch lifeReminderType {
        case "returnItem": "Return"
        case "bill": "Bill"
        case "expiration": "Expires"
        case "maintenance": "Maintenance"
        case "subscription": "Subscription"
        case "renewal": "Renewal"
        case "general": "Reminder"
        default: nil
        }
    }
}
public struct TasksResponse: Decodable, Sendable {
    public let tasks: [NexdoTask]
    //public let timeZone: String
    public let timeZone: String?
}
public struct CalendarEvent: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let startAt: String
    public let endAt: String
    public let allDay: Bool?
}
public struct Agenda: Decodable, Sendable {
    public struct Range: Decodable, Sendable { public let days: [String] }
    public let timeZone: String
    public let range: Range
    public let tasks: [NexdoTask]
    public let events: [CalendarEvent]
    public let overdue: [NexdoTask]
}
public struct WeatherResponse: Decodable, Sendable {
    public struct Current: Decodable, Sendable {
        public let temperature: Double
        public let weatherCode: Int?

        enum CodingKeys: String, CodingKey {
            case temperature = "temperature_2m"
            case weatherCode = "weather_code"
        }

        public var conditionSymbol: String {
            switch weatherCode ?? -1 {
            case 0: return "sun.max.fill"
            case 1, 2: return "cloud.sun.fill"
            case 3: return "cloud.fill"
            case 45, 48: return "cloud.fog.fill"
            case 51...57: return "cloud.drizzle.fill"
            case 61...67, 80...82: return "cloud.rain.fill"
            case 71...77, 85, 86: return "cloud.snow.fill"
            case 95...99: return "cloud.bolt.rain.fill"
            default: return "thermometer.medium"
            }
        }
    }
    public let current: Current
    public let daily: Daily?
    public let timezone: String?

    public struct Daily: Decodable, Sendable {
        public let time: [String]
        public let weatherCode: [Int?]
        public let high: [Double?]
        public let low: [Double?]
        public let rain: [Int?]
        enum CodingKeys: String, CodingKey {
            case time
            case weatherCode = "weather_code"
            case high = "temperature_2m_max"
            case low = "temperature_2m_min"
            case rain = "precipitation_probability_max"
        }
        public var days: [Day] {
            time.indices.prefix(5).map { index in
                Day(id: time[index], code: weatherCode.indices.contains(index) ? weatherCode[index] : nil,
                    high: high.indices.contains(index) ? high[index] : nil,
                    low: low.indices.contains(index) ? low[index] : nil,
                    rain: rain.indices.contains(index) ? rain[index] : nil)
            }
        }
    }
    public struct Day: Identifiable, Sendable {
        public let id: String
        public let code: Int?
        public let high: Double?
        public let low: Double?
        public let rain: Int?
        public var symbol: String { Current(temperature: 0, weatherCode: code).conditionSymbol }
        public var condition: String {
            switch code ?? -1 {
            case 0: "Clear"
            case 1, 2: "Partly cloudy"
            case 3: "Cloudy"
            case 45, 48: "Fog"
            case 51...57: "Drizzle"
            case 61...67, 80...82: "Rain"
            case 71...77, 85, 86: "Snow"
            case 95...99: "Thunderstorms"
            default: "Conditions unavailable"
            }
        }
    }
}
public struct ScheduleIntelligenceResponse: Decodable, Sendable {
    public struct Today: Decodable, Sendable {
        public struct TimelineItem: Decodable, Identifiable, Sendable {
            public let id: String
            public let sourceId: String
            public let kind: String
            public let title: String
            public let startAt: String
            public let endAt: String?
            public let allDay: Bool
            public let deadlineOnly: Bool
            public let past: Bool
        }
        public struct AttentionItem: Decodable, Identifiable, Sendable, Hashable {
            public let id: String
            public let label: String
            public let title: String
            public let explanation: String
            public let recommendedAction: String
            public let kind: String
            public let taskId: String?
            public let taskIds: [String]?
            public let requiredMinutes: Int?
            public let deadlineAt: String?
        }
        public struct Recommendation: Decodable, Sendable {
            public let title: String
            public let explanation: String
            public let additionalAdvice: String?
            public let kind: String
            public let taskId: String?
        }

        public let day: String
        public let timeZone: String
        public let commitments: Int
        public let appointments: Int
        public let tasks: Int
        public let overdue: Int
        public let availableMinutes: Int
        public let timeline: [TimelineItem]
        public let attention: [AttentionItem]
        public let recommendation: Recommendation
    }

    public let today: Today
}
public struct AssistantTurn: Decodable, Sendable {
    public let createdTaskId: String?
    public struct Executive: Decodable, Sendable {
        public struct Change: Decodable, Sendable {
            public let taskId: String
            public let title: String
            public let before: String?
            public let after: String
            public let durationMin: Int
            public let reason: String
        }
        public let proposedScheduleChanges: [Change]
    }
    public struct Section: Decodable, Sendable { public let title: String; public let items: [String] }
    public struct Visual: Decodable, Sendable { public let summary: String; public let sections: [Section]?; public let tasks: [String]?; public var appointments: [String]? = nil; public var overdue: [String]? = nil; public var next: String? = nil }
    public struct Confirmation: Decodable, Sendable { public let actionId: String; public let prompt: String }
    public let spoken: String
    public let visual: Visual
    public let contextActionId: String?
    public let confirmation: Confirmation?
    public let executive: Executive?
}
public struct AssistantRequest: Encodable, Sendable {
    public let transcript: String
    public let contextActionId: String?
    public let confirmActionId: String?
    public let rejectActionId: String?
    public init(transcript: String, contextActionId: String? = nil, confirmActionId: String? = nil, rejectActionId: String? = nil) {
        self.transcript = transcript
        self.contextActionId = contextActionId
        self.confirmActionId = confirmActionId
        self.rejectActionId = rejectActionId
    }
}
public enum ServerDate {
    public static func time(_ value: String, timeZone: String) -> String {
        guard let date = parse(value), let zone = TimeZone(identifier: timeZone) else { return "Time unavailable" }
        let formatter = DateFormatter()
        formatter.timeZone = zone
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    // An event ending exactly at midnight does not occupy the following day.
    public static func occurs(_ event: CalendarEvent, on day: String, timeZone: String) -> Bool {
        guard let start = self.day(event.startAt, timeZone: timeZone),
              let end = parse(event.endAt), let beginning = parse(event.startAt), end > beginning else { return false }
        let inclusiveEnd = ISO8601DateFormatter().string(from: end.addingTimeInterval(-0.001))
        guard let last = self.day(inclusiveEnd, timeZone: timeZone) else { return false }
        return start <= day && last >= day
    }
    public static func parse(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    public static func day(_ value: String, timeZone: String) -> String? {
        guard let date = parse(value), let zone = TimeZone(identifier: timeZone) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

public struct TaskStep: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var completedAt: String?
    public var sortOrder: Int
}

public struct TaskRecurrence: Codable, Equatable, Sendable {
    public var frequency: String
    public var interval: Int
    public var byWeekday: String?
    public var until: String?
    public var count: Int?
}
