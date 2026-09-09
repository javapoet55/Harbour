import Foundation

public enum TaskDateFilter: String, CaseIterable, Identifiable {
    case all = "All", today = "Today", tomorrow = "Tomorrow", week = "This Week"
    public var id: String { rawValue }
    public var emptyTitle: String {
        switch self {
        case .all: "You’re all caught up"
        case .today: "Nothing scheduled for today"
        case .tomorrow: "Nothing scheduled for tomorrow"
        case .week: "Your week is clear"
        }
    }
}

public struct TaskQuery {
    public var date: TaskDateFilter = .today
    public var search = ""
    public var status = "Open"
    public var priority = "All"
    public var earliestFirst = true
    public init() {}

    /// Creation schedules a task for today. Reveal it without stale search filters.
    public mutating func revealCreatedTask(scheduledAt: Date? = nil, timeZone: String = TimeZone.current.identifier, now: Date = Date()) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
        let selected = scheduledAt ?? now
        if calendar.isDate(selected, inSameDayAs: now) { date = .today }
        else if let tomorrow = calendar.date(byAdding: .day, value: 1, to: now), calendar.isDate(selected, inSameDayAs: tomorrow) { date = .tomorrow }
        else { date = .all }
        search = ""
        status = "Open"
        priority = "All"
    }

    private func effectiveDate(for task: NexdoTask) -> Date? {
        return (task.startAt ?? task.dueAt).flatMap(ServerDate.parse)
    }

    public func results(_ tasks: [NexdoTask], timeZone: String, now: Date = Date(), calendar supplied: Calendar = Calendar(identifier: .gregorian)) -> [NexdoTask] {
        var calendar = supplied
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
        calendar.firstWeekday = 2 // Matches the existing calendar-view.ts Monday week boundary.
        let day = calendar.startOfDay(for: now)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: day) ?? day
        let interval: DateInterval? = switch date {
        case .all: nil
        case .today: calendar.dateInterval(of: .day, for: now)
        case .tomorrow: calendar.dateInterval(of: .day, for: tomorrow)
        case .week: calendar.dateInterval(of: .weekOfYear, for: now)
        }
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return tasks.filter { task in
            guard task.status != "CANCELLED" else { return false }
            guard status == "All" || (status == "Completed" ? task.isDone : !task.isDone) else { return false }
            guard priority == "All" || task.priority == priority else { return false }
            guard term.isEmpty || task.title.localizedStandardContains(term) || (task.notes?.localizedStandardContains(term) ?? false) else { return false }
            if date != .all {
                guard let interval, let due = effectiveDate(for: task), due >= interval.start, due < interval.end else { return false }
            }
            return true
        }.sorted { lhs, rhs in
            let left = effectiveDate(for: lhs) ?? .distantFuture
            let right = effectiveDate(for: rhs) ?? .distantFuture
            if left == right { return lhs.id < rhs.id }
            return earliestFirst ? left < right : left > right
        }
    }
}
