#if canImport(AVFoundation)
import AVFoundation
import Foundation

/// Confined to the audio tap's serial callback. No actor-isolated closure enters the audio engine.
final class TaskPCMConverter: @unchecked Sendable {
    private let converter: AVAudioConverter
    private let output: AVAudioFormat
    init?(input: AVAudioFormat) {
        guard let format = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: input, to: format) else { return nil }
        output = format; self.converter = converter
    }
    private final class Input: @unchecked Sendable {
        let buffer: AVAudioPCMBuffer
        var supplied = false
        init(_ buffer: AVAudioPCMBuffer) { self.buffer = buffer }
    }
    func convert(_ buffer: AVAudioPCMBuffer) -> Data? {
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * output.sampleRate / buffer.format.sampleRate + 32)
        guard let result = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: capacity) else { return nil }
        let input = Input(buffer)
        var error: NSError?
        let status = converter.convert(to: result, error: &error) { _, status in
            guard !input.supplied else { status.pointee = .noDataNow; return nil }
            input.supplied = true; status.pointee = .haveData
            return input.buffer
        }
        guard error == nil, status != .error else { return nil }
        // A resampler can buffer an initial chunk without emitting frames.
        guard result.frameLength > 0 else { return Data() }
        guard let bytes = result.int16ChannelData?[0] else { return nil }
        return Data(bytes: bytes, count: Int(result.frameLength) * MemoryLayout<Int16>.size)
    }
}

#endif
