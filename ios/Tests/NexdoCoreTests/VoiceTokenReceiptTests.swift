import XCTest
@testable import NexdoCore
final class VoiceTokenReceiptTests: XCTestCase {
    func testCompletedOrCancelledResponseUsage() {
        for status in ["completed", "cancelled", "failed"] {
            let event: [String: Any] = ["type":"response.done", "response":["id":"resp_1","status":status,"usage":["input_tokens":132,"output_tokens":121,"total_tokens":253]]]
            let result = VoiceTokenReceipt.parse(event)
            XCTAssertEqual(result?.totalTokens, 253)
            XCTAssertEqual(result?.id, "resp_1")
        }
    }
    func testSeparateTranscriptionAndMissingUsage() {
        XCTAssertNil(VoiceTokenReceipt.parse(["type":"response.done","response":["id":"resp_1"]]))
        let event: [String: Any] = ["type":"conversation.item.input_audio_transcription.completed","item_id":"item_1","usage":["type":"tokens","input_tokens":17,"output_tokens":9,"total_tokens":26]]
        XCTAssertEqual(VoiceTokenReceipt.parse(event)?.source, "transcription")
        XCTAssertEqual(VoiceTokenReceipt.parse(event)?.totalTokens, 26)
    }
    func testModelAndCachedModalityUsage() {
        let usage: [String: Any] = ["input_tokens":300,"output_tokens":100,"total_tokens":400,"input_token_details":["text_tokens":100,"audio_tokens":200,"cached_tokens":150,"cached_tokens_details":["text_tokens":50,"audio_tokens":100]],"output_token_details":["text_tokens":20,"audio_tokens":80]]
        let receipt = VoiceTokenReceipt.parse(["type":"response.done","response":["id":"r1","usage":usage]], responseModel: "gpt-realtime-2.1")
        XCTAssertEqual(receipt?.model, "gpt-realtime-2.1")
        XCTAssertEqual(receipt?.breakdown?.cachedAudio, 100)
        XCTAssertEqual(receipt?.breakdown?.textOutput, 20)
    }
    func testTranscriptionDurationDoesNotInventTokens() {
        let receipt = VoiceTokenReceipt.parse(["type":"conversation.item.input_audio_transcription.completed","item_id":"i1","usage":["type":"duration","seconds":30.0]], transcriptionModel: "gpt-live-transcribe")
        XCTAssertEqual(receipt?.durationSeconds, 30)
        XCTAssertEqual(receipt?.totalTokens, 0)
        XCTAssertNil(receipt?.breakdown)
    }
}
