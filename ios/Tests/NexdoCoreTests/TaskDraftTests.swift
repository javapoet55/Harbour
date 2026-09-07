import Foundation
import Testing
@testable import NexdoCore

private func taskFixture() throws -> NexdoTask {
    try JSONDecoder().decode(NexdoTask.self, from: Data(#"{"id":"task-1","title":"Review proposal","status":"PLANNED","priority":"NORMAL","durationMin":30,"notes":"Keep context","startAt":"2026-11-01T09:30:00Z","energyLevel":"HIGH","splittable":true,"critical":true,"subtasks":[{"id":"step-1","title":"Read draft","completedAt":"2026-10-30T12:00:00Z","sortOrder":0}],"recurrence":{"frequency":"WEEKLY","interval":2,"byWeekday":"1,3","until":"2027-01-01T00:00:00Z","count":8}}"#.utf8))
}

@Test func decodesExistingTaskDetails() throws {
    let task = try taskFixture()
    let draft = TaskDraft(task: task)
    #expect(draft.energy == "HIGH")
    #expect(draft.splittable && draft.critical)
    #expect(draft.steps.first?.completedAt != nil)
    #expect(task.recurrence?.interval == 2)
}

@Test func unrelatedEditPreservesComplexRecurrenceAndCompletedSteps() throws {
    let original = TaskDraft(task: try taskFixture())
    var draft = original
    draft.title = "  Revised proposal  "
    let body = try #require(try JSONSerialization.jsonObject(with: draft.detailsBody(comparedTo: original)) as? [String: Any])
    #expect(body["title"] as? String == "Revised proposal")
    #expect(body.count == 1)
    #expect(body["subtasks"] == nil)
    #expect(body["recurrence"] == nil)
    #expect(try draft.scheduleBody(comparedTo: original) == nil)
}

@Test func scheduleUpdateIsSeparateAndPreservesDSTInstant() throws {
    let original = TaskDraft(task: try taskFixture())
    var draft = original
    draft.duration = 45
    draft.notes = "New notes"
    let details = try #require(try JSONSerialization.jsonObject(with: draft.detailsBody(comparedTo: original)) as? [String: Any])
    #expect(details["startAt"] == nil)
    #expect(details["notes"] as? String == "New notes")
    let schedule = try #require(try draft.scheduleBody(comparedTo: original))
    let body = try #require(try JSONSerialization.jsonObject(with: schedule) as? [String: Any])
    #expect(body["startAt"] as? String == "2026-11-01T09:30:00Z")
    #expect(body["durationMin"] as? Int == 45)
    #expect(body.count == 2)
}

@Test func clearingRepeatSendsExplicitNull() throws {
    let original = TaskDraft(task: try taskFixture())
    var draft = original
    draft.recurrence = "NONE"
    let body = try #require(try JSONSerialization.jsonObject(with: draft.detailsBody(comparedTo: original)) as? [String: Any])
    #expect(body["recurrence"] is NSNull)
}

@Test func validationRejectsBlankTitleAndInvalidEstimate() throws {
    var draft = TaskDraft(task: try taskFixture())
    draft.title = " \n "
    #expect(!draft.isValid)
    draft.title = "Valid"
    draft.duration = 0
    #expect(!draft.isValid)
    draft.duration = 1441
    #expect(!draft.isValid)
    draft.duration = 1440
    #expect(draft.isValid)
}

@Test func unchangedDraftProducesNoMutations() throws {
    let draft = TaskDraft(task: try taskFixture())
    #expect(try draft.detailsBody(comparedTo: draft) == Data("{}".utf8))
    #expect(try draft.scheduleBody(comparedTo: draft) == nil)
}
