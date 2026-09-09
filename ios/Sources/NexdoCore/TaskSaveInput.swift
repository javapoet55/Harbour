import Foundation

/// The existing create endpoint assigns both startAt and dueAt from startAt.
/// Sending the current instant schedules new tasks on today in the account zone,
/// even when the phone is traveling. Edits omit it to preserve existing schedules.
public struct TaskSaveInput: Encodable, Sendable {
    public let projectId: String?
    public let title: String
    public let notes: String
    public let durationMin: Int
    public let startAt: String?

    public init(title: String, notes: String, durationMin: Int, isNew: Bool, now: Date = Date(), scheduledAt: Date? = nil, projectId: String? = nil) {
        self.projectId = projectId
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        self.notes = notes
        self.durationMin = durationMin
        self.startAt = isNew ? ISO8601DateFormatter().string(from: scheduledAt ?? now) : nil
    }
}


public enum TaskCreationDate: String, CaseIterable, Identifiable, Sendable {
    case today = "Today", tomorrow = "Tomorrow", custom = "Select Date"
    public var id: String { rawValue }

    public func resolve(customDate: Date, timeZone: TimeZone, now: Date = Date()) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        switch self {
        case .today: return now
        case .tomorrow: return calendar.date(byAdding: .day, value: 1, to: now) ?? now
        case .custom:
            let clock = calendar.dateComponents([.hour, .minute], from: now)
            return calendar.date(bySettingHour: clock.hour ?? 9, minute: clock.minute ?? 0, second: 0, of: customDate) ?? customDate
        }
    }
}
