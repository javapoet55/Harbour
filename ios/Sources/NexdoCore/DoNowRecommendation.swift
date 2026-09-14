import Foundation

struct DoNowResponse: Decodable, Sendable {
    let executive: DoNowRecommendation?
}
struct DoNowRecommendation: Decodable, Sendable {
    struct Choice: Decodable, Identifiable, Sendable {
        var id: String { taskId }
        let taskId: String
        let title: String
        let durationMin: Int
        let focusMinutes: Int
        let partial: Bool
        let dueAt: String?
        let reasons: [String]
    }
    struct Next: Decodable, Sendable {
        let bestAction: Choice?
        let alternatives: [Choice]
        let outsideWorkingHours: Bool?
        let remainingWorkingMinutesToday: Int?
        let availableWindowMinutes: Int
        let continuingFocus: Bool
    }
    struct Action: Decodable, Sendable { let type: String }
    let generatedAt: String
    let timeZone: String
    let summary: String
    let nextAction: Next?
    let recommendedActions: [Action]
    var canStart: Bool { recommendedActions.contains { $0.type == "START_FOCUS" } }
}

struct ProactiveNextResponse: Decodable, Sendable {
    let enabled: Bool
    let refreshAt: String?
    let recommendation: DoNowRecommendation?
    let contextActionId: String?
}

struct ProtectedTimeResponse: Decodable, Sendable {
    let proposal: ProtectedTimeProposal?
}
struct ProtectedTimeProposal: Decodable, Sendable {
    let taskId: String
    let title: String
    let startAt: String
    let endAt: String
    let durationMin: Int
    let postponeCount: Int
    let expectedUpdatedAt: String
}

/// Shared display for remaining and available time, stored in whole minutes.
enum DurationDisplay {
    static func durationLabel(_ totalMinutes: Int) -> String {
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        var parts: [String] = []
        if hours > 0 { parts.append("\(hours) hour\(hours == 1 ? "" : "s")") }
        if minutes > 0 || hours == 0 { parts.append("\(minutes) minute\(minutes == 1 ? "" : "s")") }
        return parts.joined(separator: " ")
    }
}
