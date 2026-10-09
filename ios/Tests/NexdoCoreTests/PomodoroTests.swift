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
    @Test func stopBeforeStartKeepsServerSchemaInvariants() {
        // A backward clock jump must not produce a session the API schema rejects
        // (finishedAt/updatedAt below startedAt), which would stay pending forever.
        var skewed = session(); skewed.stop(at: start.addingTimeInterval(-60))
        #expect(skewed.phase == .stopped)
        #expect(skewed.finishedAt == start.timeIntervalSince1970)
        #expect(skewed.updatedAt >= skewed.startedAt)
        var paused = session(); _ = paused.togglePause(at: start.addingTimeInterval(-30))
        #expect(paused.updatedAt >= paused.startedAt)
    }
    @Test func skippingBreakPreservesActualBreakTime() {
        var s = session(); _ = s.advance(at: start.addingTimeInterval(1500))
        s.stop(at: start.addingTimeInterval(1520))
        #expect(s.phase == .completed); #expect(s.breakSeconds == 20)
    }
}

@Test func sessionNamesAreCappedAt120CodePointsWithoutSplittingAnEmoji() {
    #expect(PomodoroSession.limitName(String(repeating: "a", count: 130)).unicodeScalars.count == 120)
    // 📚 is one code point: 120 fit, as on the server.
    #expect(PomodoroSession.limitName(String(repeating: "📚", count: 121)) == String(repeating: "📚", count: 120))
    // 👨‍👩‍👧 is one character but five code points: 24 fit (120), and the 25th is not cut in half.
    let family = "👨‍👩‍👧"
    #expect(PomodoroSession.limitName(String(repeating: family, count: 30)) == String(repeating: family, count: 24))
    #expect(PomodoroSession.limitName("ab" + String(repeating: family, count: 24)) == "ab" + String(repeating: family, count: 23))
    #expect(PomodoroSession.limitName("Deep work") == "Deep work")
    let session = PomodoroSession(category: .focus, name: "  " + String(repeating: family, count: 30), durationMinutes: 25, autoBreak: true, playSound: false)
    #expect(session.name.unicodeScalars.count <= 120)
}

@Test func personalWorkAndSoundPreferenceSurviveSaveAndRestore() throws {
    for enabled in [false, true] {
        let session = PomodoroSession(category: .personalWork, name: "Home paperwork", durationMinutes: 25,
                                      autoBreak: true, playSound: enabled)
        let restored = try JSONDecoder().decode(PomodoroSession.self, from: JSONEncoder().encode(session))
        #expect(restored.category == .personalWork)
        #expect(restored.playSound == enabled)
        #expect(restored.category.title == "Personal Work")
        #expect(!restored.category.icon.isEmpty)
    }
}

@Test func pomodoroSoundPlaysOnceAtEachAutomaticBoundaryOnlyWhenEnabled() {
    let start = Date(timeIntervalSince1970: 1_790_000_000)
    for enabled in [false, true] {
        var session = PomodoroSession(category: .personalWork, name: "", durationMinutes: 25,
                                      autoBreak: true, playSound: enabled, now: start)
        #expect(!session.tick(at: start.addingTimeInterval(1499)).shouldPlaySound)
        #expect(session.tick(at: start.addingTimeInterval(1500)).shouldPlaySound == enabled)
        #expect(session.phase == .shortBreak)
        #expect(!session.tick(at: start.addingTimeInterval(1501)).shouldPlaySound)
        #expect(session.tick(at: start.addingTimeInterval(1800)).shouldPlaySound == enabled)
        #expect(!session.tick(at: start.addingTimeInterval(1801)).shouldPlaySound)
    }
}

@Test func pomodoroSoundRespectsPauseStopAndNoBreak() {
    let start = Date(timeIntervalSince1970: 1_790_000_000)
    var session = PomodoroSession(category: .personalWork, name: "", durationMinutes: 25,
                                  autoBreak: false, playSound: true, now: start)
    _ = session.togglePause(at: start.addingTimeInterval(60))
    #expect(!session.tick(at: start.addingTimeInterval(2000)).shouldPlaySound)
    _ = session.togglePause(at: start.addingTimeInterval(2000))
    #expect(session.tick(at: start.addingTimeInterval(3440)).shouldPlaySound)
    #expect(session.phase == .completed)
    session = PomodoroSession(category: .personalWork, name: "", durationMinutes: 25,
                              autoBreak: true, playSound: true, now: start)
    session.stop(at: start.addingTimeInterval(20))
    #expect(!session.tick(at: start.addingTimeInterval(2000)).shouldPlaySound)
}
