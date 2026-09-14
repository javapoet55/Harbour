import Foundation

@MainActor
final class VoiceToolExecutor: VoiceToolExecuting {
    weak var model: AppModel?
    var calendarOnly = false
    private let contacts = AppleTaskActionContacts()
    private var candidates: [String: ActionContact] = [:]
    private var ownerID: String?
    func attach(_ model: AppModel) { self.model = model; ownerID = model.profile?.id }
    func clear() { candidates.removeAll() }
    func execute(name: String, arguments: Data, sessionID: UUID, callID: String) async throws -> Data {
        guard let model, ownerID != nil, model.profile?.id == ownerID, model.aiConsent, model.voiceConsent else { throw APIError.signedOut }
        if calendarOnly && !["get_current_time", "create_calendar_event", "get_schedule", "find_free_time"].contains(name) {
            return Data("{\"success\":false,\"error\":\"This screen creates appointments and events only.\"}".utf8)
        }
        if name == "prepare_call" || name == "prepare_email" {
            guard let args = try JSONSerialization.jsonObject(with: arguments) as? [String: Any], let nameQuery = args["contactName"] as? String, !nameQuery.isEmpty, nameQuery.count <= 200 else { throw APIError.invalidResponse }
            if let token = args["candidateId"] as? String, let selected = candidates[token] {
                return try JSONSerialization.data(withJSONObject: ["success": true, "prepared": true, "contactName": selected.name, "requiresUserApproval": true, "message": "Contact selected. No call was placed and no email sent. Use the task's action button to review and approve."])
            }
            let found = try await contacts.resolve(name: nameQuery, identifier: nil)
            guard model.profile?.id == ownerID, model.aiConsent, model.voiceConsent else { throw APIError.signedOut }
            candidates.removeAll()
            let relevant = found.filter { name == "prepare_call" ? !$0.phones.isEmpty : !$0.emails.isEmpty }
            let minimal = relevant.prefix(5).map { contact -> [String: String] in
                let token = UUID().uuidString; candidates[token] = contact
                return ["candidateId": token, "name": contact.name]
            }
            return try JSONSerialization.data(withJSONObject: ["success": true, "candidates": minimal, "moreMatches": relevant.count > 5, "requiresUserApproval": true, "message": "Ask the user to select a candidate. Phone numbers and email addresses remain on device. No action executed."])
        }
        return try await model.executeVoiceTool(name: name, arguments: arguments, sessionID: sessionID, callID: callID, calendarOnly: calendarOnly)
    }
}
