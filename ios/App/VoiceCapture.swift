import AVFoundation
import Foundation

/// One microphone recorder shared by the Tasks and Ask Nexdo entry points.
@MainActor
final class VoiceCapture: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var requestingPermission = false
    @Published private(set) var audio: Data?
    @Published private(set) var error: String?
    @Published private(set) var permissionDenied = false
    @Published private(set) var isFinishing = false
    @Published private(set) var level: Double = 0
    @Published private(set) var elapsed: TimeInterval = 0
    private var meterTask: Task<Void, Never>?
    private var recorder: AVAudioRecorder?
    private var fileURL: URL?
    private var operationID = UUID()
    private var recordingDuration: TimeInterval = 0

    func start(autoStopAfterSpeech: Bool = false) async {
        guard !isRecording, !isFinishing, !requestingPermission else { return }
        cancel()
        let id = UUID()
        operationID = id
        error = nil
        permissionDenied = false
        requestingPermission = true
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard operationID == id, !Task.isCancelled else { return }
        requestingPermission = false
        guard allowed else {
            permissionDenied = true
            error = "Microphone access is off. Enable it in Settings to ask by voice, or type your question."
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            // Keep the muted looping video running while the microphone records.
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("nexdo-voice-\(UUID().uuidString).m4a")
            fileURL = url
            let recording = try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 24000,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 64000,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ])
            recording.delegate = self
            recording.isMeteringEnabled = true
            recorder = recording
            guard recording.prepareToRecord(), recording.record(forDuration: 120) else {
                throw VoiceUploadError.invalidAudio
            }
            isRecording = true
            meterTask = Task { [weak self] in
                var speechSamples = 0
                var lastSpeech: TimeInterval = 0
                while !Task.isCancelled {
                    guard let self, let recorder = self.recorder, self.isRecording else { return }
                    recorder.updateMeters()
                    self.elapsed = recorder.currentTime
                    self.level = min(1, max(0, pow(10, Double(recorder.averagePower(forChannel: 0)) / 20)))
                    if recorder.averagePower(forChannel: 0) > -40 {
                        speechSamples += 1
                        lastSpeech = self.elapsed
                    }
                    if autoStopAfterSpeech && speechSamples >= 4 && self.elapsed - lastSpeech >= 1.8 {
                        self.stop()
                        return
                    }
                    do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
                }
            }
        } catch {
            cancel()
            self.error = "Couldn’t start the microphone. Please try again."
        }
    }

    func stop() {
        guard isRecording, let recorder else { return }
        recordingDuration = recorder.currentTime
        isFinishing = true
        isRecording = false
        meterTask?.cancel()
        recorder.stop()
        // Completion is handled by the delegate for both manual and timed stops.
    }

    func cancel() {
        operationID = UUID()
        requestingPermission = false
        meterTask?.cancel(); meterTask = nil
        isFinishing = false; level = 0; elapsed = 0
        recorder?.delegate = nil
        recorder?.stop()
        recorder = nil
        isRecording = false
        recordingDuration = 0
        audio = nil
        removeFile()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func interrupt() {
        guard isRecording else { return }
        cancel()
        error = "Recording was interrupted. Tap Record to try again."
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            guard let self, self.recorder === recorder else { return }
            self.isRecording = false
            self.isFinishing = false
            self.meterTask?.cancel(); self.meterTask = nil
            defer {
                self.recorder = nil
                self.removeFile()
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            }
            guard flag, let url = self.fileURL else {
                self.error = "The recording couldn’t be saved. Please try again."
                return
            }
            // Timed stops run for 120 seconds; short manual taps contain no useful speech.
            guard self.recordingDuration == 0 || self.recordingDuration >= 0.4,
                  let data = try? Data(contentsOf: url), !data.isEmpty, data.count <= VoiceUpload.maximumBytes else {
                self.error = "Please record a short spoken request and try again."
                return
            }
            // Release the recording audio session before handing off to networking/playback.
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            self.audio = data
        }
    }

    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: (any Error)?) {
        Task { @MainActor [weak self] in
            guard let self, self.recorder === recorder else { return }
            self.cancel()
            self.error = "Recording stopped unexpectedly. Please try again."
        }
    }

    private func removeFile() {
        if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
        fileURL = nil
    }
}
