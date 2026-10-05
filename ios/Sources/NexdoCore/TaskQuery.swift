import Foundation

public struct TaskResultSection: Identifiable {
    public var id: String { "\(isDone)-\(date.timeIntervalSinceReferenceDate)" }
    public let date: Date
    public let isDone: Bool
    public let tasks: [NexdoTask]
}

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

public enum TaskHistoryRange: String, CaseIterable, Identifiable {
    case allTime = "All time", lastTwoWeeks = "Last 2 weeks", thisMonth = "This Month", lastMonth = "Last Month"
    public var id: String { rawValue }

    public func interval(now: Date, calendar: Calendar) -> DateInterval {
        let today = calendar.startOfDay(for: now)
        let end = calendar.date(byAdding: .day, value: 1, to: today)!
        switch self {
        case .allTime:
            return DateInterval(start: .distantPast, end: .distantFuture)
        case .lastTwoWeeks:
            return DateInterval(start: calendar.date(byAdding: .day, value: -13, to: today)!, end: end)
        case .thisMonth:
            return calendar.dateInterval(of: .month, for: today)!
        case .lastMonth:
            let monthStart = calendar.dateInterval(of: .month, for: today)!.start
            return DateInterval(start: calendar.date(byAdding: .month, value: -1, to: monthStart)!, end: monthStart)
        }
    }
}

public struct TaskQuery {
    public var date: TaskDateFilter = .today
    public var search = ""
    public var status = "Open"
    public var priority = "All"
    public var earliestFirst = true
    public var historyRange: TaskHistoryRange = .thisMonth
    public init() {}

    /// Start a keyword search across all dates, priorities, and completion states.
    public mutating func beginSearch() {
        date = .all
        historyRange = .allTime
        status = "All"
        priority = "All"
        search = ""
    }

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

    public func sections(_ tasks: [NexdoTask], timeZone: String, now: Date = Date()) -> [TaskResultSection] {
        snapshot(tasks, timeZone: timeZone, now: now).sections
    }

    public func results(_ tasks: [NexdoTask], timeZone: String, now: Date = Date(), calendar: Calendar = Calendar(identifier: .gregorian)) -> [NexdoTask] {
        snapshot(tasks, timeZone: timeZone, now: now, calendar: calendar).tasks
    }

    /// Parse each date once and sort only the selected list, never the badge counts.
    public func snapshot(_ tasks: [NexdoTask], timeZone: String, now: Date = Date(), calendar supplied: Calendar = Calendar(identifier: .gregorian)) -> TaskListSnapshot {
        var calendar = supplied
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
        calendar.firstWeekday = 2
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
        let intervals: [TaskDateFilter: DateInterval] = [
            .all: historyRange.interval(now: now, calendar: calendar),
            .today: calendar.dateInterval(of: .day, for: now)!,
            .tomorrow: calendar.dateInterval(of: .day, for: tomorrow)!,
            .week: calendar.dateInterval(of: .weekOfYear, for: now)!
        ]
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let standard = ISO8601DateFormatter()
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        var counts: [TaskDateFilter: Int] = [:]
        var selected: [(task: NexdoTask, date: Date)] = []
        for task in tasks {
            guard task.status != "CANCELLED",
                  status == "All" || (status == "Completed" ? task.isDone : !task.isDone),
                  priority == "All" || task.priority == priority,
                  term.isEmpty || task.title.localizedStandardContains(term) || (task.notes?.localizedStandardContains(term) ?? false) else { continue }
            let scheduled = (task.startAt ?? task.dueAt).flatMap { fractional.date(from: $0) ?? standard.date(from: $0) } ?? .distantFuture
            for (filter, interval) in intervals {
                let inHistory = scheduled >= interval.start && scheduled < interval.end
                let upcomingOpen = filter == .all && historyRange != .thisMonth && !task.isDone && scheduled >= tomorrow
                let allDateSearch = filter == .all && (historyRange == .allTime || !term.isEmpty)
                guard inHistory || upcomingOpen || allDateSearch else { continue }
                counts[filter, default: 0] += 1
                if filter == date { selected.append((task, scheduled)) }
            }
        }
        selected.sort { lhs, rhs in
            if lhs.task.isDone != rhs.task.isDone { return !lhs.task.isDone }
            if lhs.date == rhs.date { return lhs.task.id < rhs.task.id }
            if date == .all {
                let leftUpcoming = lhs.date >= tomorrow
                let rightUpcoming = rhs.date >= tomorrow
                if leftUpcoming != rightUpcoming { return !leftUpcoming }
                return leftUpcoming ? lhs.date < rhs.date : lhs.date > rhs.date
            }
            return earliestFirst ? lhs.date < rhs.date : lhs.date > rhs.date
        }
        var sections: [TaskResultSection] = []
        var sectionDate: Date?
        var sectionDone = false
        var sectionTasks: [NexdoTask] = []
        for item in selected {
            let day = item.date == .distantFuture ? Date.distantFuture : calendar.startOfDay(for: item.date)
            if sectionDate != day || sectionDone != item.task.isDone {
                if let sectionDate { sections.append(TaskResultSection(date: sectionDate, isDone: sectionDone, tasks: sectionTasks)) }
                sectionDate = day; sectionDone = item.task.isDone; sectionTasks = []
            }
            sectionTasks.append(item.task)
        }
        if let sectionDate { sections.append(TaskResultSection(date: sectionDate, isDone: sectionDone, tasks: sectionTasks)) }
        return TaskListSnapshot(tasks: selected.map(\.task), sections: sections, counts: counts)
    }
}

public struct TaskListSnapshot {
    public let tasks: [NexdoTask]
    public let sections: [TaskResultSection]
    public let counts: [TaskDateFilter: Int]
}
