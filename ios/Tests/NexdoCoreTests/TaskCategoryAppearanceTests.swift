import Foundation
import Testing
@testable import NexdoCore

@Test func categoryArtworkMatchesRequestedTasks() {
    for (title, kind, label) in [
        ("Go to fitness centre", TaskCategoryAppearance.Kind.fitness, "Health"),
        ("Dentist appointment", .dental, "Personal"),
        ("Review math homework", .school, "School"),
        ("Call Damien", .work, "Work"),
        ("Team sync meeting", .work, "Work"),
        ("Buy groceries", .shopping, "Shopping")
    ] {
        let result = TaskCategoryAppearance.resolve(title: title)
        #expect(result.kind == kind); #expect(result.label == label)
    }
}
@Test func categoryMatchingUsesWordsAndSpecificRules() {
    #expect(TaskCategoryAppearance.resolve(title: "Calligraphy practice").kind == .general)
    #expect(TaskCategoryAppearance.resolve(title: "Run payroll").kind == .finance)
    #expect(TaskCategoryAppearance.resolve(title: "DENTIST: check-up!").kind == .dental)
    #expect(TaskCategoryAppearance.resolve(title: "Homeworking notes").kind == .general)
    #expect(TaskCategoryAppearance.resolve(title: "Go for a run").kind == .fitness)
}
@Test func explicitCategoryLabelIsPreservedWhileArtworkMatchesTask() {
    let result = TaskCategoryAppearance.resolve(title: "Dentist appointment", categoryName: "Health")
    #expect(result.kind == .dental); #expect(result.label == "Health")
    #expect(TaskCategoryAppearance.resolve(title: "Weekly practice", categoryName: "Fitness").kind == .fitness)
    #expect(TaskCategoryAppearance.resolve(title: "Something new", categoryName: "   ").label == "Tasks")
}
@Test func taskCategoryRemainsOptionalForLegacyAndVoiceResponses() throws {
    let legacy = Data(#"{"id":"1","title":"Task","status":"PLANNED","priority":"NORMAL","durationMin":30}"#.utf8)
    #expect(try JSONDecoder().decode(NexdoTask.self, from: legacy).category == nil)
    let current = Data(#"{"id":"1","title":"Task","status":"PLANNED","priority":"NORMAL","durationMin":30,"category":{"name":"Work"}}"#.utf8)
    #expect(try JSONDecoder().decode(NexdoTask.self, from: current).category?.name == "Work")
}
