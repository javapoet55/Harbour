import Foundation

public enum TaskActionIntent: String, Codable, Sendable {
    case contact, call, message, email, followUp, schedule, openURL, navigate, book, remind
}
public enum TaskActionChannel: String, Codable, CaseIterable, Sendable { case call, message, email }
public enum TaskActionStatus: String, Codable, Sendable {
    case pending, scheduled, awaitingApproval, approved, executing, completed, failed, cancelled
}
public struct DetectedTaskAction: Equatable, Sendable {
    public var intent: TaskActionIntent
    public var contactName: String
    public var preferredAction: TaskActionChannel?
    public var scheduledAt: Date?
    public var context: String?
}
public protocol TaskActionDetector: Sendable {
    func detect(title: String, now: Date, timeZone: TimeZone) -> DetectedTaskAction?
}

public struct TaskAction: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var taskId: String
    public var type: TaskActionIntent
    public var businessCandidateID: String?
    public var manualRecipient: TaskActionRecipient?
    public var contactIdentifier: String?
    public var contactName: String
    public var preferredAction: TaskActionChannel?
    public var scheduledAt: Date?
    public var context: String?
    public private(set) var status: TaskActionStatus = .pending
    public var requiresApproval: Bool { true }
    public private(set) var executedAt: Date?
    public var snoozedUntil: Date?
    public var sourceTitle: String
    public var notificationDate: Date? { snoozedUntil ?? scheduledAt }

    public init(taskId: String, title: String, detection: DetectedTaskAction, scheduledAt: Date?) {
        id = UUID().uuidString; self.taskId = taskId; sourceTitle = title
        type = detection.intent; contactName = detection.contactName
        preferredAction = detection.preferredAction; context = detection.context
        self.scheduledAt = scheduledAt
    }

    /// No communication can enter executing without an explicit approval event.
    @discardableResult public mutating func transition(to next: TaskActionStatus, now: Date = Date()) -> Bool {
        let allowed: Bool
        switch (status, next) {
        case (.pending, .scheduled), (.scheduled, .pending),
             (.pending, .awaitingApproval), (.scheduled, .awaitingApproval),
             (.failed, .awaitingApproval), (.cancelled, .awaitingApproval),
             (.completed, .awaitingApproval), (.awaitingApproval, .approved),
             (.approved, .executing), (.executing, .completed),
             (.executing, .failed), (.approved, .failed),
             (.executing, .awaitingApproval), (.approved, .awaitingApproval),
             (.awaitingApproval, .scheduled), (.failed, .scheduled),
             (.cancelled, .scheduled), (.completed, .scheduled), (.executing, .scheduled): allowed = true
        default: allowed = next == .cancelled || status == next
        }
        guard allowed else { return false }
        status = next
        if next == .executing { executedAt = now }
        return true
    }
}

public extension TaskAction {
    /// Opened before its reminder time (from a card or Today) and left without a choice. Nobody is choosing yet, so it
    /// goes back to `scheduled` and its reminder fires as planned. Once the time has arrived, `awaitingApproval` is the
    /// real state (the person is being asked now) and it stays.
    func isWaitingBeforeItsTime(now: Date) -> Bool {
        status == .awaitingApproval && (notificationDate.map { $0 > now } ?? false)
    }
    /// Returns an action waiting before its time to `scheduled`. True when it changed.
    @discardableResult mutating func releaseIfWaitingBeforeItsTime(now: Date) -> Bool {
        isWaitingBeforeItsTime(now: now) && transition(to: .scheduled, now: now)
    }
}

public enum TaskActionReconciler {
    /// Actions stuck waiting before their time go back to `scheduled`, except those whose Action screen is open.
    public static func release(_ actions: [TaskAction], except open: Set<String>, now: Date) -> [TaskAction] {
        actions.map { action in
            var value = action
            if !open.contains(action.id) { value.releaseIfWaitingBeforeItsTime(now: now) }
            return value
        }
    }
    /// The saved task date wins over wording in an old title after rescheduling.
    public static func reconcile(previous: [TaskAction], tasks: [NexdoTask], detector: any TaskActionDetector,
                                 now: Date, timeZone: TimeZone) -> [TaskAction] {
        tasks.compactMap { task in
            guard !task.isDone, task.status != "CANCELLED",
                  let detected = detector.detect(title: task.title, now: now, timeZone: timeZone) else { return nil }
            let schedule = (task.startAt ?? task.dueAt).flatMap(ServerDate.parse)
            guard var old = previous.first(where: { $0.taskId == task.id }),
                  old.contactName == detected.contactName, old.type == detected.intent else {
                return TaskAction(taskId: task.id, title: task.title, detection: detected, scheduledAt: schedule)
            }
            if old.scheduledAt != schedule || old.sourceTitle != task.title {
                let identifier = old.contactIdentifier
                let businessID = old.businessCandidateID
                let recipient = old.manualRecipient
                old = TaskAction(taskId: task.id, title: task.title, detection: detected, scheduledAt: schedule)
                old.contactIdentifier = identifier
                old.businessCandidateID = businessID
                old.manualRecipient = recipient
            }
            return old
        }
    }
}

public struct TaskActionNotification: Equatable, Sendable {
    public let id: String
    public let actionId: String
    public let taskId: String
    public let fireAt: Date
    public init?(action: TaskAction) {
        guard let date = action.notificationDate else { return nil }
        id = "nexdo.action." + action.id; actionId = action.id; taskId = action.taskId
        fireAt = date
    }
}
public enum TaskActionNotificationPlan {
    public static func desired(_ actions: [TaskAction], now: Date, limit: Int = 48) -> [TaskActionNotification] {
        actions.filter {
            ($0.status == .pending || $0.status == .scheduled) && ($0.notificationDate ?? .distantPast) > now
        }.sorted { $0.notificationDate! < $1.notificationDate! }.prefix(max(0, limit)).compactMap(TaskActionNotification.init)
    }
}
public protocol TaskActionNotificationScheduler: Sendable {
    func replace(with notifications: [TaskActionNotification], actions: [TaskAction], owner: String) async throws
}
