import SwiftUI
import AVFoundation

struct AddTaskByVoiceView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var voice: VoiceConversationSession
    @State private var executor: VoiceToolExecutor
    @State private var consent = false
    @State private var starting = false
    @State private var readyBell: AVAudioPlayer?
    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    @State private var startupError: String?
    @State private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private let gradient = LinearGradient(colors: [.nexdoMagenta, .nexdoIndigo, .nexdoBlue], startPoint: .topLeading, endPoint: .bottomTrailing)
    init() {
        let executor = VoiceToolExecutor(); _executor = State(initialValue: executor)
        _voice = StateObject(wrappedValue: VoiceConversationSession(transport: VoiceWebRTCTransport(), executor: executor))
    }
    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground).ignoresSafeArea()
            GeometryReader { geometry in
                Circle().fill(Color.nexdoMagenta.opacity(0.06)).frame(width: 420).blur(radius: 30).offset(x: geometry.size.width / 2, y: -180)
                Circle().fill(Color.nexdoBlue.opacity(0.05)).frame(width: 400).blur(radius: 20).offset(x: -230, y: 180)
            }.ignoresSafeArea().accessibilityHidden(true)
            VStack(spacing: 0) {
                HStack {
                    Button { voice.close(); dismiss() } label: { Label("Close", systemImage: "xmark") }
                    Spacer(); Text("Add by Voice").font(.headline); Spacer()
                    Text("Close").hidden().accessibilityHidden(true)
                }.padding(20)
                ScrollView {
                    VStack(spacing: 18) {
                        Text("Speak your task").font(.largeTitle.bold()).multilineTextAlignment(.center)
                        Text("Tell me what you want to do. Keep talking to add more or make changes.")
                            .foregroundStyle(Color.nexdoSecondary).multilineTextAlignment(.center)
                        orb
                        Text(starting ? "Connecting…" : voice.status).font(.title2.bold()).foregroundStyle(Color.nexdoIndigo)
                            .accessibilityAddTraits(.updatesFrequently)
                        if let error = startupError ?? voice.error { Text(error).foregroundStyle(.red).multilineTextAlignment(.center) }
                        if !voice.transcript.isEmpty { Text(voice.transcript).frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18)) }
                        if !voice.reply.isEmpty { Text(voice.reply).multilineTextAlignment(.center).foregroundStyle(Color.nexdoSecondary) }
                        if !voice.sessionCreatedTasks.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Added this session").font(.headline)
                                ForEach(voice.sessionCreatedTasks) { task in
                                    HStack(spacing: 12) {
                                        Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(task.title).font(.headline)
                                            if let raw = task.startAt, let date = ISO8601DateFormatter().date(from: raw) ?? fractionalDate(raw) {
                                                Text(date.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened, timeZone: TimeZone(identifier: model.profile?.timeZone ?? "") ?? .current))).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                                            }
                                        }
                                        Spacer()
                                    }.padding(12).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                                }
                            }
                        } else if voice.transcript.isEmpty {
                            VStack(spacing: 12) {
                                Text("Try saying something like:").foregroundStyle(Color.nexdoSecondary)
                                Text("“Call Damien tomorrow at 11 AM”")
                                Text("“Actually make that noon”")
                                Text("“That’s all”")
                            }.font(.subheadline).padding()
                        }
                    }.padding(24)
                }
                HStack {
                    Button { voice.toggleMute() } label: { Label(voice.muted ? "Unmute" : "Mute", systemImage: voice.muted ? "mic.slash.fill" : "mic.fill") }
                        .disabled(starting || [.idle, .connecting, .closing, .disconnected, .connectionLost].contains(voice.phase))
                    Spacer()
                    Button { voice.finish(); if voice.phase == .idle { dismiss() } } label: { Text("Done").foregroundStyle(.white) }
                        .buttonStyle(.borderedProminent).disabled(voice.phase == .closing)
                }.padding(24)
            }.foregroundStyle(Color.nexdoInk)
        }.tint(.nexdoIndigo)
        .alert("Use voice to manage tasks?", isPresented: $consent) {
            Button("Allow and start") { model.aiConsent = true; model.voiceConsent = true; Task { await start() } }
            Button("Not now", role: .cancel) { dismiss() }
        } message: { Text("Your voice and relevant task details are shared with OpenAI during this conversation. Clear task requests are saved automatically. Calls and emails still require your approval.") }
        .task {
            voice.onClose = { dismiss() }
            if model.aiConsent && model.voiceConsent { await start() } else { consent = true }
        }
        .onReceive(clock) { _ in voice.tick() }
        .onChange(of: voice.phase) { _, phase in
            if phase == .listening, !voice.muted, let url = Bundle.main.url(forResource: "ListeningReady", withExtension: "wav") {
                readyBell = try? AVAudioPlayer(contentsOf: url)
                readyBell?.volume = 0.65; readyBell?.play()
            } else { readyBell?.stop() }
        }
        .onDisappear { readyBell?.stop(); voice.close(); executor.clear(); endBackgroundTask() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                voice.background(true)
                backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Finish voice session") { voice.close(reason: .appBackgrounded); endBackgroundTask() }
            } else if phase == .active {
                voice.tick(); voice.background(false); endBackgroundTask()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { event in
            if (event.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue { voice.interruptAudio() }
        }
        .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { event in
            if (event.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { voice.interruptAudio() }
        }
        .onChange(of: model.profile?.id) { _, _ in voice.close() }
        .onChange(of: model.aiConsent) { _, allowed in if !allowed { voice.close() } }
        .onChange(of: model.voiceConsent) { _, allowed in if !allowed { voice.close() } }
    }
    private func start() async {
        guard !starting, voice.phase == .idle else { return }
        starting = true; defer { starting = false }
        executor.attach(model)
        do {
            let credential = try await model.voiceTaskSession()
            try Task.checkCancellation()
            voice.start(credential: credential)
        } catch { startupError = "Couldn’t start voice. Close this screen and try again." }
    }
    private func endBackgroundTask() {
        if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask); backgroundTask = .invalid }
    }
    private func fractionalDate(_ raw: String) -> Date? {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter.date(from: raw)
    }
    private var orb: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 24, paused: reduceMotion || voice.muted || ![.listening, .userSpeaking, .assistantSpeaking, .processing, .toolExecution].contains(voice.phase))) { timeline in
            let time = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
            let active = voice.phase == .userSpeaking || voice.phase == .assistantSpeaking
            ZStack {
                ForEach(0..<3) { index in
                    Circle().stroke(Color.nexdoIndigo.opacity(0.08), lineWidth: 2)
                        .frame(width: CGFloat(185 + index * 26), height: CGFloat(185 + index * 26))
                        .scaleEffect(reduceMotion ? 1 : 1 + 0.025 * sin(time * 2 + Double(index)))
                }
                HStack(spacing: 6) {
                    ForEach(0..<25) { index in
                        Capsule().fill(Color.nexdoIndigo.opacity(0.28))
                            .frame(width: 5, height: reduceMotion ? 18 : 8 + (active ? 38 : 12) * abs(sin(time * (active ? 7 : 2) + Double(index) * 0.8)))
                    }
                }
                Image(systemName: voice.muted ? "mic.slash" : "mic")
                    .font(.system(size: 58, weight: .medium)).foregroundStyle(.white)
                    .frame(width: 146, height: 146).background(gradient, in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.8), lineWidth: 2))
                    .shadow(color: Color.nexdoIndigo.opacity(0.2), radius: 18)
            }.frame(maxWidth: .infinity).frame(height: 260)
        }.accessibilityHidden(true)
    }
}
