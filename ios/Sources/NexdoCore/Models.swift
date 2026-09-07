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
}
public struct ProfileResponse: Decodable, Sendable { public let user: Profile }
public struct PasswordResetResponse: Decodable, Sendable {
    public let message: String
    public let delivered: Bool
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
    public var energyLevel: String? = nil
    public var splittable: Bool? = nil
    public var critical: Bool? = nil
    public var minFocusMin: Int? = nil
    public var timeZone: String? = nil
    public var subtasks: [TaskStep]? = nil
    public var recurrence: TaskRecurrence? = nil
    public var isDone: Bool { status == "COMPLETED" }
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

        enum CodingKeys: String, CodingKey { case temperature = "temperature_2m" }
    }
    public let current: Current
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
        public struct AttentionItem: Decodable, Identifiable, Sendable {
            public let id: String
            public let label: String
            public let title: String
            public let explanation: String
            public let recommendedAction: String
            public let kind: String
            public let taskId: String?
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
    public struct Visual: Decodable, Sendable { public let summary: String; public let sections: [Section]?; public let tasks: [String]? }
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
