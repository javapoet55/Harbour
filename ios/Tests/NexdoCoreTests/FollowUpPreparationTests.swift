import Foundation
import Testing
@testable import NexdoCore

@Test func followUpCapturesNaturalRequestAndPreservesPreparationAfterMove() throws {
    let detector = DeterministicTaskActionDetector()
    let title = "I need to follow up with my insurance company next Tuesday"
    let detected = try #require(detector.detect(title: title))
    #expect(detected.intent == .followUp)
    #expect(detected.contactName == "my insurance company")
    var action = TaskAction(taskId: "t", title: title, detection: detected, scheduledAt: Date())
    var preparation = FollowUpPreparation(company: "Acme Insurance", purpose: "Claim status", notes: "Reference 123")
    preparation.checklist[0].done = true
    preparation.outcomes.append(.init(result: "unresolved", notes: "Waiting for adjuster"))
    action.preparation = preparation
    let data = try JSONEncoder().encode(action)
    #expect(try JSONDecoder().decode(TaskAction.self, from: data).preparation == preparation)
    let moved = NexdoTask(id: "t", title: title, status: "PLANNED", priority: "NORMAL", durationMin: 15, notes: nil, startAt: "2030-10-09T16:00:00Z", dueAt: nil)
    let reconciled = try #require(TaskActionReconciler.reconcile(previous: [action], tasks: [moved], detector: detector, now: Date(), timeZone: .current).first)
    #expect(reconciled.preparation == preparation)
    #expect(reconciled.id != action.id) // old notifications cannot trigger the new occurrence
    #expect(TaskActionNotificationPlan.desired([reconciled], now: ServerDate.parse("2026-10-09T16:00:00Z")!).count == 1)
}
@Test func oldActionsDecodeWithoutPreparation() throws {
    let detected = try #require(DeterministicTaskActionDetector().detect(title: "Call Alex"))
    let action = TaskAction(taskId: "t", title: "Call Alex", detection: detected, scheduledAt: nil)
    let data = try JSONEncoder().encode(action)
    #expect(try JSONDecoder().decode(TaskAction.self, from: data).preparation == nil)
}
