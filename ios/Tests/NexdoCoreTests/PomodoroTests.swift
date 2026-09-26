import Foundation
import Testing
@testable import NexdoCore

struct PomodoroTests {
    let start = Date(timeIntervalSince1970: 1_790_000_000)
    func session(auto: Bool = true) -> PomodoroSession { .init(category: .focus, name: "Proposal", durationMinutes: 25, autoBreak: auto, playSound: false, now: start) }
    @Test func pauseDoesNotCountTowardFocus() {
        var s = session(); s.togglePause(at: start.addingTimeInterval(60))
        #expect(s.remaining(at: start.addingTimeInterval(600)) == 1440)
        s.togglePause(at: start.addingTimeInterval(600))
        let early = s.advance(at: start.addingTimeInterval(1500)); #expect(!early)
        let due = s.advance(at: start.addingTimeInterval(2040)); #expect(due)
        #expect(s.phase == .shortBreak); #expect(s.focusSeconds == 1500)
    }
    @Test func restoresAcrossBothDeadlinesWithoutExtraBreak() throws {
        let data = try JSONEncoder().encode(session())
        var restored = try JSONDecoder().decode(PomodoroSession.self, from: data)
        let due = restored.advance(at: start.addingTimeInterval(1900)); #expect(due)
        #expect(restored.phase == .completed); #expect(restored.breakSeconds == 300)
        #expect(restored.finishedAt == start.timeIntervalSince1970 + 1800)
        let revision = restored.revision
        let repeated = restored.advance(at: start.addingTimeInterval(2000)); #expect(!repeated)
        #expect(restored.revision == revision)
    }
    @Test func noAutoBreakCompletesAndStopIsNotCompletion() {
        var s = session(auto: false); _ = s.advance(at: start.addingTimeInterval(1500))
        #expect(s.phase == .completed); #expect(s.breakSeconds == 0)
        var stopped = session(); stopped.stop(at: start.addingTimeInterval(75))
        #expect(stopped.phase == .stopped); #expect(stopped.focusSeconds == 75)
    }
    @Test func skippingBreakPreservesActualBreakTime() {
        var s = session(); _ = s.advance(at: start.addingTimeInterval(1500))
        s.stop(at: start.addingTimeInterval(1520))
        #expect(s.phase == .completed); #expect(s.breakSeconds == 20)
    }
}
