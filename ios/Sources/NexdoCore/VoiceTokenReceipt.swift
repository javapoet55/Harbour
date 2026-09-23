import Foundation

/// Numeric provider usage only; never includes conversation text or audio.
public struct VoiceTokenReceipt: Codable, Sendable, Equatable {
    public let id: String
    public let source: String
    public let inputTokens: Int
    public let outputTokens: Int
    public let totalTokens: Int

    public let model: String?
    public let breakdown: Breakdown?
    public let durationSeconds: Double?
    public struct Breakdown: Codable, Sendable, Equatable {
        public let textInput: Int; public let audioInput: Int
        public let textOutput: Int; public let audioOutput: Int
        public let cachedText: Int; public let cachedAudio: Int
    }
    public static func parse(_ event: [String: Any], responseModel: String? = nil, transcriptionModel: String? = nil) -> Self? {
        let payload: [String: Any]
        let id: String
        let source: String
        switch event["type"] as? String {
        case "response.done":
            guard let response = event["response"] as? [String: Any], let responseID = response["id"] as? String else { return nil }
            payload = response; id = responseID; source = "response"
        case "conversation.item.input_audio_transcription.completed":
            guard let itemID = event["item_id"] as? String,
                  let usage = event["usage"] as? [String: Any], ["tokens", "duration"].contains(usage["type"] as? String ?? "") else { return nil }
            payload = event; id = itemID; source = "transcription"
        default: return nil
        }
        let model = source == "response" ? (payload["model"] as? String ?? responseModel) : transcriptionModel
        if source == "transcription", let usage = payload["usage"] as? [String: Any], usage["type"] as? String == "duration",
           let seconds = usage["seconds"] as? Double, seconds.isFinite, seconds >= 0, seconds <= 86400 {
            return Self(id: id, source: source, inputTokens: 0, outputTokens: 0, totalTokens: 0, model: model, breakdown: nil, durationSeconds: seconds)
        }
        guard !id.isEmpty, let usage = payload["usage"] as? [String: Any],
              let input = usage["input_tokens"] as? Int, let output = usage["output_tokens"] as? Int,
              let total = usage["total_tokens"] as? Int,
              input >= 0, output >= 0, total >= 0, input <= 100_000_000, output <= 100_000_000,
              total <= 100_000_000, input + output == total else { return nil }
        var breakdown: Breakdown?
        if let i = usage["input_token_details"] as? [String: Any], let o = usage["output_token_details"] as? [String: Any],
           let textIn = i["text_tokens"] as? Int, let audioIn = i["audio_tokens"] as? Int,
           let textOut = o["text_tokens"] as? Int, let audioOut = o["audio_tokens"] as? Int,
           let cached = i["cached_tokens"] as? Int {
            let c = i["cached_tokens_details"] as? [String: Any]
            let ct = c?["text_tokens"] as? Int ?? (cached == 0 ? 0 : nil)
            let ca = c?["audio_tokens"] as? Int ?? (cached == 0 ? 0 : nil)
            if let ct, let ca, [textIn,audioIn,textOut,audioOut,ct,ca].allSatisfy({ $0 >= 0 && $0 <= 100_000_000 }),
               textIn + audioIn == input, textOut + audioOut == output, ct + ca == cached, ct <= textIn, ca <= audioIn {
                breakdown = Breakdown(textInput: textIn, audioInput: audioIn, textOutput: textOut, audioOutput: audioOut, cachedText: ct, cachedAudio: ca)
            }
        }
        return Self(id: id, source: source, inputTokens: input, outputTokens: output, totalTokens: total, model: model, breakdown: breakdown, durationSeconds: nil)
    }
}
