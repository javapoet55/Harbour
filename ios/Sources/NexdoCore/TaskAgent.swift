import Foundation
public struct TaskAgentEnvelope: Decodable, Sendable { public let run: TaskAgentRun?; public let intent: Intent?
 public struct Intent: Decodable, Sendable { public let eligible: Bool?; public let category: String?; public let reason: String? }
}
public struct TaskAgentRun: Decodable, Sendable, Identifiable {
    public let id: String
    public let status: String
    public let version: Int
    public let service: String
    public let urgency: String
    public let slots: Slots
    public let steps: [Step]
    public let candidates: [Candidate]
    public let warnings: [String]
    public let question: Question?
    public let error: String?
    public struct Slots: Decodable, Sendable { public let location: String; public let budget: String; public let constraints: String }
    public struct Step: Decodable, Sendable, Identifiable { public let id: String; public let title: String; public let status: String; public let detail: String }
    public struct Question: Decodable, Sendable { public let key: String; public let text: String }
    public struct Candidate: Decodable, Sendable, Identifiable {
        public let website: String?; public let googlePlaceId: String?; public let feedback: [Feedback]?; public let attributions: [Attribution]?
        public let id: String; public let name: String; public let address: String; public let phone: String; public let reason: String; public let draft: String; public let evidence: [Evidence]
    }
    public struct Attribution: Decodable, Sendable { public let provider: String; public let url: String? }
    public struct Feedback: Decodable, Sendable { public let author: String; public let authorUrl: String?; public let photoUrl: String?; public let url: String; public let rating: Double?; public let text: String; public let published: String }
    public struct Evidence: Decodable, Sendable { public let source: String; public let url: String }
}
