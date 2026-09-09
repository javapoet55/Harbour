import Foundation
import Testing
@testable import NexdoCore

@Test func voiceUploadPreservesAudioAndMultipartBoundary() throws {
    let audio = Data([0, 1, 2, 255])
    let upload = try VoiceUpload(audio: audio)
    let boundary = try #require(upload.contentType.components(separatedBy: "boundary=").last)
    #expect(upload.body.starts(with: Data("--\(boundary)\r\n".utf8)))
    #expect(upload.body.range(of: audio) != nil)
    #expect(upload.body.suffix(Data("\r\n--\(boundary)--\r\n".utf8).count) == Data("\r\n--\(boundary)--\r\n".utf8))
    #expect(upload.body.range(of: Data("filename=\"voice.m4a\"\r\nContent-Type: audio/mp4".utf8)) != nil)
}

@Test func voiceUploadRejectsInvalidSizesAndTranscript() throws {
    #expect(throws: VoiceUploadError.self) { try VoiceUpload(audio: Data()) }
    #expect(throws: VoiceUploadError.self) { try VoiceUpload(audio: Data(repeating: 1, count: VoiceUpload.maximumBytes + 1)) }
    for text in ["  ", String(repeating: "a", count: 4001)] {
        let json = try JSONSerialization.data(withJSONObject: ["text": text])
        let result = try JSONDecoder().decode(VoiceTranscript.self, from: json)
        #expect(throws: VoiceUploadError.self) { try result.validatedText() }
    }
    let result = try JSONDecoder().decode(VoiceTranscript.self, from: Data(#"{"text":" Buy groceries tomorrow. "}"#.utf8))
    #expect(try result.validatedText() == "Buy groceries tomorrow.")
}
