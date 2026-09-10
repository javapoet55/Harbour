import Foundation

public struct TodayActionQueue: Sendable {
    public static let windowMinutes = 15
    public let primaryAction: TaskAction?
    public let nextActions: [TaskAction]
    public let laterActions: [TaskAction]
    public let overdueCount: Int
    public let deferredTaskIDs: Set<String>
    public var immediateTaskIDs: Set<String> { Set(([primaryAction].compactMap { $0 } + nextActions).map(\.taskId)) }
    public var reservedTaskIDs: Set<String> { immediateTaskIDs.union(laterActions.map(\.taskId)).union(deferredTaskIDs) }
    public var hasImmediateActions: Bool { primaryAction != nil || !nextActions.isEmpty }
    public var recommendation: String? {
        primaryAction.map { "You have a follow-up with \($0.contactName) due now. Contact them before starting your next task." }
    }

    public init(actions: [TaskAction], tasks: [NexdoTask], now: Date, timeZone: TimeZone,
                windowMinutes: Int = Self.windowMinutes) {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timeZone
        let end = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))!
        let window = now.addingTimeInterval(Double(max(0, windowMinutes)) * 60)
        let active = tasks.filter { !$0.isDone && $0.status != "CANCELLED" }
        let priorities = Dictionary(active.map { ($0.id, Self.priority($0.priority)) }, uniquingKeysWith: max)
        deferredTaskIDs = Set(actions.filter {
            priorities[$0.taskId] != nil && $0.status != .completed && $0.status != .cancelled &&
            ($0.notificationDate ?? .distantPast) >= end
        }.map(\.taskId))
        var seen = Set<String>()
        let ordered = actions.filter {
            priorities[$0.taskId] != nil && $0.status != .completed && $0.status != .cancelled &&
            $0.notificationDate != nil && $0.notificationDate! < end
        }.sorted {
            if $0.notificationDate != $1.notificationDate { return $0.notificationDate! < $1.notificationDate! }
            if priorities[$0.taskId] != priorities[$1.taskId] { return priorities[$0.taskId, default: 0] > priorities[$1.taskId, default: 0] }
            return $0.id < $1.id
        }.filter { seen.insert($0.taskId).inserted }
        let due = ordered.filter { $0.notificationDate! <= now }
        primaryAction = due.first
        nextActions = ordered.filter { $0.id != due.first?.id && $0.notificationDate! <= window }
        laterActions = ordered.filter { $0.notificationDate! > window }
        overdueCount = due.filter { $0.notificationDate! < now }.count
    }
    private static func priority(_ value: String) -> Int {
        switch value { case "CRITICAL": 3; case "HIGH": 2; case "LOW": 0; default: 1 }
    }
}
