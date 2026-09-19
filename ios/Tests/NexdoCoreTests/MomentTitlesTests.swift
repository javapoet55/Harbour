import Testing
@testable import NexdoCore

@Test func personalizedMomentTitles() {
    #expect(MomentTitles.defaultTitle(for: "birthday", firstName: " Rahul ") == "Rahul’s Birthday")
    #expect(MomentTitles.defaultTitle(for: "anniversary", firstName: "Priya") == "Priya’s Anniversary")
    #expect(MomentTitles.defaultTitle(for: "birthday", firstName: " ") == "Happy Birthday")
    #expect(MomentTitles.updating("Happy Birthday", from: "birthday", firstName: "", to: "birthday", firstName: "Rahul") == "Rahul’s Birthday")
    #expect(MomentTitles.updating("Rahul’s Birthday", from: "birthday", firstName: "Rahul", to: "anniversary", firstName: "Rahul") == "Rahul’s Anniversary")
    #expect(MomentTitles.updating("Rahul’s Birthday", from: "birthday", firstName: "Rahul", to: "birthday", firstName: "Sam") == "Sam’s Birthday")
    #expect(MomentTitles.updating("Special celebration", from: "birthday", firstName: "Rahul", to: "anniversary", firstName: "Sam") == "Special celebration")
    #expect(MomentTitles.defaultTitle(for: "festival", firstName: "Rahul") == nil)
}
