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
