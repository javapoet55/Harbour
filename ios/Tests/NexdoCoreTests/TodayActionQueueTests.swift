import Foundation
import Testing
@testable import NexdoCore

private let queueNow = ServerDate.parse("2026-09-09T17:00:00Z")!
private let queueZone = TimeZone(identifier: "America/Los_Angeles")!
private func queued(_ id: String, minutes: Double, priority: String = "NORMAL") -> (TaskAction, NexdoTask) {
    let date = queueNow.addingTimeInterval(minutes * 60)
    let title = "Contact \(id)"
    let task = NexdoTask(id: id, title: title, status: "PLANNED", priority: priority, durationMin: 30, notes: nil,
        startAt: ISO8601DateFormatter().string(from: date), dueAt: nil)
    let detection = DetectedTaskAction(intent: .contact, contactName: id, preferredAction: nil, scheduledAt: date, context: nil)
    return (TaskAction(taskId: id, title: title, detection: detection, scheduledAt: date), task)
}
private func queue(_ pairs: [(TaskAction, NexdoTask)], now: Date = queueNow) -> TodayActionQueue {
    TodayActionQueue(actions: pairs.map(\.0), tasks: pairs.map(\.1), now: now, timeZone: queueZone)
}

@Test func singleDueActionBecomesPrimary() {
    let result = queue([queued("Damien", minutes: 0)])
    #expect(result.primaryAction?.taskId == "Damien")
    #expect(result.nextActions.isEmpty)
    #expect(result.recommendation?.contains("Damien") == true)
}
@Test func upcomingActionsPromoteAtTheirScheduledTime() {
    let pairs = [queued("Damien", minutes: 0), queued("Robert", minutes: 5), queued("Roofing", minutes: 10)]
    let result = queue(pairs)
    #expect(result.primaryAction?.taskId == "Damien")
    #expect(result.nextActions.map(\.taskId) == ["Robert", "Roofing"])
    var finished = pairs[0].0
    finished.transition(to: .awaitingApproval); finished.transition(to: .approved)
    finished.transition(to: .executing); finished.transition(to: .completed)
    let remaining = [(finished, pairs[0].1)] + Array(pairs.dropFirst())
    #expect(queue(remaining).primaryAction == nil)
    #expect(queue(remaining).nextActions.map(\.taskId) == ["Robert", "Roofing"])
    #expect(queue(remaining, now: queueNow.addingTimeInterval(300)).primaryAction?.taskId == "Robert")
}
@Test func snoozeAndDismissRecalculateWithoutDeletingTask() {
    var damien = queued("Damien", minutes: -5)
    let robert = queued("Robert", minutes: 0)
    damien.0.snoozedUntil = queueNow.addingTimeInterval(1800)
    damien.0.transition(to: .scheduled)
    let snoozed = queue([damien, robert])
    #expect(snoozed.primaryAction?.taskId == "Robert")
    #expect(snoozed.laterActions.map(\.taskId) == ["Damien"])
    #expect(!snoozed.immediateTaskIDs.contains("Damien"))
    damien.0.transition(to: .cancelled)
    #expect(queue([damien, robert]).reservedTaskIDs == ["Robert"])
    #expect(damien.1.status == "PLANNED")
}
@Test func overdueOrderAndPriorityTieAreDeterministic() {
    let old = queued("Damien", minutes: -5)
    let now = queued("Robert", minutes: 0, priority: "CRITICAL")
    #expect(queue([now, old]).primaryAction?.taskId == "Damien")
    #expect(queue([now, old]).overdueCount == 1)
    let high = queued("High", minutes: -5, priority: "HIGH")
    #expect(queue([old, high, now]).primaryAction?.taskId == "High")
    #expect(queue([old, high, now]).nextActions.map(\.taskId) == ["Damien", "Robert"])
}
@Test func emptyAndWindowBoundaryAndTomorrow() {
    let result = queue([queued("Later", minutes: 16), queued("Tomorrow", minutes: 1440)])
    #expect(!result.hasImmediateActions)
    #expect(result.primaryAction == nil)
    #expect(result.nextActions.isEmpty)
    #expect(result.laterActions.map(\.taskId) == ["Later"])
    #expect(result.deferredTaskIDs == ["Tomorrow"])
    #expect(queue([queued("Boundary", minutes: 15)]).nextActions.count == 1)
    #expect(!queue([]).hasImmediateActions)
}

@Test func acceptanceEmailContextDoesNotBecomePartOfContactName() {
    let detected = DeterministicTaskActionDetector().detect(title: "Email ABC Roofing to confirm inspection date")
    #expect(detected?.contactName == "ABC Roofing")
    #expect(detected?.context == "confirm inspection date")
}
@Test func queueDeduplicatesTaskAcrossAllSectionsAndExcludesDeletedTasks() {
    let due = queued("Due", minutes: 0)
    let duplicate = queued("Due", minutes: 10)
    let soon = queued("Soon", minutes: 5)
    let later = queued("Later", minutes: 60)
    let result = queue([due, duplicate, soon, later])
    let ids = [result.primaryAction].compactMap { $0?.taskId } + result.nextActions.map(\.taskId) + result.laterActions.map(\.taskId)
    #expect(ids.count == Set(ids).count)
    #expect(result.reservedTaskIDs == ["Due", "Soon", "Later"])
    let removed = TodayActionQueue(actions: [due.0], tasks: [], now: queueNow, timeZone: queueZone)
    #expect(!removed.hasImmediateActions)
    let completed = NexdoTask(id: due.1.id, title: due.1.title, status: "COMPLETED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: due.1.startAt, dueAt: nil)
    #expect(!TodayActionQueue(actions: [due.0], tasks: [completed], now: queueNow, timeZone: queueZone).hasImmediateActions)
}
