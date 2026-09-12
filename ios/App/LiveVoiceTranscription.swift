import Foundation
import AVFoundation
import Combine

/// One dictated question per connection; Ask NexDo still reviews proposed actions.
@MainActor
final class LiveVoiceTranscription: ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var requestingPermission = false
    @Published private(set) var permissionDenied = false
    @Published private(set) var elapsed: TimeInterval = 0
    @Published private(set) var partial = ""
    @Published private(set) var result: String?
    @Published private(set) var error: String?
    private var transport: (any VoiceRealtimeTransport)?
    private let makeTransport: @MainActor () -> any VoiceRealtimeTransport

    private let requestPermission: () async -> Bool
    init(makeTransport: @escaping @MainActor () -> any VoiceRealtimeTransport = { VoiceWebRTCTransport() },
         requestPermission: @escaping () async -> Bool = { await AVAudioApplication.requestRecordPermission() }) {
        self.makeTransport = makeTransport; self.requestPermission = requestPermission
    }
    private var timer: Task<Void, Never>?
    private var generation = UUID()
    private var itemID: String?
    private var finishing = false

    func start(credential: VoiceTaskSession) async {
        cancel(); error = nil; partial = ""; permissionDenied = false
        let run = generation
        requestingPermission = true
        let allowed = await requestPermission()
        guard generation == run, !Task.isCancelled else { return }
        requestingPermission = false
        guard allowed else {
            permissionDenied = true
            error = "Microphone access is off. Enable it in Settings or type your question."
            return
        }
        let connection = makeTransport()
        transport = connection
        connection.onEvent = { [weak self] data in
            guard let self, self.generation == run else { return }
            self.receive(data)
        }
        connection.onFailure = { [weak self] in
            guard let self, self.generation == run else { return }
            self.fail("Live transcription disconnected. Please try again.")
        }
        // Bound both connection setup and silent recordings.
        timer = Task { [weak self] in
            for second in 1...155 {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                guard let self, self.generation == run else { return }
                if self.isRecording { self.elapsed += 1 }
                if self.elapsed >= 120 { self.stop() }
                if second == 155 { self.fail("No completed transcript arrived. Please try again.") }
            }
        }
        do {
            try await connection.connect(credential: credential)
            guard generation == run, !Task.isCancelled else { connection.close(); return }
            if !finishing { isRecording = true }
        } catch {
            guard generation == run, !Task.isCancelled else { return }
            fail("Couldn’t start live transcription. Please try again.")
        }
    }

    func stop() {
        guard isRecording, !finishing else { return }
        finishing = true; isRecording = false; transport?.setMuted(true)
        do { try transport?.send(JSONSerialization.data(withJSONObject: ["type": "input_audio_buffer.commit"])) }
        catch { fail("Couldn’t finish your question. Please try again.") }
    }

    func cancel() {
        generation = UUID(); timer?.cancel(); timer = nil
        transport?.onEvent = nil; transport?.onFailure = nil
        transport?.close(); transport = nil
        isRecording = false; requestingPermission = false; finishing = false
        elapsed = 0; itemID = nil; result = nil
    }

    private func fail(_ message: String) { cancel(); error = message }

    private func receive(_ data: Data) {
        guard let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let type = event["type"] as? String else { return }
        if type == "error" || type == "conversation.item.input_audio_transcription.failed" {
            fail("Couldn’t transcribe your question. Please try again."); return
        }
        if type == "input_audio_buffer.committed" {
            finishing = true; isRecording = false; transport?.setMuted(true)
            if itemID == nil { itemID = event["item_id"] as? String }
            return
        }
        guard type == "conversation.item.input_audio_transcription.delta" || type == "conversation.item.input_audio_transcription.completed",
              let id = event["item_id"] as? String else { return }
        if itemID == nil { itemID = id }
        guard itemID == id else { return }
        if type.hasSuffix(".delta") {
            partial += event["delta"] as? String ?? ""
            if partial.count > 4000 { fail("Please ask a shorter question.") }
        } else {
            let text = (event["transcript"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty, text.count <= 4000 else { fail("No usable speech was recognized. Please try again."); return }
            cancel(); partial = text; result = text
        }
    }
}
