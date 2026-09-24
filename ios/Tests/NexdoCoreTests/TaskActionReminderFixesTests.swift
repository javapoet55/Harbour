import Foundation
import Testing
@testable import NexdoCore

private let now = ServerDate.parse("2026-09-24T09:00:00Z")!
private let zone = TimeZone(identifier: "Asia/Kolkata")!
private let detector = DeterministicTaskActionDetector()
private func detect(_ title: String) -> DetectedTaskAction? { detector.detect(title: title, now: now, timeZone: zone) }

@Test(arguments: [
    ("Call the plumber", TaskActionIntent.call, "the plumber", TaskActionChannel?.some(.call)),
    ("Call electrician", .call, "electrician", .call),
    ("call Electrician", .call, "Electrician", .call),
    ("Call an electrician", .call, "an electrician", .call),
    ("Message the landlord", .message, "the landlord", .message),
    ("Text plumber", .message, "plumber", .message),
    ("Email the accountant", .email, "the accountant", .email),
    ("Contact the electrician", .contact, "the electrician", nil),
    ("Contact Priya", .contact, "Priya", nil)
])
func contactActionsForPeopleAndServices(title: String, intent: TaskActionIntent, name: String, channel: TaskActionChannel?) throws {
    let result = try #require(detect(title))
    #expect(result.intent == intent && result.contactName == name && result.preferredAction == channel)
}

@Test func nameEndsAtToForByBeforeAfterAndTheRestIsContext() throws {
    let electrician = try #require(detect("Call electrician to fix the kitchen wiring"))
    #expect(electrician.contactName == "electrician" && electrician.context == "fix the kitchen wiring")
    let plumber = try #require(detect("Call the plumber for the leak tomorrow at 5 pm"))
    #expect(plumber.contactName == "the plumber" && plumber.context == "the leak")
    #expect(plumber.scheduledAt == ServerDate.parse("2026-09-25T11:30:00Z"))
    #expect(detect("Email the landlord by Friday")?.contactName == "the landlord")
    #expect(detect("Text the vet before 6 pm")?.contactName == "the vet")
    #expect(detect("Call Asha after lunch")?.contactName == "Asha")
    // The existing context words still work, and names that start with those letters are not cut.
    let damien = try #require(detect("Call Damien to confirm the booking"))
    #expect(damien.contactName == "Damien" && damien.context == "confirm the booking")
    #expect(detect("Call Tony Stark")?.contactName == "Tony Stark")
    #expect(detect("Email Ford Bybee")?.contactName == "Ford Bybee")
}

@Test func contactSearchDropsALeadingArticleOnly() {
    #expect(DeterministicTaskActionDetector.contactSearchName("the plumber") == "plumber")
    #expect(DeterministicTaskActionDetector.contactSearchName("An Electrician") == "Electrician")
    #expect(DeterministicTaskActionDetector.contactSearchName("my dentist") == "dentist")
    #expect(DeterministicTaskActionDetector.contactSearchName("Our accountant") == "accountant")
    #expect(DeterministicTaskActionDetector.contactSearchName("your landlord") == "landlord")
    #expect(DeterministicTaskActionDetector.contactSearchName("electrician") == "electrician")
    #expect(DeterministicTaskActionDetector.contactSearchName("Theo") == "Theo")
    #expect(DeterministicTaskActionDetector.contactSearchName("Anand") == "Anand")
    #expect(DeterministicTaskActionDetector.contactSearchName("the") == "the")
}

private func action(at date: Date?) throws -> TaskAction {
    TaskAction(taskId: "t1", title: "Call electrician", detection: try #require(detect("Call electrician")), scheduledAt: date)
}

@Test func anActionOpenedEarlyGoesBackToScheduledAndIsRemindedAgain() throws {
    let future = now.addingTimeInterval(3600)
    var value = try action(at: future)
    value.transition(to: .scheduled); value.transition(to: .awaitingApproval)
    #expect(TaskActionNotificationPlan.desired([value], now: now).isEmpty)
    let released = value.releaseIfWaitingBeforeItsTime(now: now)
    #expect(released && value.status == .scheduled)
    #expect(TaskActionNotificationPlan.desired([value], now: now).map(\.fireAt) == [future])
}

@Test func anActionWhoseTimeHasArrivedKeepsWaitingForAChoice() throws {
    var value = try action(at: now.addingTimeInterval(-60))
    value.transition(to: .awaitingApproval)
    let due = value.releaseIfWaitingBeforeItsTime(now: now)
    #expect(!due && value.status == .awaitingApproval)
    var unscheduled = try action(at: nil)
    unscheduled.transition(to: .awaitingApproval)
    let none = unscheduled.releaseIfWaitingBeforeItsTime(now: now)
    #expect(!none && unscheduled.status == .awaitingApproval)
    // A snooze counts as its reminder time.
    var snoozed = try action(at: now.addingTimeInterval(-60))
    snoozed.snoozedUntil = now.addingTimeInterval(900); snoozed.transition(to: .awaitingApproval)
    let later = snoozed.releaseIfWaitingBeforeItsTime(now: now)
    #expect(later && snoozed.status == .scheduled)
}

@Test func onlyAWaitingActionIsReleased() throws {
    let future = now.addingTimeInterval(3600)
    for status in [TaskActionStatus.approved, .executing, .completed, .failed, .cancelled] {
        var value = try action(at: future)
        value.transition(to: .awaitingApproval)
        if status == .executing || status == .completed || status == .failed { value.transition(to: .approved); value.transition(to: .executing) }
        if status != .executing { value.transition(to: status) }
        #expect(value.status == status)
        let released = value.releaseIfWaitingBeforeItsTime(now: now)
        #expect(!released && value.status == status)
    }
}

@Test func theNextSyncRepairsStuckActionsButNeverOneOnScreen() throws {
    let future = now.addingTimeInterval(3600)
    var stuck = try action(at: future); stuck.transition(to: .awaitingApproval)
    var open = try action(at: future); open.transition(to: .awaitingApproval)
    var due = try action(at: now.addingTimeInterval(-60)); due.transition(to: .awaitingApproval)
    let released = TaskActionReconciler.release([stuck, open, due], except: [open.id], now: now)
    #expect(released.map(\.status) == [.scheduled, .awaitingApproval, .awaitingApproval])
    #expect(TaskActionNotificationPlan.desired(released, now: now).map(\.actionId) == [stuck.id])
}

@Test func aNewFutureScheduleRebuildsAStuckActionAtTheNewTime() throws {
    let past = "2026-09-24T08:50:00Z", future = "2026-09-24T11:00:00Z"
    let task = { (start: String) in NexdoTask(id: "t1", title: "Call electrician", status: "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: start, dueAt: nil) }
    var first = TaskActionReconciler.reconcile(previous: [], tasks: [task(past)], detector: detector, now: now, timeZone: zone)
    first[0].transition(to: .awaitingApproval)
    let next = TaskActionReconciler.reconcile(previous: first, tasks: [task(future)], detector: detector, now: now, timeZone: zone)
    #expect(next[0].scheduledAt == ServerDate.parse(future))
    #expect(TaskActionNotificationPlan.desired(next, now: now).map(\.fireAt) == [ServerDate.parse(future)!])
}
