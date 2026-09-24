import SwiftUI
import CryptoKit
import UserNotifications

enum TaskActionServiceError: LocalizedError {
    case notificationsDenied, contactsDenied, noContact, noPhone, noEmail, unavailable, invalidPhone
    var errorDescription: String? {
        switch self {
        case .notificationsDenied: "Notifications are off. Enable notifications for Nexdo in Settings to receive action reminders."
        case .contactsDenied: "Allow Nexdo to access Contacts in Settings, then try again."
        case .noContact: "No matching contact is available. Check the name and which contacts you’ve shared with Nexdo."
        case .noPhone: "This contact has no phone number. Add a number in Contacts or choose another person."
        case .noEmail: "This contact has no email address. Add an address in Contacts or choose another person."
        case .unavailable: "This action isn’t available on this device. Check Messages or Mail setup and try again."
        case .invalidPhone: "This phone number can’t be used for a call. Update it in Contacts."
        }
    }
}

@MainActor final class TaskActionCoordinator: ObservableObject {
    static let shared = TaskActionCoordinator()
    @Published private(set) var actions: [TaskAction] = []
    @Published private(set) var resolvedContacts: [String: ActionContact] = [:]
    @Published var route: Route?
    @Published private(set) var notice: String?
    struct Route: Identifiable {
        let id: String
        let preferred: TaskActionChannel?
    }
    private var owner: String?
    private let detector: any TaskActionDetector = DeterministicTaskActionDetector()
    private let scheduler: any TaskActionNotificationScheduler = LocalTaskActionScheduler()
    private var scheduling: Task<Void, Never>?
    private var pending: (id: String, owner: String, choice: String)?
    /// Action screens on screen now, by action id. The screen opens from a card, Today or a notification (`route`).
    private var openScreens: [String: Int] = [:]
    private var generation = 0
    private var file: URL? {
        guard let owner else { return nil }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("TaskActions", isDirectory: true).appendingPathComponent(owner + ".json")
    }
    nonisolated static func ownerKey(_ id: String) -> String {
        SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    func activate(userID: String?) {
        let key = userID.map(Self.ownerKey)
        guard owner != key else { return }
        owner = key; generation += 1; route = nil; actions = []; notice = nil; resolvedContacts = [:]; openScreens = [:]
        if let file, FileManager.default.fileExists(atPath: file.path) {
            do { actions = try JSONDecoder().decode([TaskAction].self, from: Data(contentsOf: file)) }
            catch { notice = "Saved action settings couldn’t be read. Open your tasks to rebuild reminders." }
        }
        // A process cannot know whether an interrupted call or composer sent anything.
        for index in actions.indices where actions[index].status == .executing || actions[index].status == .approved {
            actions[index].transition(to: .awaitingApproval)
        }
        queueSchedule()
    }
    func synchronize(tasks: [NexdoTask], userID: String) {
        activate(userID: userID)
        let now = Date()
        actions = TaskActionReconciler.reconcile(previous: actions, tasks: tasks, detector: detector, now: now, timeZone: .current)
        // An action opened early and left without a choice goes back on its schedule, unless its screen is open now.
        actions = TaskActionReconciler.release(actions, except: Set(openScreens.keys).union(route.map { [$0.id] } ?? []), now: now)
        persist(); queueSchedule()
        if let pending, pending.owner == owner {
            self.pending = nil
            receive(actionID: pending.id, owner: pending.owner, choice: pending.choice)
        }
        if let route, !actions.contains(where: { $0.id == route.id }) { self.route = nil }
    }
    func action(for taskID: String) -> TaskAction? { actions.first { $0.taskId == taskID } }
    func remember(_ contact: ActionContact) { resolvedContacts[contact.id] = contact }
    func open(_ action: TaskAction, preferred: TaskActionChannel? = nil) {
        guard actions.contains(where: { $0.id == action.id }) else { return }
        update(action.id) { $0.transition(to: .awaitingApproval) }
        route = Route(id: action.id, preferred: preferred ?? action.preferredAction)
    }
    func screenOpened(_ id: String) { openScreens[id, default: 0] += 1 }
    /// The Action screen closed. With no choice made and the reminder still ahead, the action goes back to `scheduled`
    /// and its notification is scheduled again; once the reminder time has arrived it keeps waiting for a choice.
    func screenClosed(_ id: String) {
        let remaining = (openScreens[id] ?? 1) - 1
        openScreens[id] = remaining > 0 ? remaining : nil
        guard remaining <= 0, route?.id != id,
              actions.first(where: { $0.id == id })?.isWaitingBeforeItsTime(now: Date()) == true else { return }
        update(id) { $0.releaseIfWaitingBeforeItsTime(now: Date()) }
    }
    func receive(actionID: String, owner: String, choice: String) {
        guard self.owner == owner, let action = actions.first(where: { $0.id == actionID }) else {
            pending = (actionID, owner, choice); return
        }
        if choice == UNNotificationDismissActionIdentifier {
            update(actionID) { $0.transition(to: .cancelled) }; return
        }
        open(action, preferred: TaskActionChannel(rawValue: choice.lowercased()))
        // Snooze from a notification still opens the authenticated action screen.
        if choice == "REMIND_LATER" { snooze(actionID) }
    }
    func update(_ id: String, _ change: (inout TaskAction) -> Void) {
        guard let index = actions.firstIndex(where: { $0.id == id }) else { return }
        change(&actions[index]); persist(); queueSchedule()
    }
    func approveExecution(_ id: String) -> Bool {
        var approved = false
        update(id) { action in
            approved = action.transition(to: .approved) && action.transition(to: .executing)
        }
        return approved
    }
    func snooze(_ id: String) {
        snooze(id, until: Date().addingTimeInterval(15 * 60))
    }
    func snooze(_ id: String, until date: Date) {
        guard date > Date() else { return }
        update(id) { action in
            action.snoozedUntil = date
            action.transition(to: .scheduled)
        }
        route = nil
    }
    func dismiss(_ id: String) {
        update(id) { $0.transition(to: .cancelled) }
        route = nil
    }
    func retryNotifications() { queueSchedule() }
    private func persist() {
        guard let file else { return }
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(actions).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            var resource = file
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            try resource.setResourceValues(values)
        } catch { notice = "Action settings couldn’t be saved on this device. Please try again." }
    }
    private func queueSchedule() {
        let previous = scheduling
        let generation = generation
        scheduling = Task { [weak self] in
            await previous?.value
            guard let self, generation == self.generation else { return }
            let snapshot = self.actions
            let plan = TaskActionNotificationPlan.desired(snapshot, now: Date())
            do {
                try await self.scheduler.replace(with: plan, actions: snapshot, owner: self.owner ?? "")
                guard generation == self.generation else { return }
                self.notice = nil
                for item in plan {
                    if let index = self.actions.firstIndex(where: { $0.id == item.actionId }), self.actions[index].status == .pending {
                        self.actions[index].transition(to: .scheduled)
                    }
                }
                self.persist()
                if self.notice == nil && TaskActionNotificationPlan.desired(snapshot, now: Date(), limit: Int.max).count > plan.count {
                    self.notice = "The next 48 action reminders are scheduled. Open Nexdo regularly to schedule later reminders."
                }
            } catch { if generation == self.generation { self.notice = error.localizedDescription } }
        }
    }
}
