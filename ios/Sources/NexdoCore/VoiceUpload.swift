import Foundation

public enum VoiceUploadError: Error, Sendable {
    case consentRequired, invalidAudio, emptyTranscript
}

/// Bounded multipart upload. The server, not the iPhone, owns the OpenAI key.
public struct VoiceUpload: Sendable {
    public static let maximumBytes = 2 * 1024 * 1024
    public let body: Data
    public let contentType: String

    public init(audio: Data) throws {
        guard !audio.isEmpty, audio.count <= Self.maximumBytes else { throw VoiceUploadError.invalidAudio }
        let boundary = "NexdoVoice-\(UUID().uuidString)"
        contentType = "multipart/form-data; boundary=\(boundary)"
        var data = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"voice.m4a\"\r\nContent-Type: audio/mp4\r\n\r\n".utf8)
        data.append(audio)
        data.append(Data("\r\n--\(boundary)--\r\n".utf8))
        body = data
    }
}

public struct VoiceTranscript: Decodable, Sendable {
    public let text: String
    public func validatedText() throws -> String {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value.count <= 4000 else { throw VoiceUploadError.emptyTranscript }
        return value
    }
}
