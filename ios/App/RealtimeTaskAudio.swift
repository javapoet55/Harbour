import AVFoundation
import Foundation

/// All engine/session lifecycle operations are serialized off the UI thread.
/// The tap copies PCM bytes into a bounded stream; it never calls into a MainActor object.
final class RealtimeTaskAudio: @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.nexdo.voice-task.audio", qos: .userInitiated)
    private var engine: AVAudioEngine?
    private var tapInstalled = false
    private var continuation: AsyncThrowingStream<Data, Error>.Continuation?

    func start() async throws -> AsyncThrowingStream<Data, Error> {
        try await withCheckedThrowingContinuation { completion in
            queue.async { [self] in
                do {
                    let audio = AVAudioSession.sharedInstance()
                    try audio.setCategory(.record, mode: .measurement, options: [.allowBluetoothHFP])
                    try audio.setActive(true)
                    let engine = AVAudioEngine()
                    self.engine = engine
                    let input = engine.inputNode
                    let format = input.outputFormat(forBus: 0)
                    guard format.sampleRate > 0, format.channelCount > 0,
                          let converter = TaskPCMConverter(input: format) else { throw AudioFailure.format }
                    let (stream, continuation) = AsyncThrowingStream<Data, Error>.makeStream(bufferingPolicy: .bufferingOldest(40))
                    self.continuation = continuation
                    input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, _ in
                        guard let data = converter.convert(buffer) else {
                            continuation.finish(throwing: AudioFailure.conversion); return
                        }
                        if !data.isEmpty, case .dropped = continuation.yield(data) {
                            continuation.finish(throwing: AudioFailure.backpressure)
                        }
                    }
                    tapInstalled = true
                    engine.prepare()
                    try engine.start()
                    completion.resume(returning: stream)
                } catch {
                    teardown()
                    completion.resume(throwing: error)
                }
            }
        }
    }

    func resume() async throws {
        try await withCheckedThrowingContinuation { (completion: CheckedContinuation<Void, Error>) in
            queue.async { [self] in
                do {
                    guard let engine else { throw AudioFailure.format }
                    try engine.start()
                    completion.resume()
                } catch { completion.resume(throwing: error) }
            }
        }
    }
    func pause() { queue.async { [self] in engine?.pause() } }
    func stop() { queue.async { [self] in teardown() } }
    private func teardown() {
        continuation?.finish(); continuation = nil
        engine?.stop()
        if tapInstalled { engine?.inputNode.removeTap(onBus: 0); tapInstalled = false }
        engine = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    private enum AudioFailure: LocalizedError {
        case format, conversion, backpressure
        var errorDescription: String? {
            switch self {
            case .format: "The microphone format is unavailable. Reconnect your microphone and try again."
            case .conversion: "Couldn’t process microphone audio. Please try again."
            case .backpressure: "The connection is too slow for live voice. Please try a stronger connection."
            }
        }
    }
}

