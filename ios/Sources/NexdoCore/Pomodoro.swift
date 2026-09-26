import Foundation

public enum PomodoroCategory: String, Codable, CaseIterable, Sendable {
    case reading, focus, coding, diary, math, stretching
    public var title: String {
        switch self { case .reading: "Reading"; case .focus: "Focus time"; case .coding: "Coding"; case .diary: "Write a diary"; case .math: "Math study"; case .stretching: "Stretching" }
    }
    public var icon: String {
        switch self { case .reading: "book.fill"; case .focus: "stopwatch.fill"; case .coding: "chevron.left.forwardslash.chevron.right"; case .diary: "heart.fill"; case .math: "graduationcap.fill"; case .stretching: "figure.flexibility" }
    }
}

public struct PomodoroSession: Codable, Identifiable, Equatable, Sendable {
    public enum Phase: String, Codable, Sendable { case focus, shortBreak, completed, stopped }
    public var id: String
    public var category: PomodoroCategory
    public var name: String
    public var durationMinutes: Int
    public var autoBreak: Bool
    public var playSound: Bool
    public var keepAwake: Bool
    public var phase: Phase = .focus
    public var paused = false
    public var deadline: Double?
    public var pausedRemaining: Double?
    public var focusSeconds: Double = 0
    public var breakSeconds: Double = 0
    public var startedAt: Double
    public var updatedAt: Double
    public var finishedAt: Double?
    public var revision: Int = 1
    public var active: Bool { phase == .focus || phase == .shortBreak }

    public init(category: PomodoroCategory, name: String, durationMinutes: Int, autoBreak: Bool, playSound: Bool, keepAwake: Bool = true, now: Date = Date()) {
        id = UUID().uuidString
        self.category = category; self.name = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120))
        self.durationMinutes = min(120, max(1, durationMinutes)); self.autoBreak = autoBreak
        self.playSound = playSound; self.keepAwake = keepAwake
        startedAt = now.timeIntervalSince1970; updatedAt = startedAt
        deadline = startedAt + Double(self.durationMinutes * 60)
    }
    public func remaining(at now: Date) -> Double {
        guard active else { return 0 }
        return max(0, paused ? (pausedRemaining ?? 0) : (deadline ?? now.timeIntervalSince1970) - now.timeIntervalSince1970)
    }
    public func progress(at now: Date) -> Double {
        let total = Double(phase == .shortBreak ? 300 : durationMinutes * 60)
        return min(1, max(0, 1 - remaining(at: now) / total))
    }
    private mutating func changed(_ now: Date) { revision += 1; updatedAt = now.timeIntervalSince1970 }
    @discardableResult public mutating func advance(at now: Date) -> Bool {
        guard active, !paused, let end = deadline, now.timeIntervalSince1970 >= end else { return false }
        if phase == .focus {
            focusSeconds = Double(durationMinutes * 60)
            if autoBreak {
                phase = .shortBreak; deadline = end + 300
                if now.timeIntervalSince1970 >= end + 300 { breakSeconds = 300; finish(at: end + 300) }
            } else { finish(at: end) }
        } else { breakSeconds = 300; finish(at: end) }
        changed(now); return true
    }
    private mutating func finish(at time: Double) {
        phase = .completed; finishedAt = time; deadline = nil; pausedRemaining = nil; paused = false
    }
    public mutating func togglePause(at now: Date) {
        _ = advance(at: now)
        guard active else { return }
        if paused { deadline = now.timeIntervalSince1970 + (pausedRemaining ?? 0); pausedRemaining = nil; paused = false }
        else { pausedRemaining = remaining(at: now); deadline = nil; paused = true }
        changed(now)
    }
    public mutating func stop(at now: Date) {
        _ = advance(at: now)
        guard active else { return }
        if phase == .focus { focusSeconds = max(0, Double(durationMinutes * 60) - remaining(at: now)); phase = .stopped }
        else { breakSeconds = max(0, 300 - remaining(at: now)); phase = .completed }
        finishedAt = now.timeIntervalSince1970; deadline = nil; pausedRemaining = nil; paused = false; changed(now)
    }
    public mutating func setKeepAwake(_ value: Bool, at now: Date) { keepAwake = value; changed(now) }
}
