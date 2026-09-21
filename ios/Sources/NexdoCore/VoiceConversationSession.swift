import Foundation
import Combine

public struct VoiceTaskSession: Decodable, Sendable {
    public let value: String
    public let expiresAt: Double
    public let model: String
}
public enum VoicePhase: String, Sendable {
    case idle, connecting, reconnecting, paused, listening, userSpeaking, processing, toolExecution, assistantSpeaking, closing, disconnected, connectionLost
}
/// The model resolves conversational meaning; this guard prevents ambiguous
/// short answers from bypassing the question that was active when speech began.
public enum ConversationIntent: Equatable, Sendable {
    case endSession, answerQuestion, continueConversation

    public static func completion(reason: String?, question: String, utterance: String) -> Self {
        let text = utterance.lowercased().replacingOccurrences(of: "’", with: "'")
            .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        if ["no", "nope"].contains(text) || reason == "declinedMore" {
            return question == "anythingElse" ? .endSession : .answerQuestion
        }
        if ["done", "finish", "that's it"].contains(text), !["none", "anythingElse"].contains(question) {
            return .answerQuestion
        }
        return reason == "explicitFinish" ? .endSession : .continueConversation
    }
}
public enum VoiceTerminationReason: String, Sendable {
    case userVoiceCommand, userTappedDone, userClosed, inactivityTimeout, networkFailure, appBackgrounded, audioInterruption
}
public struct VoiceTimeoutConfiguration: Sendable {
    public var inactivity: TimeInterval = 45
    public var inactivityGrace: TimeInterval = 20
    public var connection: TimeInterval = 25
    public var response: TimeInterval = 40
    public var closing: TimeInterval = 15
    public var backgroundGrace: TimeInterval = 5
    public init() {}
}
public struct VoiceTaskSessionContext: Sendable {
    public var lastCreatedTaskID: String?
    public var lastModifiedTaskID: String?
    public var createdTaskIDs: [String] = []
    public var pendingIntent = ""
    public var pendingClarification = "none"
    public init() {}
    public var referencedTaskID: String? { lastModifiedTaskID ?? lastCreatedTaskID }
}
public struct VoiceTelemetry: Sendable {
    public var model = ""
    public var duration: TimeInterval = 0
    public var connectionLatency: TimeInterval = 0
    public var lastResponseLatency: TimeInterval = 0
    public var userTurns = 0
    public var tasksCreated = 0
    public var tasksUpdated = 0
    public var clarifications = 0
    public var toolCalls = 0
    public var toolFailures = 0
    public var interruptions = 0
    public var reconnectAttempts = 0
    public var successfulReconnects = 0
    public var audioInterruptions = 0
    public var terminationReason: VoiceTerminationReason?
}
@MainActor public protocol VoiceRealtimeTransport: AnyObject {
    var onEvent: ((Data) -> Void)? { get set }
    var onFailure: (() -> Void)? { get set }
    func connect(credential: VoiceTaskSession) async throws
    func send(_ data: Data) throws
    func setMuted(_ muted: Bool)
    func resumeAudio() async throws
    func silencePlayback()
    func close()
    func closeAfterReleasingAudio(_ completion: @escaping @MainActor () -> Void)
}
public extension VoiceRealtimeTransport {
    func resumeAudio() async throws {}
    func closeAfterReleasingAudio(_ completion: @escaping @MainActor () -> Void) { close(); completion() }
}
@MainActor public protocol VoiceToolExecuting: AnyObject {
    func execute(name: String, arguments: Data, sessionID: UUID, callID: String) async throws -> Data
}

/// One object, one connection, one conversation. Audio playback completion is
/// distinct from response.done (which only signals generation completion).
@MainActor public final class VoiceConversationSession: ObservableObject {
    @Published public private(set) var phase: VoicePhase = .idle
    @Published public private(set) var muted = false
    @Published public private(set) var transcript = ""
    @Published public private(set) var reply = ""
    @Published public private(set) var error: String?
    @Published public private(set) var connectionFailureDetail: String?
    @Published public private(set) var sessionCreatedTasks: [NexdoTask] = []
    public private(set) var context = VoiceTaskSessionContext()
    public private(set) var telemetry = VoiceTelemetry()
    public var onClose: (() -> Void)?
    public var onTelemetry: ((VoiceTelemetry) -> Void)?
    public let timeouts: VoiceTimeoutConfiguration
    private let transport: any VoiceRealtimeTransport
    private let executor: any VoiceToolExecuting
    private let now: () -> Date
    private var sessionID = UUID()
    private var generation = UUID()
    private var started = Date()
    private var activity = Date()
    private var phaseStarted = Date()
    private var backgrounded: Date?
    private var warned = false
    private var playbackResponse: String?
    private var activeResponse: String?
    private var responsePending = false
    private var responseCompleted = false
    private var audioPlaying = false
    private var audioFinished = false
    private var userSpeaking = false
    private var needsResponse = false
    private var closingReason: VoiceTerminationReason?
    private var results: [String: Data] = [:]
    private var queuedIDs = Set<String>()
    private var questionAtSpeechStart: String?
    private var latestUserUtterance = ""
    private var committedItems = Set<String>()
    private var interruptedResponses = Set<String>()
    private var queue: [[String: Any]] = []
    private var worker: Task<Void, Never>?
    private var starter: Task<Void, Never>?
    private var didDisconnect = false
    private var connectionEpoch = 0
    private var isReconnecting = false
    private var audioInterrupted = false
    private var mutedBeforeInterruption = false

    public init(transport: any VoiceRealtimeTransport, executor: any VoiceToolExecuting, timeouts: VoiceTimeoutConfiguration = .init(), now: @escaping () -> Date = Date.init) {
        self.transport = transport; self.executor = executor; self.timeouts = timeouts; self.now = now
        transport.onEvent = { [weak self] in self?.receive($0) }
        transport.onFailure = { [weak self] in self?.fail() }
    }
    public var status: String {
        if muted && phase != .closing && phase != .disconnected && phase != .connectionLost { return "Muted" }
        switch phase {
        case .idle: return "Ready"
        case .connecting: return "Connecting…"
        case .reconnecting: return "Reconnecting…"
        case .paused: return "Paused…"
        case .listening: return "Listening…"
        case .userSpeaking: return "Listening to you…"
        case .processing: return "Understanding…"
        case .toolExecution: return "Updating your tasks…"
        case .assistantSpeaking: return "Speaking…"
        case .closing: return "Finishing…"
        case .disconnected: return "Finished"
        case .connectionLost: return "Connection lost"
        }
    }
    public func start(credential: VoiceTaskSession) {
        guard phase == .idle else { return }
        error = nil
        started = now(); activity = started; telemetry.model = credential.model
        setPhase(.connecting)
        let run = generation
        starter = Task { [weak self] in
            guard let self else { return }
            do {
                guard credential.expiresAt > now().timeIntervalSince1970 else { throw URLError(.userAuthenticationRequired) }
                try await transport.connect(credential: credential)
                guard run == generation else { return }
            } catch { if run == generation { fail(error.localizedDescription) } }
        }
    }
    /// Replaces a failed WebRTC connection while preserving the logical voice
    /// session, saved tasks, idempotency keys, and clarification context.
    public func reconnect(credential: VoiceTaskSession) {
        guard phase == .connectionLost else { return }
        starter?.cancel(); starter = nil
        didDisconnect = false; error = nil; isReconnecting = true
        responsePending = false; responseCompleted = false; audioPlaying = false; audioFinished = false
        activeResponse = nil; playbackResponse = nil; userSpeaking = false; needsResponse = false
        audioInterrupted = false; backgrounded = nil
        telemetry.reconnectAttempts += 1
        setPhase(.reconnecting)
        let run = generation
        starter = Task { [weak self] in
            guard let self else { return }
            do {
                guard credential.expiresAt > now().timeIntervalSince1970 else { throw URLError(.userAuthenticationRequired) }
                try await transport.connect(credential: credential)
                guard run == generation else { return }
            } catch { if run == generation { fail(error.localizedDescription) } }
        }
    }
    public func restart(credential: VoiceTaskSession) {
        guard phase == .connectionLost || phase == .disconnected else { return }
        starter?.cancel(); starter = nil
        didDisconnect = false; muted = false; error = nil; connectionFailureDetail = nil
        sessionID = UUID(); generation = UUID(); context = .init(); telemetry = .init()
        isReconnecting = false; audioInterrupted = false; mutedBeforeInterruption = false
        backgrounded = nil; warned = false; playbackResponse = nil; activeResponse = nil
        responsePending = false; responseCompleted = false; audioPlaying = false; audioFinished = false
        userSpeaking = false; needsResponse = false; closingReason = nil
        results.removeAll(); queuedIDs.removeAll(); committedItems.removeAll(); interruptedResponses.removeAll(); queue.removeAll()
        questionAtSpeechStart = nil; latestUserUtterance = ""; transcript = ""; reply = ""; sessionCreatedTasks.removeAll()
        setPhase(.idle)
        start(credential: credential)
    }
    public func toggleMute() {
        guard ![.idle, .connecting, .reconnecting, .paused, .closing, .disconnected, .connectionLost].contains(phase) else { return }
        muted.toggle(); transport.setMuted(muted); activity = now()
        if muted { emit(["type": "input_audio_buffer.clear"]); userSpeaking = false; if phase == .userSpeaking { setPhase(.listening) } }
    }
    public func background(_ background: Bool) {
        backgrounded = background ? now() : nil
        transport.setMuted(background || muted || closingReason != nil)
        if background {
            if activeResponse != nil { emit(["type": "response.cancel"]) }
            if audioPlaying { emit(["type": "output_audio_buffer.clear"]) }
            transport.silencePlayback()
        } else { settle() }
    }
    public func pauseForAudioInterruption() {
        guard !didDisconnect, ![.idle, .connecting, .reconnecting, .closing, .disconnected, .connectionLost].contains(phase) else { return }
        guard !audioInterrupted else { return }
        audioInterrupted = true; mutedBeforeInterruption = muted; telemetry.audioInterruptions += 1
        transport.setMuted(true); userSpeaking = false
        if activeResponse != nil { emit(["type": "response.cancel"]) }
        if audioPlaying { emit(["type": "output_audio_buffer.clear"]) }
        transport.silencePlayback(); audioPlaying = false; audioFinished = true
        setPhase(.paused)
    }
    public func resumeAfterAudioInterruption() async {
        guard audioInterrupted, !didDisconnect else { return }
        do {
            try await transport.resumeAudio()
            guard audioInterrupted, !didDisconnect else { return }
            audioInterrupted = false; transport.setMuted(mutedBeforeInterruption)
            if worker != nil { setPhase(.toolExecution) }
            else if activeResponse != nil || responsePending { setPhase(.processing) }
            else { settle() }
        } catch { fail() }
    }
    public func recoverAudioRoute() async {
        guard !didDisconnect, ![.idle, .connecting, .reconnecting, .closing, .disconnected, .connectionLost].contains(phase) else { return }
        let alreadyInterrupted = audioInterrupted
        if !alreadyInterrupted { pauseForAudioInterruption() }
        try? await Task.sleep(for: .milliseconds(350))
        await resumeAfterAudioInterruption()
    }
    public func finish() {
        guard closingReason == nil, ![.disconnected, .connectionLost].contains(phase) else { return }
        if phase == .idle || phase == .connecting || phase == .reconnecting { close(reason: .userTappedDone); return }
        closingReason = .userTappedDone; transport.setMuted(true)
        userSpeaking = false; needsResponse = false
        // Let dispatched mutations finish; their results remain canonical even if UI closes.
        if activeResponse != nil { emit(["type": "response.cancel"]) }
        transport.silencePlayback(); emit(["type": "output_audio_buffer.clear"])
        if worker == nil && activeResponse == nil && !responsePending { farewell() }
    }
    public func close(reason: VoiceTerminationReason = .userClosed) {
        guard !didDisconnect else { return }
        didDisconnect = true
        connectionEpoch += 1
        if reason != .networkFailure { generation = UUID() }
        transport.setMuted(true); starter?.cancel(); starter = nil
        // Do not cancel a dispatched mutation: its result still reconciles the app.
        if reason != .networkFailure { queue.removeAll() }
        needsResponse = false; activeResponse = nil; responsePending = false
        telemetry.duration = now().timeIntervalSince(started); telemetry.terminationReason = reason
        onTelemetry?(telemetry)
        transport.closeAfterReleasingAudio { [weak self] in
            guard let self else { return }
            if reason != .networkFailure {
                self.context = .init(); self.results.removeAll(); self.queuedIDs.removeAll(); self.committedItems.removeAll(); self.interruptedResponses.removeAll()
                self.questionAtSpeechStart = nil; self.latestUserUtterance = ""; self.transcript = ""; self.reply = ""
                self.sessionCreatedTasks.removeAll()
            }
            self.setPhase(reason == .networkFailure ? .connectionLost : .disconnected)
            if reason != .networkFailure { self.onClose?() }
        }
    }
    public func tick() {
        guard !didDisconnect else { return }
        guard ![.idle, .disconnected, .connectionLost].contains(phase) else { return }
        let time = now()
        if let backgrounded, time.timeIntervalSince(backgrounded) >= timeouts.backgroundGrace { close(reason: .appBackgrounded); return }
        if (phase == .connecting || phase == .reconnecting) && time.timeIntervalSince(phaseStarted) > timeouts.connection { fail(); return }
        if phase == .closing && time.timeIntervalSince(phaseStarted) > timeouts.closing { close(reason: closingReason ?? .userTappedDone); return }
        if phase == .processing && time.timeIntervalSince(phaseStarted) > timeouts.response { fail(); return }
        guard phase == .listening, worker == nil, activeResponse == nil, !responsePending, !audioPlaying, !userSpeaking, backgrounded == nil else { return }
        if time.timeIntervalSince(activity) >= (warned ? timeouts.inactivityGrace : timeouts.inactivity) {
            if warned { closingReason = .inactivityTimeout; farewell() }
            else { warned = true; requestResponse(instructions: "Ask briefly: Are you still there? Then wait.") }
        }
    }
    private func setPhase(_ value: VoicePhase) { phase = value; phaseStarted = now() }
    private func emit(_ event: [String: Any]) {
        do { try transport.send(JSONSerialization.data(withJSONObject: event)) }
        catch { fail() }
    }
    private func fail(_ detail: String? = nil) {
        if let detail, !detail.isEmpty { connectionFailureDetail = detail }
        error = "The voice connection was interrupted. Saved tasks are preserved while Nexdo reconnects."
        close(reason: .networkFailure)
    }
    private func requestResponse(instructions: String? = nil) {
        guard activeResponse == nil, !responsePending, worker == nil, !userSpeaking, backgrounded == nil, !audioInterrupted else { needsResponse = true; return }
        needsResponse = false; responsePending = true; responseCompleted = false; audioFinished = false
        setPhase(closingReason == nil ? .processing : .closing)
        var response: [String: Any] = [:]
        if let instructions { response = ["instructions": instructions, "tool_choice": "none"] }
        emit(["type": "response.create", "response": response])
    }
    private func farewell() {
        requestResponse(instructions: closingReason == .inactivityTimeout ? "Say only: I'll close voice mode for now." : "Say only: You're all set.")
    }
    private func settle() {
        guard !audioInterrupted else { setPhase(.paused); return }
        guard worker == nil, activeResponse == nil, !responsePending, !audioPlaying, !userSpeaking else { return }
        if let reason = closingReason {
            if phase == .closing && responseCompleted && audioFinished { close(reason: reason) }
            else if phase != .closing { farewell() }
        } else if needsResponse { requestResponse() }
        else { activity = now(); setPhase(.listening) }
    }
    public func receive(_ data: Data) {
        guard !didDisconnect else { return }
        guard ![.disconnected, .connectionLost].contains(phase), let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let type = event["type"] as? String else { return }
        switch type {
        case "session.created":
            if isReconnecting {
                telemetry.successfulReconnects += 1
                restoreConversationContext()
            } else { telemetry.connectionLatency = now().timeIntervalSince(started) }
            guard !didDisconnect else { return }
            isReconnecting = false; error = nil; connectionFailureDetail = nil; activity = now()
            setPhase(worker == nil ? .listening : .toolExecution)
        case "input_audio_buffer.speech_started":
            guard !muted, closingReason == nil, backgrounded == nil else { return }
            if audioPlaying || activeResponse != nil {
                telemetry.interruptions += 1; transport.silencePlayback()
                if let activeResponse { interruptedResponses.insert(activeResponse); emit(["type": "response.cancel"]) }
                emit(["type": "output_audio_buffer.clear"])
            }
            audioPlaying = false; audioFinished = true; userSpeaking = true; warned = false; activity = now()
            questionAtSpeechStart = context.pendingClarification; latestUserUtterance = ""
            transcript = ""; reply = ""; setPhase(.userSpeaking)
        case "input_audio_buffer.speech_stopped":
            userSpeaking = false; if closingReason == nil { setPhase(.processing) }
            // If commit arrived first, release the queued response now. Never
            // wait for the independent transcription stream to finish.
            if needsResponse { settle() }
        case "input_audio_buffer.committed":
            guard closingReason == nil, !muted else { return }
            if let itemID = event["item_id"] as? String, !committedItems.insert(itemID).inserted { return }
            telemetry.userTurns += 1; activity = now(); needsResponse = true; settle()
        case "conversation.item.input_audio_transcription.delta":
            if !muted { transcript += event["delta"] as? String ?? "" }
        case "conversation.item.input_audio_transcription.completed":
            if !muted { transcript = event["transcript"] as? String ?? ""; latestUserUtterance = transcript }
        case "response.created":
            responsePending = false; activeResponse = (event["response"] as? [String: Any])?["id"] as? String
            playbackResponse = activeResponse
            if closingReason == nil && !userSpeaking { setPhase(.processing) }
            reply = ""; responseCompleted = false; audioFinished = false
            if closingReason != nil && phase != .closing { emit(["type": "response.cancel"]) }
        case "response.output_audio_transcript.delta":
            if event["response_id"] as? String == activeResponse { reply += event["delta"] as? String ?? "" }
        case "output_audio_buffer.started":
            guard event["response_id"] as? String == playbackResponse, !userSpeaking else { return }
            audioPlaying = true; audioFinished = false
            telemetry.lastResponseLatency = now().timeIntervalSince(activity)
            if closingReason == nil { setPhase(.assistantSpeaking) }
        case "output_audio_buffer.stopped", "output_audio_buffer.cleared":
            guard event["response_id"] as? String == playbackResponse else { return }
            audioPlaying = false; audioFinished = true; settle()
        case "response.done":
            guard let response = event["response"] as? [String: Any], let id = response["id"] as? String, id == activeResponse else { return }
            activeResponse = nil; responsePending = false
            responseCompleted = response["status"] as? String == "completed" && !interruptedResponses.contains(id)
            let output = response["output"] as? [[String: Any]] ?? []
            let hasAudio = output.contains { item in
                (item["content"] as? [[String: Any]] ?? []).contains { $0["type"] as? String == "audio" || $0["type"] as? String == "output_audio" }
            }
            if hasAudio && !audioFinished && !userSpeaking { audioPlaying = true }
            if responseCompleted && closingReason == nil {
                let calls = (response["output"] as? [[String: Any]] ?? []).filter { $0["type"] as? String == "function_call" }
                for call in calls { if let id = call["call_id"] as? String, queuedIDs.insert(id).inserted { queue.append(call) } }
                if !queue.isEmpty { startTools() }
            } else if !responseCompleted { audioFinished = true; audioPlaying = false }
            settle()
        case "error":
            let code = (event["error"] as? [String: Any])?["code"] as? String
            if code == "response_cancel_not_active" || code == "conversation_already_has_active_response" { return }
            fail()
        default: break
        }
    }
    private func restoreConversationContext() {
        var details: [String] = ["The realtime connection was restored. Do not respond to this recovery note."]
        if !sessionCreatedTasks.isEmpty {
            details.append("Tasks already saved during this voice session: " + sessionCreatedTasks.map { "\($0.title) [id=\($0.id)]" }.joined(separator: "; "))
        }
        if !context.pendingIntent.isEmpty { details.append("Pending user intent: \(context.pendingIntent)") }
        if context.pendingClarification != "none" { details.append("Pending clarification: \(context.pendingClarification)") }
        if !latestUserUtterance.isEmpty { details.append("Last completed user transcript: \(latestUserUtterance)") }
        emit(["type": "conversation.item.create", "item": ["type": "message", "role": "user", "content": [["type": "input_text", "text": details.joined(separator: "\n")]]]])
    }
    private func startTools() {
        guard worker == nil else { return }
        let run = generation
        let toolConnectionEpoch = connectionEpoch
        setPhase(.toolExecution)
        worker = Task { [weak self] in
            guard let self else { return }
            while !queue.isEmpty, generation == run {
                let call = queue.removeFirst()
                guard let id = call["call_id"] as? String, let name = call["name"] as? String,
                      let raw = call["arguments"] as? String else { continue }
                telemetry.toolCalls += 1
                var result: Data
                do {
                    guard var args = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any] else { throw URLError(.cannotParseResponse) }
                    if args["taskId"] as? String == "last" {
                        guard let target = context.referencedTaskID else { throw URLError(.resourceUnavailable) }
                        args["taskId"] = target
                    }
                    if let cached = results[id] { result = cached }
                    else if name == "set_conversation_context" {
                        let question = args["question"] as? String ?? "none"
                        guard ["none", "anythingElse", "schedule", "recurrence", "contact"].contains(question) else { throw URLError(.cannotParseResponse) }
                        context.pendingClarification = question; context.pendingIntent = String((args["pendingIntent"] as? String ?? "").prefix(2000))
                        if question != "none" && question != "anythingElse" { telemetry.clarifications += 1 }
                        result = Data("{\"success\":true}".utf8)
                    } else if name == "end_session" {
                        let reason = args["reason"] as? String
                        let intent = ConversationIntent.completion(reason: reason, question: questionAtSpeechStart ?? context.pendingClarification, utterance: latestUserUtterance)
                        if intent == .endSession {
                            closingReason = .userVoiceCommand
                            result = Data("{\"success\":true}".utf8)
                        } else { result = Data("{\"success\":false,\"error\":\"No answers the pending clarification. Continue the conversation.\"}".utf8) }
                    } else {
                        result = try await executor.execute(name: name, arguments: JSONSerialization.data(withJSONObject: args), sessionID: sessionID, callID: id)
                    }
                } catch { result = Data("{\"success\":false,\"error\":\"Operation could not be confirmed. Check current tasks before retrying. Do not claim success.\"}".utf8) }
                guard generation == run else { worker = nil; return }
                results[id] = result
                if let object = try? JSONSerialization.jsonObject(with: result) as? [String: Any] {
                    if object["success"] as? Bool != true { telemetry.toolFailures += 1 }
                    if object["success"] as? Bool == true, let objectTask = object["task"], let data = try? JSONSerialization.data(withJSONObject: objectTask), let task = try? JSONDecoder().decode(NexdoTask.self, from: data) {
                        if name == "create_task" || name == "create_reminder" {
                            context.lastCreatedTaskID = task.id; context.lastModifiedTaskID = task.id
                            if !context.createdTaskIDs.contains(task.id) { context.createdTaskIDs.append(task.id); sessionCreatedTasks.append(task); telemetry.tasksCreated += 1 }
                        } else {
                            context.lastModifiedTaskID = task.id
                            if name == "update_task" { telemetry.tasksUpdated += 1 }
                            if let index = sessionCreatedTasks.firstIndex(where: { $0.id == task.id }) {
                                if name == "delete_task" { sessionCreatedTasks.remove(at: index) } else { sessionCreatedTasks[index] = task }
                            }
                        }
                    }
                }
                if !didDisconnect, connectionEpoch == toolConnectionEpoch {
                    emit(["type": "conversation.item.create", "item": ["type": "function_call_output", "call_id": id, "output": String(decoding: result, as: UTF8.self)]])
                }
            }
            worker = nil
            guard run == generation else { return }
            if connectionEpoch != toolConnectionEpoch || didDisconnect {
                if !didDisconnect { restoreConversationContext(); setPhase(.listening) }
                return
            }
            if closingReason != nil { farewell() }
            else { needsResponse = true; settle() }
        }
    }
}
