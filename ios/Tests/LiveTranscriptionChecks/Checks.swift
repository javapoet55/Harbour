import Foundation

struct VoiceTaskSession { let value = "test" }
@MainActor protocol VoiceRealtimeTransport: AnyObject {
    var onEvent: ((Data) -> Void)? { get set }
    var onFailure: (() -> Void)? { get set }
    func connect(credential: VoiceTaskSession) async throws
    func send(_ data: Data) throws
    func setMuted(_ muted: Bool)
    func close()
}
@MainActor final class VoiceWebRTCTransport: VoiceRealtimeTransport {
    var onEvent: ((Data) -> Void)?
    var onFailure: (() -> Void)?
    var sent = 0
    var closed = false
    func connect(credential: VoiceTaskSession) async throws {}
    func send(_ data: Data) throws { sent += 1 }
    func setMuted(_ muted: Bool) {}
    func close() { closed = true }
    func event(_ type: String, id: String = "one", text: String = "") {
        onEvent?(try! JSONSerialization.data(withJSONObject: ["type": type, "item_id": id, "delta": text, "transcript": text]))
    }
}
@main struct Checks {
    @MainActor static func main() async {
        let transport = VoiceWebRTCTransport()
        let capture = LiveVoiceTranscription(makeTransport: { transport }, requestPermission: { true })
        await capture.start(credential: VoiceTaskSession())
        transport.event("conversation.item.input_audio_transcription.delta", text: "Hello")
        precondition(capture.partial == "Hello")
        transport.event("conversation.item.input_audio_transcription.completed", id: "other", text: "Wrong turn")
        precondition(capture.result == nil)
        transport.event("input_audio_buffer.committed")
        capture.stop()
        precondition(transport.sent == 0, "Already committed audio must not be committed again")
        transport.event("conversation.item.input_audio_transcription.completed", text: "Hello there")
        precondition(capture.result == "Hello there" && transport.closed)

        await capture.start(credential: VoiceTaskSession())
        let stale = transport.onEvent
        capture.cancel()
        stale?(try! JSONSerialization.data(withJSONObject: ["type": "conversation.item.input_audio_transcription.completed", "item_id": "one", "transcript": "Late result"]))
        precondition(capture.result == nil)

        await capture.start(credential: VoiceTaskSession())
        capture.stop(); capture.stop()
        precondition(transport.sent == 1)
        transport.event("conversation.item.input_audio_transcription.completed", text: " ")
        precondition(capture.error != nil && capture.result == nil)

        let denied = LiveVoiceTranscription(makeTransport: { fatalError("Must not connect") }, requestPermission: { false })
        await denied.start(credential: VoiceTaskSession())
        precondition(denied.permissionDenied && !denied.isRecording)
        var permission = false
        let retry = LiveVoiceTranscription(makeTransport: { transport }, requestPermission: { permission })
        await retry.start(credential: VoiceTaskSession())
        precondition(retry.permissionDenied)
        permission = true
        await retry.start(credential: VoiceTaskSession())
        precondition(retry.isRecording && !retry.permissionDenied && retry.error == nil)
        retry.cancel()

        var pending: CheckedContinuation<Bool, Never>?
        let cancelled = LiveVoiceTranscription(makeTransport: { fatalError("Cancelled permission must not start recording") },
            requestPermission: { await withCheckedContinuation { pending = $0 } })
        let start = Task { await cancelled.start(credential: VoiceTaskSession()) }
        while pending == nil { await Task.yield() }
        precondition(cancelled.requestingPermission)
        cancelled.cancel()
        pending?.resume(returning: true)
        await start.value
        precondition(!cancelled.isRecording && !cancelled.requestingPermission)
        print("Live transcription checks passed: partial/final text, turn ordering, cancellation, manual commit, empty text, permission denial")
    }
}
