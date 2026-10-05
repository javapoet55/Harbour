import Foundation

public enum PomodoroPeriod: String, CaseIterable, Sendable {
    case today, week, month, all
    public var title: String { switch self { case .today: "Today"; case .week: "This Week"; case .month: "This Month"; case .all: "All Time" } }
}

/// Activity is attributed to the session's start date in the user's current calendar; weeks run Monday–Sunday.
/// Pauses are excluded by the timer model; breaks never contribute to focus time.
public struct PomodoroAnalytics: Sendable {
    public struct Bucket: Identifiable, Sendable {
        public var id: Date { start }
        public let start: Date
        public let end: Date
        public let seconds: Double
        public let breakSeconds: Double
    }
    public struct CategoryTotal: Identifiable, Sendable {
        public var id: PomodoroCategory { category }
        public let category: PomodoroCategory
        public let seconds: Double
    }
    public let sessions: [PomodoroSession]
    public let period: PomodoroPeriod
    public let interval: DateInterval
    public let now: Date
    public let calendar: Calendar
    public let previousSeconds: Double?
    public var focusSeconds: Double { sessions.reduce(0) { $0 + focused($1) } }
    public var breakSeconds: Double { sessions.reduce(0) { $0 + rested($1) } }
    public var completedCount: Int { sessions.filter { $0.phase == .completed || $0.phase == .shortBreak }.count }
    public var focusRate: Double? {
        let resolved = completedCount + sessions.filter { $0.phase == .stopped }.count
        return resolved == 0 ? nil : Double(completedCount) / Double(resolved)
    }
    public var changePercent: Int? {
        guard let previousSeconds, previousSeconds > 0 else { return nil }
        return Int(((focusSeconds - previousSeconds) / previousSeconds * 100).rounded())
    }
    public var categories: [CategoryTotal] {
        PomodoroCategory.allCases.compactMap { category in
            let total = sessions.filter { $0.category == category }.reduce(0) { $0 + focused($1) }
            return total > 0 ? CategoryTotal(category: category, seconds: total) : nil
        }
    }
    public init(sessions input: [PomodoroSession], period: PomodoroPeriod, now: Date = Date(), calendar base: Calendar = .current) {
        // Weeks always run Monday to Sunday, whatever the device's region uses (US devices start on Sunday).
        var calendar = base
        calendar.firstWeekday = 2
        self.now = now; self.calendar = calendar; self.period = period
        var latest: [String: PomodoroSession] = [:]
        for session in input where session.startedAt <= now.timeIntervalSince1970 {
            if latest[session.id] == nil || session.revision >= latest[session.id]!.revision { latest[session.id] = session }
        }
        let all = latest.values.map { value in var session = value; session.advance(at: now); return session }.sorted { $0.startedAt > $1.startedAt }
        let component: Calendar.Component = period == .week ? .weekOfYear : period == .month ? .month : .day
        let current = calendar.dateInterval(of: component, for: now)!
        let range = period == .all ? DateInterval(start: calendar.startOfDay(for: all.last.map { Date(timeIntervalSince1970: $0.startedAt) } ?? now), end: current.end) : current
        interval = range
        sessions = all.filter { $0.startedAt >= range.start.timeIntervalSince1970 && $0.startedAt < range.end.timeIntervalSince1970 }
        if period == .all { previousSeconds = nil }
        else {
            let previous = calendar.dateInterval(of: component, for: current.start.addingTimeInterval(-1))!
            previousSeconds = all.filter { $0.startedAt >= previous.start.timeIntervalSince1970 && $0.startedAt < previous.end.timeIntervalSince1970 }.reduce(0) { $0 + Self.focused($1, now: now) }
        }
    }
    public func focused(_ session: PomodoroSession) -> Double { Self.focused(session, now: now) }
    private static func focused(_ session: PomodoroSession, now: Date) -> Double {
        let planned = Double(session.durationMinutes * 60)
        return min(planned, max(0, session.phase == .focus ? planned - session.remaining(at: now) : session.focusSeconds))
    }
    public func rested(_ session: PomodoroSession) -> Double {
        min(300, max(0, session.phase == .shortBreak ? 300 - session.remaining(at: now) : session.breakSeconds))
    }
    public var buckets: [Bucket] {
        let component: Calendar.Component = period == .today ? .hour : period == .all ? .month : .day
        var cursor = period == .all ? calendar.dateInterval(of: .month, for: interval.start)!.start : interval.start
        var result: [Bucket] = []
        while cursor < interval.end {
            guard let next = calendar.date(byAdding: component, value: period == .today ? 3 : 1, to: cursor), next > cursor else { break }
            let end = min(next, interval.end)
            let seconds = sessions.filter { $0.startedAt >= cursor.timeIntervalSince1970 && $0.startedAt < end.timeIntervalSince1970 }.reduce(0) { $0 + focused($1) }
            let breaks = sessions.filter { $0.startedAt >= cursor.timeIntervalSince1970 && $0.startedAt < end.timeIntervalSince1970 }.reduce(0) { $0 + rested($1) }
            result.append(Bucket(start: cursor, end: end, seconds: seconds, breakSeconds: breaks)); cursor = next
        }
        return result
    }
    public var days: [(date: Date, sessions: [PomodoroSession])] {
        Dictionary(grouping: sessions) { calendar.startOfDay(for: Date(timeIntervalSince1970: $0.startedAt)) }
            .map { (date: $0.key, sessions: $0.value.sorted { $0.startedAt > $1.startedAt }) }.sorted { $0.date > $1.date }
    }
}
