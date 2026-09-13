import Foundation
import Testing
@testable import NexdoCore

@Test func voiceTaskRejectsAmbiguousAndPastSchedules() throws {
    let now = ServerDate.parse("2026-09-12T12:00:00Z")!
    for value in ["next week", "2026-09-13T11:00:00", "2026-09-11T11:00:00Z"] {
        let draft = VoiceTaskDraft(title: "Call Damien", notes: "", scheduledAt: value, durationMin: 30)
        #expect(throws: VoiceTaskValidationError.self) { try draft.validatedDate(now: now) }
    }
}
@Test func voiceTaskPreservesExplicitTimezoneOffset() throws {
    let draft = VoiceTaskDraft(title: "Call Damien", notes: "", scheduledAt: "2026-09-13T11:00:00-07:00", durationMin: 15)
    #expect(try draft.validatedDate(now: ServerDate.parse("2026-09-12T12:00:00Z")!) == ServerDate.parse("2026-09-13T18:00:00Z"))
}
@Test func voiceTaskRejectsInvalidTitleAndDuration() throws {
    for (title, duration) in [(" ", 30), ("Task", 0), ("Task", 1441)] {
        let draft = VoiceTaskDraft(title: title, notes: "", scheduledAt: "2026-09-13T11:00:00Z", durationMin: duration)
        #expect(throws: VoiceTaskValidationError.self) { try draft.validatedDate(now: ServerDate.parse("2026-09-12T12:00:00Z")!) }
    }
}
