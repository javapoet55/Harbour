import Foundation
import Testing
@testable import NexdoCore

struct PomodoroAnalyticsTests {
    var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/Los_Angeles")!; c.firstWeekday = 2; return c }
    func date(_ text: String) -> Date { ISO8601DateFormatter().date(from: text)! }
    func finished(_ start: Date, category: PomodoroCategory = .focus, stopped: Bool = false) -> PomodoroSession {
        var s = PomodoroSession(category: category, name: "Test", durationMinutes: 25, autoBreak: false, playSound: false, now: start)
        if stopped { s.stop(at: start.addingTimeInterval(600)) } else { s.advance(at: start.addingTimeInterval(1500)) }
        return s
    }
    @Test func totalsExcludePausesAndBreaksAndUseActualStoppedTime() {
        let now = date("2026-09-26T22:00:00Z")
        let completed = finished(now.addingTimeInterval(-7200), category: .reading)
        let stopped = finished(now.addingTimeInterval(-3600), category: .coding, stopped: true)
        var paused = PomodoroSession(category: .focus, name: "", durationMinutes: 25, autoBreak: true, playSound: false, now: now.addingTimeInterval(-1000))
        paused.togglePause(at: now.addingTimeInterval(-700))
        let stats = PomodoroAnalytics(sessions: [completed, stopped, paused], period: .today, now: now, calendar: calendar)
        #expect(stats.focusSeconds == 2400)
        #expect(stats.breakSeconds == 0)
        #expect(stats.focusRate == 0.5)
        #expect(stats.sessions.count == 3)
        #expect(stats.categories.reduce(0) { $0 + $1.seconds } == stats.focusSeconds)
        #expect(stats.buckets.reduce(0) { $0 + $1.seconds } == stats.focusSeconds)
    }
    @Test func localMidnightFiltersAndPreviousDayComparison() {
        let now = date("2026-09-26T22:00:00Z")
        let yesterday = finished(date("2026-09-26T06:00:00Z"))
        let today = finished(date("2026-09-26T08:00:00Z"))
        let stats = PomodoroAnalytics(sessions: [yesterday, today], period: .today, now: now, calendar: calendar)
        #expect(stats.sessions.map(\.id) == [today.id])
        #expect(stats.previousSeconds == 1500)
        #expect(stats.changePercent == 0)
        #expect(PomodoroAnalytics(sessions: [yesterday, today], period: .all, now: now, calendar: calendar).days.count == 2)
    }
    @Test func daylightSavingBucketsAreContiguousAndDoNotDoubleCount() {
        let now = date("2026-11-02T07:30:00Z") // End of the 25-hour fall-back day in Los Angeles.
        let a = finished(date("2026-11-01T08:00:00Z"))
        let b = finished(date("2026-11-01T09:00:00Z"))
        let stats = PomodoroAnalytics(sessions: [a, b], period: .today, now: now, calendar: calendar)
        #expect(stats.interval.duration == 25 * 3600)
        #expect(stats.buckets.reduce(0) { $0 + $1.seconds } == 3000)
        #expect(stats.buckets.first?.start == stats.interval.start)
        #expect(stats.buckets.last?.end == stats.interval.end)
    }
    @Test func emptyDataHasNoInventedRatesAndStaleTimersNormalize() {
        let now = date("2026-09-26T22:00:00Z")
        let empty = PomodoroAnalytics(sessions: [], period: .all, now: now, calendar: calendar)
        #expect(empty.focusRate == nil); #expect(empty.changePercent == nil); #expect(empty.categories.isEmpty)
        let running = PomodoroSession(category: .math, name: "", durationMinutes: 25, autoBreak: true, playSound: false, now: now.addingTimeInterval(-2000))
        let restored = PomodoroAnalytics(sessions: [running, running], period: .week, now: now, calendar: calendar)
        #expect(restored.sessions.count == 1); #expect(restored.completedCount == 1)
        #expect(restored.focusSeconds == 1500); #expect(restored.breakSeconds == 300)
        #expect(restored.buckets.count == 7)
    }
    @Test func duplicateResolutionUsesStoredRevisionBeforeAdvancingClock() {
        let now = date("2026-09-26T22:00:00Z")
        let old = PomodoroSession(category: .focus, name: "", durationMinutes: 25, autoBreak: true, playSound: false, now: now.addingTimeInterval(-2000))
        var newer = old; newer.togglePause(at: now.addingTimeInterval(-1900))
        let stats = PomodoroAnalytics(sessions: [newer, old], period: .today, now: now, calendar: calendar)
        #expect(stats.sessions.count == 1); #expect(stats.sessions.first?.paused == true)
        #expect(stats.focusSeconds == 100); #expect(stats.completedCount == 0)
    }
    @Test func monthAndAllTimeKeepOlderSessions() {
        let now = date("2026-09-26T22:00:00Z")
        let older = finished(date("2026-06-01T18:00:00Z"))
        let recent = finished(date("2026-09-01T18:00:00Z"))
        #expect(PomodoroAnalytics(sessions: [older, recent], period: .month, now: now, calendar: calendar).focusSeconds == 1500)
        let all = PomodoroAnalytics(sessions: [older, recent], period: .all, now: now, calendar: calendar)
        #expect(all.focusSeconds == 3000); #expect(all.buckets.count == 4)
    }
}
