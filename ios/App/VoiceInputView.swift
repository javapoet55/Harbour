import SwiftUI
import AVFoundation

struct VoiceInputView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var capture = LiveVoiceTranscription()
    @StateObject private var playback = VoicePlayback()
    @State private var operation: Task<Void, Never>?
    @State private var phase: Phase = .idle
    @State private var transcript = ""
    @State private var answer = ""
    @State private var error: String?
    @State private var active = true
    @State private var began = false
    private enum Phase { case idle, greeting, listening, thinking, speaking }
    private var consented: Bool { model.aiConsent && model.voiceConsent }
    private var greeting: String {
        let name = ProfileName.firstName(from: model.profile?.name ?? "")
        return "Hello\(name.map { " " + $0 } ?? ""), I'm your Executive AI Assistant. How can I help you?"
    }
    private var status: String {
        switch phase {
        case .idle: "Your Executive AI Assistant"
        case .greeting: "Hello\(ProfileName.firstName(from: model.profile?.name ?? "").map { " " + $0 } ?? "")"
        case .listening: capture.requestingPermission ? "Waiting for microphone permission…" : "Listening…"
        case .thinking: "Thinking…"
        case .speaking: "Nexdo is speaking…"
        }
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    VoiceAnimationView(paused: scenePhase == .background)
                        .frame(height: 250).clipShape(RoundedRectangle(cornerRadius: 24)).accessibilityHidden(true)
                    Text(status).font(.title2.bold()).multilineTextAlignment(.center).accessibilityAddTraits(.isHeader)
                    if !consented {
                        Text(greeting).multilineTextAlignment(.center)
                        Text("Nexdo streams your voice and relevant task, calendar, preference, and conversation information to OpenAI to answer you. Replies use an AI-generated voice. You can withdraw permission in Account.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        Button("Allow sharing and begin") {
                            model.aiConsent = true; model.voiceConsent = true; begin()
                        }.buttonStyle(.borderedProminent)
                    } else {
                        if phase == .greeting {
                            Text(greeting).multilineTextAlignment(.center)
                            if !playback.isPlaying { ProgressView("Preparing your greeting…") }
                        }
                        if phase == .listening {
                            if !capture.partial.isEmpty { Text(capture.partial).frame(maxWidth: .infinity, alignment: .leading) }
                            Text("Speak naturally. Pause when you’re done, or tap Send now.").font(.subheadline).multilineTextAlignment(.center)
                            Text("\(Int(capture.elapsed)) seconds · Up to 2 minutes").font(.caption).foregroundStyle(Color.nexdoSecondary)
                            if capture.isRecording { Button("Send now", systemImage: "arrow.up.circle.fill") { capture.stop() }.buttonStyle(.borderedProminent) }
                        }
                        if phase == .thinking { ProgressView("Preparing your answer…") }
                        if phase == .speaking || (phase == .greeting && playback.isPlaying) {
                            Button("Stop speaking", systemImage: "stop.circle") { stop() }
                        }
                        if !transcript.isEmpty { VStack(alignment: .leading, spacing: 6) { Text("You asked").font(.caption.bold()); Text(transcript) }.frame(maxWidth: .infinity, alignment: .leading) }
                        if !answer.isEmpty { Text(answer).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled) }
                        if model.turn?.confirmation != nil && !answer.isEmpty {
                            Button("Review proposed changes") { dismiss() }.buttonStyle(.borderedProminent)
                        }
                        if phase == .idle {
                            Button(answer.isEmpty ? "Start listening" : "Ask a follow-up", systemImage: "mic.fill") { listen() }.buttonStyle(.borderedProminent)
                            if !answer.isEmpty { Button("Replay answer", systemImage: "speaker.wave.2") { speak(answer, isGreeting: false) } }
                        }
                    }
                    if let message = error ?? capture.error ?? playback.error {
                        Text(message).font(.subheadline).foregroundStyle(Color.nexdoSecondary).accessibilityAddTraits(.updatesFrequently)
                        if capture.permissionDenied { Link("Open microphone settings", destination: URL(string: UIApplication.openSettingsURLString)!) }
                    }
                }.padding(24).frame(maxWidth: .infinity)
            }
            .background(LinearGradient(colors: [.nexdoBlue.opacity(0.07), .nexdoMagenta.opacity(0.05), Color(uiColor: .systemBackground)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .navigationTitle("Executive AI Assistant").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { closeVoiceInput() } } }
            .interactiveDismissDisabled(phase != .idle).tint(.nexdoIndigo)
            .task { if !began && consented { began = true; begin() } }
            .onReceive(capture.$result) { if let text = $0 { respond(text) } }
            .onReceive(capture.$error) { if $0 != nil && phase == .listening { phase = .idle } }
            .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { notification in
                if let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, raw == AVAudioSession.InterruptionType.began.rawValue { stop(); error = "Voice was interrupted. Tap Start listening to continue." }
            }
            .onChange(of: scenePhase) { _, phase in if phase == .background { stop() } }
            .onChange(of: model.voiceConsent) { _, allowed in if !allowed { stop() } }
            .onChange(of: model.profile?.id) { _, _ in stop() }
            .onChange(of: model.aiConsent) { _, allowed in if !allowed { stop() } }
            .onDisappear { active = false; stop() }
        }
    }
    private func stop() {
        operation?.cancel(); operation = nil
        capture.cancel(); playback.stop(); phase = .idle
    }

    private func closeVoiceInput() {
        stop()
        dismiss()
    }

    private func begin() { began = true; speak(greeting, isGreeting: true) }
    private func listen() {
        guard active, consented else { return }
        stop(); error = nil; phase = .listening
        operation = Task {
            do {
                let credential = try await model.voiceTranscriptionSession()
                guard active, consented, !Task.isCancelled else { return }
                await capture.start(credential: credential)
            } catch {
                guard !Task.isCancelled else { return }
                self.error = "Couldn’t connect to live transcription. Please try again."; phase = .idle
            }
            if !Task.isCancelled && phase == .listening && capture.error != nil { phase = .idle }
        }
    }
    private func speak(_ text: String, isGreeting: Bool) {
        guard active, consented else { return }
        operation?.cancel(); playback.stop(); error = nil
        phase = isGreeting ? .greeting : .thinking
        operation = Task {
            do {
                let audio = try await model.speechAudio(for: text)
                guard active, consented, !Task.isCancelled else { return }
                phase = isGreeting ? .greeting : .speaking
                playback.play(audio) { success in
                    guard active, consented else { return }
                    phase = .idle
                    if success && isGreeting { listen() }
                }
            } catch {
                guard active, !Task.isCancelled else { return }
                self.error = error.localizedDescription; phase = .idle
            }
        }
    }
    private func respond(_ text: String) {
        guard active, consented, phase == .listening else { return }
        phase = .thinking; error = nil
        operation = Task {
            do {
                guard active, consented, !Task.isCancelled else { return }
                transcript = text; answer = ""
                let success = await model.ask(text)
                guard active, consented, !Task.isCancelled else { return }
                guard success, let spoken = model.turn?.spoken else {
                    error = model.error ?? "Nexdo could not answer. Please try again."
                    phase = .idle; return
                }
                answer = spoken
                speak(spoken, isGreeting: false)
            }
        }
    }
}
