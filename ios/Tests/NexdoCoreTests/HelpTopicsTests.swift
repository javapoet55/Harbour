import Testing
@testable import NexdoCore

@Test func helpHasTenUniqueAnsweredQuestionsPerModule() {
    #expect(Set(HelpTopics.all.map(\.id)).count == 20)
    for category in HelpCategory.allCases {
        let topics = HelpTopics.search("", category: category)
        #expect(topics.count == 10)
        #expect(topics.allSatisfy { !$0.question.isEmpty && !$0.answer.isEmpty })
    }
}

@Test func helpSearchesAnswersAndKeywordsWithinSelectedCategory() {
    #expect(HelpTopics.search("  GOOGLE  ").map(\.id).contains("calendar-connect"))
    #expect(HelpTopics.search("subtasks", category: .tasks).map(\.id) == ["tasks-notes"])
    #expect(HelpTopics.search("Google", category: .tasks).isEmpty)
    #expect(HelpTopics.search("mark complete", category: .calendar).map(\.id).contains("calendar-complete"))
    #expect(HelpTopics.search("zzzz-no-topic").isEmpty)
    #expect(HelpTopics.search(" \n ").count == 20)
}
