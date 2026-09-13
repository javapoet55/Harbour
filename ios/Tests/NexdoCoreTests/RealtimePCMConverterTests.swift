#if canImport(AVFoundation)
import AVFoundation
import Foundation
import Testing
@testable import NexdoCore

@Test func realtimeConvertsDeviceMicrophoneFormatsToNonSilentPCM() throws {
    for (rate, channels) in [(48000.0, AVAudioChannelCount(1)), (44100.0, AVAudioChannelCount(2))] {
        let format = try #require(AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: channels, interleaved: false))
        let converter = try #require(TaskPCMConverter(input: format))
        var output = Data()
        for chunk in 0..<24 {
            let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2048))
            buffer.frameLength = 2048
            for channel in 0..<Int(channels) {
                let values = try #require(buffer.floatChannelData?[channel])
                for frame in 0..<2048 {
                    values[frame] = Float(sin(2 * Double.pi * 440 * Double(chunk * 2048 + frame) / rate) * 0.3)
                }
            }
            output.append(try #require(converter.convert(buffer)))
        }
        let expectedBytes = Double(24 * 2048) / rate * 48000
        #expect(abs(Double(output.count) - expectedBytes) < 1024)
        #expect(output.contains { $0 != 0 })
        #expect(output.count % 2 == 0)
    }
}
#endif
