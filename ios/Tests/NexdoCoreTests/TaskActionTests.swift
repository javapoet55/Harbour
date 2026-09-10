import Foundation
import Testing
@testable import NexdoCore

private let actionNow = ServerDate.parse("2026-09-09T16:00:00Z")! // Wednesday, 9 AM Pacific
private let actionZone = TimeZone(identifier: "America/Los_Angeles")!
private let actionDetector = DeterministicTaskActionDetector()

@Test func contactActionExamplesAndContext() throws {
    let examples: [(String, TaskActionIntent, String, TaskActionChannel?, String)] = [
        ("Contact Damien at 10:00 AM.", .contact, "Damien", nil, "2026-09-09T17:00:00Z"),
        ("Call Damien at 4 PM", .call, "Damien", .call, "2026-09-09T23:00:00Z"),
        ("Contact Damien tomorrow at 10 AM", .contact, "Damien", nil, "2026-09-10T17:00:00Z"),
        ("Email John Friday morning", .email, "John", .email, "2026-09-11T16:00:00Z"),
        ("Message Robert tonight", .message, "Robert", .message, "2026-09-10T02:00:00Z"),
        ("Follow up with Damien Thursday", .followUp, "Damien", nil, "2026-09-10T16:00:00Z")
    ]
    for (title, intent, name, preferred, date) in examples {
        let result = try #require(actionDetector.detect(title: title, now: actionNow, timeZone: actionZone))
        #expect(result.intent == intent)
        #expect(result.contactName == name)
        #expect(result.preferredAction == preferred)
        #expect(result.scheduledAt == ServerDate.parse(date))
    }
    for title in ["Contact Damien at 10 AM about the roof inspection.", "Contact Damien about the roof inspection at 10 AM."] {
        #expect(actionDetector.detect(title: title, now: actionNow, timeZone: actionZone)?.context == "the roof inspection")
    }
}

@Test func actionDatesRespectTimezoneRolloverAndDST() {
    #expect(actionDetector.detect(title: "Call Ana at 8 AM", now: actionNow, timeZone: actionZone)?.scheduledAt == ServerDate.parse("2026-09-10T15:00:00Z"))
    #expect(actionDetector.detect(title: "Call Ana at 12 AM", now: actionNow, timeZone: actionZone)?.scheduledAt == ServerDate.parse("2026-09-10T07:00:00Z"))
    #expect(actionDetector.detect(title: "Call Ana at 12 PM", now: actionNow, timeZone: actionZone)?.scheduledAt == ServerDate.parse("2026-09-09T19:00:00Z"))
    let beforeDST = ServerDate.parse("2026-03-07T17:00:00Z")!
    #expect(actionDetector.detect(title: "Call Ana tomorrow at 10 AM", now: beforeDST, timeZone: actionZone)?.scheduledAt == ServerDate.parse("2026-03-08T17:00:00Z"))
    let tokyo = TimeZone(identifier: "Asia/Tokyo")!
    #expect(actionDetector.detect(title: "Call Ana at 10 AM", now: actionNow, timeZone: tokyo)?.scheduledAt == ServerDate.parse("2026-09-10T01:00:00Z"))
}

@Test func missingAndAmbiguousActionMetadataIsConservative() {
    for title in ["Buy groceries", "Call", "Contact at 10 AM", "Contact 123 at 10 AM", ""] {
        #expect(actionDetector.detect(title: title, now: actionNow, timeZone: actionZone) == nil)
    }
    for title in ["Call Damien", "Call Damien at 10", "Call Damien at 25 PM", "Call Damien at 10:99 AM"] {
        #expect(actionDetector.detect(title: title, now: actionNow, timeZone: actionZone)?.scheduledAt == nil)
    }
}

private func actionTask(_ title: String = "Contact Damien at 10 AM", start: String? = "2026-09-09T17:00:00Z", status: String = "PLANNED") -> NexdoTask {
    NexdoTask(id: "task", title: title, status: status, priority: "NORMAL", durationMin: 30, notes: nil, startAt: start, dueAt: nil)
}
private func reconcile(_ previous: [TaskAction], _ tasks: [NexdoTask]) -> [TaskAction] {
    TaskActionReconciler.reconcile(previous: previous, tasks: tasks, detector: actionDetector, now: actionNow, timeZone: actionZone)
}

@Test func actionRequiresApprovalAndDoesNotCompleteOnLaunch() throws {
    var action = try #require(reconcile([], [actionTask()]).first)
    func transition(_ next: TaskActionStatus) -> Bool { action.transition(to: next, now: actionNow) }
    #expect(action.requiresApproval)
    #expect(!transition(.executing))
    #expect(!transition(.completed))
    #expect(transition(.scheduled))
    #expect(transition(.awaitingApproval))
    #expect(!transition(.executing))
    #expect(transition(.approved))
    #expect(transition(.executing))
    #expect(action.status == .executing)
    #expect(action.executedAt == actionNow)
    #expect(transition(.failed))
    #expect(transition(.awaitingApproval))
    #expect(transition(.approved))
    #expect(transition(.executing))
    #expect(transition(.completed))
    let decoded = try JSONDecoder().decode(TaskAction.self, from: JSONEncoder().encode(action))
    #expect(decoded == action)
    #expect(decoded.requiresApproval)
}

@Test func scheduleReplacementPreservesPersonButCancelsOldReminder() throws {
    var actions = reconcile([], [actionTask()])
    actions[0].contactIdentifier = "chosen-person"
    let original = try #require(TaskActionNotificationPlan.desired(actions, now: actionNow).first)
    let unchanged = reconcile(actions, [actionTask()])
    #expect(unchanged == actions)
    let changed = reconcile(actions, [actionTask(start: "2026-09-10T18:00:00Z")])
    let replacement = try #require(TaskActionNotificationPlan.desired(changed, now: actionNow).first)
    #expect(replacement.id != original.id)
    #expect(replacement.fireAt == ServerDate.parse("2026-09-10T18:00:00Z"))
    #expect(changed[0].contactIdentifier == "chosen-person")
    #expect(reconcile(actions, [actionTask("Contact John at 10 AM")])[0].contactIdentifier == nil)
    #expect(reconcile(actions, [actionTask("Buy groceries")]).isEmpty)
}

@Test func deletingCompletingCancellingAndMissingDatesRemoveReminders() {
    let previous = reconcile([], [actionTask()])
    for tasks in [[], [actionTask(status: "COMPLETED")], [actionTask(status: "CANCELLED")], [actionTask(start: nil)], [actionTask(start: "invalid")]] {
        #expect(TaskActionNotificationPlan.desired(reconcile(previous, tasks), now: actionNow).isEmpty)
    }
    #expect(TaskActionNotificationPlan.desired(previous, now: actionNow.addingTimeInterval(7200)).isEmpty)
    #expect(TaskActionNotificationPlan.desired(previous, now: actionNow, limit: 0).isEmpty)
}

@Test func snoozingAndDismissalUpdateNotificationPlan() throws {
    var action = try #require(reconcile([], [actionTask()]).first)
    action.transition(to: .awaitingApproval)
    #expect(TaskActionNotificationPlan.desired([action], now: actionNow).isEmpty)
    action.snoozedUntil = actionNow.addingTimeInterval(900)
    action.transition(to: .scheduled)
    #expect(TaskActionNotificationPlan.desired([action], now: actionNow).first?.fireAt == action.snoozedUntil)
    action.transition(to: .cancelled)
    #expect(TaskActionNotificationPlan.desired([action], now: actionNow).isEmpty)
}
