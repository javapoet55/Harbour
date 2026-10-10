import Foundation
import Testing
@testable import NexdoCore

private func spacingTask(_ id: String, at: String?, duration: Int = 30, status: String = "PLANNED") -> NexdoTask {
    NexdoTask(id: id, title: id, status: status, priority: "NORMAL", durationMin: duration, notes: nil, startAt: at, dueAt: nil)
}
@Test func sequentialTasksHaveFifteenMinutesAfterEnd() throws {
    let date = try #require(ServerDate.parse("2026-10-10T09:47:00-07:00"))
    let first = spacingTask("first", at: "2026-10-10T09:46:00-07:00")
    let next = TaskCreationSpacing.start(at: date, durationMin: 30, tasks: [first])
    #expect(next == ServerDate.parse("2026-10-10T10:31:00-07:00"))
    let second = spacingTask("second", at: ISO8601DateFormatter().string(from: next), duration: 45)
    #expect(TaskCreationSpacing.start(at: date, durationMin: 30, tasks: [second, first]) == ServerDate.parse("2026-10-10T11:31:00-07:00"))
}
@Test func spacingKeepsAvailableSlotsAndIgnoresInactiveTasks() throws {
    let date = try #require(ServerDate.parse("2026-10-10T09:00:00Z"))
    let later = spacingTask("later", at: "2026-10-10T09:45:00Z")
    #expect(TaskCreationSpacing.start(at: date, durationMin: 30, tasks: [later]) == date)
    let ignored = [spacingTask("done", at: "2026-10-10T09:00:00Z", status: "COMPLETED"), spacingTask("cancelled", at: "2026-10-10T09:00:00Z", status: "CANCELLED"), spacingTask("undated", at: nil)]
    #expect(TaskCreationSpacing.start(at: date, durationMin: 30, tasks: ignored) == date)
}
