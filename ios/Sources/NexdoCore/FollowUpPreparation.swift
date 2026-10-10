import Foundation

public struct FollowUpPreparation: Codable, Equatable, Sendable {
    public struct Check: Codable, Equatable, Identifiable, Sendable {
        public var id = UUID().uuidString
        public var title: String
        public var done = false
        public init(_ title: String) { self.title = title }
    }
    public struct Outcome: Codable, Equatable, Identifiable, Sendable {
        public var id = UUID().uuidString
        public var date: String
        public var result: String
        public var notes: String
        public init(result: String, notes: String, now: Date = Date()) {
            self.result = result; self.notes = notes; date = ISO8601DateFormatter().string(from: now)
        }
    }
    public var company: String
    public var purpose: String
    public var phone = ""
    public var email = ""
    public var notes: String
    public var draft: String
    public var checklist: [Check]
    public var outcomes: [Outcome] = []
    public init(company: String, purpose: String, notes: String) {
        self.company = company; self.purpose = purpose; self.notes = notes
        draft = "Hello,\n\nI’m following up" + (purpose.isEmpty ? "." : " regarding \(purpose).") + " Could you please share an update and the next steps?\n\nThank you."
        checklist = [Check("Confirm the purpose and desired result"), Check("Have relevant reference numbers and documents ready"), Check("Review previous notes and questions"), Check("Record the response and next steps")]
    }
}
public struct FollowUpEnvelope: Codable, Sendable {
    public var revision: Int
    public var preparation: FollowUpPreparation?
    public init(revision: Int = 0, preparation: FollowUpPreparation? = nil) { self.revision = revision; self.preparation = preparation }
}
