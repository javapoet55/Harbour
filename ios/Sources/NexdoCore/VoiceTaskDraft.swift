import Foundation

struct VoiceTaskDraft: Decodable, Sendable {
    let title: String
    let notes: String
    let scheduledAt: String
    let durationMin: Int

    func validatedDate(now: Date = Date()) throws -> Date {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              title.count <= 200, notes.count <= 4000, (1...1440).contains(durationMin),
              scheduledAt.range(of: #"(Z|[+-]\d{2}:\d{2})$"#, options: .regularExpression) != nil,
              let date = ServerDate.parse(scheduledAt), date >= now.addingTimeInterval(-60) else {
            throw VoiceTaskValidationError.invalid
        }
        return date
    }
}

enum VoiceTaskValidationError: LocalizedError {
    case invalid
    var errorDescription: String? { "Please give a task title and a specific future day and time." }
}
