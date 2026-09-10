import Foundation
import Testing
@testable import NexdoCore

@Test func overdueListUsesDeadlinesAndExcludesFinishedWork() throws {
    func task(_ id: String, _ due: String?, status: String = "PLANNED", start: String? = nil) -> NexdoTask {
        NexdoTask(id: id, title: id, status: status, priority: "NORMAL", durationMin: 30, notes: nil, startAt: start, dueAt: due)
    }
    let now = try #require(ServerDate.parse("2026-09-09T16:00:00Z"))
    let past = "2026-09-09T08:00:00-07:00"
    let tasks = [
        task("older", "2026-09-08T08:00:00Z"),
        task("recent", past, start: "2026-09-10T08:00:00Z"),
        task("done", past, status: "COMPLETED"),
        task("cancelled", past, status: "CANCELLED"),
        task("scheduledOnly", nil, start: past),
        task("atNow", "2026-09-09T16:00:00Z"),
        task("future", "2026-09-10T08:00:00Z"),
        task("invalid", "invalid")
    ]
    #expect(OverdueTasks.results(tasks, now: now).map(\.id) == ["older", "recent"])
    #expect(OverdueTasks.results([], now: now).isEmpty)
}
