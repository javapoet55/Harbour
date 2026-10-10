import Testing
@testable import NexdoCore

@Test func taskDisplayOrderMovesAcrossTimesAndSurvivesReload() throws {
    let chronological = ["early", "middle", "late"]
    let saved = try #require(TaskDisplayOrder.moving("late", to: "early", in: chronological))
    #expect(saved == ["late", "early", "middle"])
    #expect(TaskDisplayOrder.sorted(chronological, saved: saved) == saved)
    #expect(TaskDisplayOrder.moving("late", to: "middle", in: saved) == ["early", "middle", "late"])
}
@Test func taskDisplayOrderPreservesFilteredAndNewItems() {
    #expect(TaskDisplayOrder.sorted(["b", "new"], saved: ["a", "b", "deleted"]) == ["b", "new"])
    #expect(TaskDisplayOrder.moving("other-day", to: "b", in: ["b"]) == nil)
    #expect(TaskDisplayOrder.moving("b", to: "b", in: ["b"]) == nil)
}
