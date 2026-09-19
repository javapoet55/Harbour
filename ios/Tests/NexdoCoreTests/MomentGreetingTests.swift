import Testing
@testable import NexdoCore

@Test func momentGreetingPersonalizesOnlySupportedOccasions() {
    #expect(MomentGreeting.message("Happy Birthday! Have a lovely day.", type: "birthday", firstName: "Rahul") == "Happy Birthday, Rahul! Have a lovely day.")
    #expect(MomentGreeting.message("Happy Anniversary! Best wishes.", type: "anniversary", firstName: "Ann") == "Happy Anniversary, Ann! Best wishes.")
    #expect(MomentGreeting.message("Get well soon. Rest up.", type: "getWellSoon", firstName: "Sam") == "Get well soon, Sam! Rest up.")
    #expect(MomentGreeting.message("Happy Diwali!", type: "festival", firstName: "Rahul") == "Happy Diwali!")
    #expect(MomentGreeting.message("Happy Birthday, Rahul!", type: "birthday", firstName: "Rahul") == "Happy Birthday, Rahul!")
    #expect(MomentGreeting.message("Thinking of you.", type: "getWellSoon", firstName: "Sam") == "Get well soon, Sam! Thinking of you.")
    #expect(MomentGreeting.heading(type: "birthday", firstName: "  ") == nil)
}
