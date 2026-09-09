import Foundation
import Testing
@testable import NexdoCore

@Test func preservesGroundedSectionOrderAndCounts() throws {
    let data = Data(#"{"spoken":"Briefing","visual":{"summary":"Your 5-day plan is ready.","sections":[{"title":"At a glance","items":["Today: 2 Calendar appointments and 3 tasks.","Next 5 days: 4 Calendar appointments and 6 open tasks."]},{"title":"Deadlines & schedule","items":["No conflicts."]},{"title":"Top 3 focus items","items":["1. Review proposal"]},{"title":"Overdue","items":["Nothing overdue."]}]}}"#.utf8)
    let turn = try JSONDecoder().decode(AssistantTurn.self, from: data)
    #expect(turn.displaySections.map(\.title) == ["At a glance", "Deadlines & schedule", "Top 3 focus items", "Overdue"])
    #expect(turn.displaySections[0].items[0] == "Today: 2 Calendar appointments and 3 tasks.")
}

@Test func legacyResponseRetainsActualDataWithoutInventedCounts() throws {
    let data = Data(#"{"spoken":"Here are your tasks.","visual":{"summary":"Your requested 7-day plan.","appointments":["Calendar review at 9 AM"],"tasks":["Review proposal"],"overdue":["Send update"],"next":"Start with the update."}}"#.utf8)
    let turn = try JSONDecoder().decode(AssistantTurn.self, from: data)
    #expect(turn.visual.summary == "Your requested 7-day plan.")
    #expect(turn.displaySections.map(\.title) == ["Calendar appointments", "Tasks", "Overdue", "AI Response"])
    #expect(turn.displaySections[1].items == ["Review proposal"])
}

@Test func typedAnswerOmitsIntroductorySummary() throws {
    let data = Data(#"{"spoken":"You have one task tomorrow.","visual":{"summary":"You're asking for a read-only view in your local time zone.","next":"Going to bed — 10:00 PM"}}"#.utf8)
    let turn = try JSONDecoder().decode(AssistantTurn.self, from: data)
    #expect(turn.displaySections.map(\.title) == ["AI Response"])
    #expect(turn.displaySections.flatMap(\.items) == ["Going to bed — 10:00 PM"])
}

@Test func summaryOnlyAnswerRemainsVisible() throws {
    let data = Data(#"{"spoken":"No tasks tomorrow.","visual":{"summary":"No tasks tomorrow."}}"#.utf8)
    let turn = try JSONDecoder().decode(AssistantTurn.self, from: data)
    #expect(turn.displaySections.flatMap(\.items) == ["No tasks tomorrow."])
}

@Test func serverNextStepSectionUsesResponseHeading() throws {
    let data = Data(#"{"spoken":"Answer","visual":{"summary":"Introduction","sections":[{"title":"NEXT STEP","items":["Your answer"]}]}}"#.utf8)
    let turn = try JSONDecoder().decode(AssistantTurn.self, from: data)
    #expect(turn.displaySections.map(\.title) == ["AI Response"])
    #expect(turn.displaySections.flatMap(\.items) == ["Your answer"])
}
