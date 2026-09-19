import Foundation
import AVFoundation
@preconcurrency import WebRTC

@MainActor
final class VoiceWebRTCTransport: NSObject, VoiceRealtimeTransport {
    var onEvent: ((Data) -> Void)?
    var onFailure: (() -> Void)?
    private var factory: RTCPeerConnectionFactory?
    private var peer: RTCPeerConnection?
    private var channel: RTCDataChannel?
    private var microphone: RTCAudioTrack?
    private var remoteAudio: RTCAudioTrack?
    private var run = UUID()
    private var network: URLSession?
    private let audioQueue = DispatchQueue(label: "com.nexdo.voice.audio-session")
    private var outputMuted = false
    private var responseID: String?
    private var interruptedResponseID: String?
    private var voiceVolumeObserver: NSObjectProtocol?
    private var iceDisconnectTask: Task<Void, Never>?

    override init() {
        super.init()
        voiceVolumeObserver = NotificationCenter.default.addObserver(forName: AppVoice.volumeDidChange, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.applyVoiceVolume()
            }
        }
    }

    func connect(credential: VoiceTaskSession) async throws {
        iceDisconnectTask?.cancel(); iceDisconnectTask = nil
        let token = run
        guard await AVAudioApplication.requestRecordPermission() else { throw URLError(.userAuthenticationRequired) }
        guard token == run else { throw CancellationError() }
        try await activateAudioSession()
        guard token == run else { throw CancellationError() }
        RTCInitializeSSL()
        let factory = RTCPeerConnectionFactory(); self.factory = factory
        let configuration = RTCConfiguration(); configuration.sdpSemantics = .unifiedPlan
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        guard let peer = factory.peerConnection(with: configuration, constraints: constraints, delegate: self) else { throw URLError(.cannotConnectToHost) }
        self.peer = peer
        let source = factory.audioSource(with: constraints)
        let microphone = factory.audioTrack(with: source, trackId: "nexdo-microphone")
        self.microphone = microphone; peer.add(microphone, streamIds: ["nexdo-voice"])
        let dataConfiguration = RTCDataChannelConfiguration(); dataConfiguration.isOrdered = true
        guard let channel = peer.dataChannel(forLabel: "oai-events", configuration: dataConfiguration) else { throw URLError(.cannotConnectToHost) }
        self.channel = channel; channel.delegate = self
        let offer = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<RTCSessionDescription, Error>) in
            peer.offer(for: RTCMediaConstraints(mandatoryConstraints: ["OfferToReceiveAudio": "true"], optionalConstraints: nil)) { offer, error in
                if let offer { continuation.resume(returning: offer) } else { continuation.resume(throwing: error ?? URLError(.cannotConnectToHost)) }
            }
        }
        guard run == token else { throw CancellationError() }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            peer.setLocalDescription(offer) { error in if let error { continuation.resume(throwing: error) } else { continuation.resume() } }
        }
        guard run == token else { throw CancellationError() }
        var request = URLRequest(url: URL(string: "https://api.openai.com/v1/realtime/calls")!)
        request.httpMethod = "POST"; request.timeoutInterval = 25
        request.setValue("Bearer \(credential.value)", forHTTPHeaderField: "Authorization")
        request.setValue("application/sdp", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(offer.sdp.utf8)
        let network = URLSession(configuration: .ephemeral); self.network = network
        let (answer, response) = try await network.data(for: request)
        guard run == token else { throw CancellationError() }
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode), let sdp = String(data: answer, encoding: .utf8) else { throw URLError(.badServerResponse) }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            peer.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: sdp)) { error in if let error { continuation.resume(throwing: error) } else { continuation.resume() } }
        }
    }
    func send(_ data: Data) throws {
        guard let channel, channel.readyState == .open, channel.sendData(RTCDataBuffer(data: data, isBinary: false)) else { throw URLError(.networkConnectionLost) }
    }
    func setMuted(_ muted: Bool) { microphone?.isEnabled = !muted }
    func resumeAudio() async throws {
        try await activateAudioSession()
    }
    func silencePlayback() { interruptedResponseID = responseID; outputMuted = true; remoteAudio?.isEnabled = false }
    func close() {
        run = UUID(); iceDisconnectTask?.cancel(); iceDisconnectTask = nil
        microphone?.isEnabled = false; remoteAudio?.isEnabled = false
        channel?.delegate = nil; channel?.close(); channel = nil
        peer?.delegate = nil; peer?.close(); peer = nil; microphone = nil; remoteAudio = nil; factory = nil
        network?.invalidateAndCancel(); network = nil
        audioQueue.async {
            let audio = RTCAudioSession.sharedInstance()
            audio.lockForConfiguration(); defer { audio.unlockForConfiguration() }
            try? audio.setActive(false)
        }
    }
    func closeAfterReleasingAudio(_ completion: @escaping @MainActor () -> Void) {
        close()
        // close() enqueues AVAudioSession deactivation on this same serial queue.
        audioQueue.async {
            DispatchQueue.main.async { completion() }
        }
    }
    private func deliver(_ data: Data) {
        if let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if event["type"] as? String == "response.created" { responseID = (event["response"] as? [String: Any])?["id"] as? String }
            if event["type"] as? String == "output_audio_buffer.started", let id = event["response_id"] as? String, id == responseID, id != interruptedResponseID {
                outputMuted = false; remoteAudio?.isEnabled = true
            }
        }
        onEvent?(data)
    }

    private func activateAudioSession() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            audioQueue.async {
                do {
                    let audio = RTCAudioSession.sharedInstance()
                    audio.lockForConfiguration(); defer { audio.unlockForConfiguration() }
                    try audio.setCategory(.playAndRecord, with: [.defaultToSpeaker, .allowBluetoothHFP])
                    try audio.setMode(.voiceChat)
                    try audio.setActive(true)
                    continuation.resume()
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    private func applyVoiceVolume() {
        // Realtime's track supports gain above unity. 3.0 preserves Nexdo's
        // existing +200% voice gain at the slider's 100% position.
        remoteAudio?.source.volume = AppVoice.volume * 3
    }

    private func handleICEState(_ state: RTCIceConnectionState) {
        switch state {
        case .connected, .completed:
            iceDisconnectTask?.cancel(); iceDisconnectTask = nil
        case .failed:
            iceDisconnectTask?.cancel(); iceDisconnectTask = nil
            if peer != nil { onFailure?() }
        case .disconnected:
            // iOS commonly reports a short-lived disconnected state while Wi-Fi,
            // cellular, Bluetooth, or the audio route is changing. Give ICE time
            // to recover before ending an otherwise healthy conversation.
            let expectedRun = run
            iceDisconnectTask?.cancel()
            iceDisconnectTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(8))
                guard !Task.isCancelled, let self, self.run == expectedRun, let peer = self.peer else { return }
                if peer.iceConnectionState == .disconnected || peer.iceConnectionState == .failed {
                    self.onFailure?()
                }
            }
        default:
            break
        }
    }
}
extension VoiceWebRTCTransport: RTCDataChannelDelegate {
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        if dataChannel.readyState == .closed { Task { @MainActor [weak self] in if self?.channel != nil { self?.onFailure?() } } }
    }
    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        let data = buffer.data
        DispatchQueue.main.async { [weak self] in guard self?.channel != nil else { return }; self?.deliver(data) }
    }
}
extension VoiceWebRTCTransport: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        Task { @MainActor [weak self] in
            self?.remoteAudio = stream.audioTracks.first
            self?.applyVoiceVolume()
            self?.remoteAudio?.isEnabled = !(self?.outputMuted ?? true)
        }
    }
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Task { @MainActor [weak self] in self?.handleICEState(newState) }
    }
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
