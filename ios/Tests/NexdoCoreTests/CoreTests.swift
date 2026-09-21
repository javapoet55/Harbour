import Foundation
import Testing
@testable import NexdoCore

@Test func extractsFirstNameForPersonalizedWelcome() {
    #expect(ProfileName.firstName(from: "Rohit Kumar") == "Rohit")
    #expect(ProfileName.firstName(from: "  Sri\nKumar  ") == "Sri")
    #expect(ProfileName.firstName(from: "   ") == nil)
}

@Test func parsesBothServerDateFormats() {
    #expect(ServerDate.parse("2026-09-06T12:00:00.000Z") == ServerDate.parse("2026-09-06T12:00:00Z"))
    #expect(ServerDate.parse("not a date") == nil)
}
@Test func usesAccountZoneNotPhoneZone() {
    #expect(ServerDate.day("2026-09-06T01:00:00Z", timeZone: "America/Los_Angeles") == "2026-09-05")
    #expect(ServerDate.day("2026-09-06T01:00:00Z", timeZone: "Asia/Kolkata") == "2026-09-06")
}
@Test func handlesDSTBoundaries() {
    #expect(ServerDate.day("2026-03-08T07:59:59Z", timeZone: "America/Los_Angeles") == "2026-03-07")
    #expect(ServerDate.day("2026-03-08T08:00:00Z", timeZone: "America/Los_Angeles") == "2026-03-08")
    #expect(ServerDate.day("2026-11-01T09:30:00Z", timeZone: "America/Los_Angeles") == "2026-11-01")
}
@Test func calendarEndIsExclusive() throws {
    let data = Data(#"{"id":"event","title":"Conference","startAt":"2026-09-05T07:00:00Z","endAt":"2026-09-07T07:00:00Z","allDay":true}"#.utf8)
    let event = try JSONDecoder().decode(CalendarEvent.self, from: data)
    #expect(ServerDate.occurs(event, on: "2026-09-05", timeZone: "America/Los_Angeles"))
    #expect(ServerDate.occurs(event, on: "2026-09-06", timeZone: "America/Los_Angeles"))
    #expect(!ServerDate.occurs(event, on: "2026-09-07", timeZone: "America/Los_Angeles"))
}
@Test func taskContractToleratesAdditionalServerFields() throws {
    let data = Data(#"{"id":"t1","title":"My task","status":"COMPLETED","priority":"NORMAL","durationMin":45,"notes":null,"startAt":null,"dueAt":null,"extraField":true}"#.utf8)
    let task = try JSONDecoder().decode(NexdoTask.self, from: data)
    #expect(task.isDone)
    #expect(task.durationMin == 45)
}
@Test func taskDecodesInternalLifeReminderMetadata() throws {
    let data = Data(#"{"id":"t1","title":"Return shoes","status":"PLANNED","priority":"NORMAL","durationMin":5,"notes":"","startAt":"2026-10-10T16:00:00Z","dueAt":"2026-10-14T16:00:00Z","reminderAt":"2026-10-10T16:00:00Z","lifeReminderType":"returnItem","lifeReminderConfidence":0.96,"originalUserText":"Return shoes before October 14"}"#.utf8)
    let task = try JSONDecoder().decode(NexdoTask.self, from: data)
    #expect(task.lifeReminderType == "returnItem")
    #expect(task.lifeReminderLabel == "Return")
    #expect(task.originalUserText == "Return shoes before October 14")
}
@Test func todayIntelligenceDecodesRealScheduleFacts() throws {
    let data = Data(#"{"today":{"day":"2026-09-07","timeZone":"America/Los_Angeles","commitments":3,"appointments":1,"tasks":2,"overdue":1,"availableMinutes":90,"timeline":[{"id":"task:t1","sourceId":"t1","kind":"task","title":"Finish proposal","startAt":"2026-09-07T16:00:00Z","endAt":"2026-09-07T16:30:00Z","allDay":false,"deadlineOnly":false,"past":false}],"attention":[{"id":"overdue","label":"Overdue","title":"1 unfinished deadline","explanation":"Finish proposal","recommendedAction":"Review overdue work.","kind":"task","taskId":"t1"}],"recommendation":{"title":"Protect 9:00 AM–9:30 AM","explanation":"Use this opening for Finish proposal.","kind":"task","taskId":"t1"}}}"#.utf8)
    let result = try JSONDecoder().decode(ScheduleIntelligenceResponse.self, from: data)
    #expect(result.today.commitments == 3)
    #expect(result.today.timeline.first?.sourceId == "t1")
    #expect(result.today.attention.first?.taskId == "t1")
    #expect(result.today.availableMinutes == 90)
}
@Test func weatherDecodesProviderTemperature() throws {
    let data = Data(#"{"current":{"temperature_2m":72.4},"units":{"temperature_2m":"°F"}}"#.utf8)
    let result = try JSONDecoder().decode(WeatherResponse.self, from: data)
    #expect(result.current.temperature == 72.4)
}
@Test func rejectsInsecureOrCredentialedServer() {
    for address in ["http://example.com", "https://user:secret@example.com", "https://example.com?token=bad"] {
        #expect(throws: APIError.self) { try APIClient(baseURL: URL(string: address)!) }
    }
}
@Test func readOnlyRequestDoesNotSendApproval() throws {
    let request = AssistantRequest(transcript: "Why that task?", contextActionId: "owned-context")
    let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as! [String: String]
    #expect(json["contextActionId"] == "owned-context")
    #expect(json["confirmActionId"] == nil)
    #expect(json["rejectActionId"] == nil)
}
@Test func rejectionIsExplicitAndSeparateFromApproval() throws {
    let request = AssistantRequest(transcript: "no", contextActionId: "context", rejectActionId: "proposal")
    let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as! [String: String]
    #expect(json["rejectActionId"] == "proposal")
    #expect(json["confirmActionId"] == nil)
}
@Test func responsePreservesSectionsAndProposal() throws {
    let data = Data(#"{"spoken":"Review your plan","visual":{"summary":"Two priorities","sections":[{"title":"Focus","items":["Finish report"]}]},"contextActionId":"context","confirmation":{"actionId":"proposal","prompt":"Move report?"}}"#.utf8)
    let turn = try JSONDecoder().decode(AssistantTurn.self, from: data)
    #expect(turn.visual.sections?.first?.items == ["Finish report"])
    #expect(turn.confirmation?.actionId == "proposal")
}
