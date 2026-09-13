import Foundation
import Testing
@testable import NexdoCore

@MainActor private final class MockVoiceTransport: VoiceRealtimeTransport {
    var onEvent: ((Data) -> Void)?; var onFailure: (() -> Void)?
    var sends: [[String: Any]] = []; var connects = 0; var closed = false; var silenced = 0; var muted = false
    func connect(credential: VoiceTaskSession) async throws { connects += 1 }
    func send(_ data: Data) throws { sends.append(try JSONSerialization.jsonObject(with: data) as! [String: Any]) }
    func setMuted(_ value: Bool) { muted = value }
    func silencePlayback() { silenced += 1 }
    var deferRelease = false
    var released: (@MainActor () -> Void)?
    func close() { closed = true }
    func closeAfterReleasingAudio(_ completion: @escaping @MainActor () -> Void) {
        close()
        if deferRelease { released = completion } else { completion() }
    }
}
@MainActor private final class MockVoiceTools: VoiceToolExecuting {
    var calls: [(String, [String: Any])] = []; var fails = false
    func execute(name: String, arguments: Data, sessionID: UUID, callID: String) async throws -> Data {
        let args = try JSONSerialization.jsonObject(with: arguments) as! [String: Any]; calls.append((name, args))
        if fails { return Data("{\"success\":false,\"error\":\"Database failed\"}".utf8) }
        let id = args["taskId"] as? String ?? "task-\(calls.count)"
        return try JSONSerialization.data(withJSONObject: ["success": true, "task": ["id": id, "title": args["title"] as? String ?? "Task", "status": "PLANNED", "priority": "NORMAL", "durationMin": 30, "startAt": "2027-01-01T10:00:00Z"]])
    }
}
@MainActor private final class VoiceHarness {
    let transport = MockVoiceTransport(); let tools = MockVoiceTools()
    lazy var session = VoiceConversationSession(transport: transport, executor: tools, now: { [unowned self] in self.time })
    var time = Date(); var counter = 0
    func send(_ object: [String: Any]) { session.receive(try! JSONSerialization.data(withJSONObject: object)) }
    func ready() async {
        let credential = try! JSONDecoder().decode(VoiceTaskSession.self, from: Data("{\"value\":\"mock\",\"expiresAt\":9999999999,\"model\":\"mock\"}".utf8))
        session.start(credential: credential); await Task.yield(); send(["type": "session.created"])
    }
    func tool(_ name: String, _ args: [String: Any], id: String = UUID().uuidString) -> [String: Any] {
        ["type": "function_call", "name": name, "call_id": id, "arguments": String(data: try! JSONSerialization.data(withJSONObject: args), encoding: .utf8)!]
    }
    func respond(_ calls: [[String: Any]] = []) async {
        counter += 1; let id = "r\(counter)"
        send(["type": "response.created", "response": ["id": id]])
        send(["type": "response.done", "response": ["id": id, "status": "completed", "output": calls]])
        for _ in 0..<30 { await Task.yield() }
    }
    func audioResponse() {
        counter += 1; let id = "r\(counter)"
        send(["type": "response.created", "response": ["id": id]])
        send(["type": "output_audio_buffer.started", "response_id": id])
        send(["type": "response.done", "response": ["id": id, "status": "completed", "output": []]])
        send(["type": "output_audio_buffer.stopped", "response_id": id])
    }
}
@Test @MainActor func sequentialTasksKeepOneConnectionUntilGoodbyeAudioFinishes() async {
    let h = VoiceHarness(); await h.ready()
    for title in ["Call Damien", "Groceries", "Report"] {
        await h.respond([h.tool("create_task", ["title": title])]); h.audioResponse()
        #expect(h.session.phase == .listening); #expect(!h.transport.closed)
    }
    #expect(h.session.sessionCreatedTasks.count == 3); #expect(h.transport.connects == 1)
    await h.respond([h.tool("end_session", ["reason": "explicitFinish"])])
    #expect(!h.transport.closed)
    h.send(["type": "response.created", "response": ["id": "bye"]])
    h.send(["type": "output_audio_buffer.started", "response_id": "bye"])
    h.send(["type": "response.done", "response": ["id": "bye", "status": "completed", "output": []]])
    #expect(!h.transport.closed)
    h.send(["type": "output_audio_buffer.stopped", "response_id": "bye"])
    #expect(h.transport.closed); #expect(h.session.telemetry.tasksCreated == 3)
}
@Test @MainActor func clarificationPreservesPendingIntentAndConnection() async {
    let h = VoiceHarness(); await h.ready()
    await h.respond([h.tool("set_conversation_context", ["question": "schedule", "pendingIntent": "Call Damien tomorrow"])])
    h.audioResponse()
    #expect(h.session.context.pendingIntent == "Call Damien tomorrow"); #expect(h.session.phase == .listening)
    await h.respond([h.tool("create_task", ["title": "Call Damien", "scheduledAt": "2027-01-01T10:00:00Z"])])
    #expect(h.tools.calls.count == 1); #expect(!h.transport.closed)
}
@Test @MainActor func correctionUsesDeterministicTaskIDWithoutDuplicateCreation() async {
    let h = VoiceHarness(); await h.ready()
    await h.respond([h.tool("create_task", ["title": "Call Damien"])])
    await h.respond([h.tool("update_task", ["taskId": "last", "scheduledAt": "2027-01-01T11:00:00Z"])])
    #expect(h.tools.calls.last?.1["taskId"] as? String == "task-1")
    #expect(h.session.sessionCreatedTasks.count == 1)
}
@Test @MainActor func multipleCallsAreExecutedOnceAndInOrder() async {
    let h = VoiceHarness(); await h.ready()
    let calls = [h.tool("create_task", ["title": "A"], id: "a"), h.tool("create_task", ["title": "B"], id: "b"), h.tool("create_task", ["title": "C"], id: "c")]
    await h.respond(calls); await h.respond(calls)
    #expect(h.tools.calls.count == 3); #expect(h.session.sessionCreatedTasks.map(\.title) == ["A", "B", "C"])
}
@Test @MainActor func bargeInSilencesPlaybackAndCancelledResponseCannotExecuteTools() async {
    let h = VoiceHarness(); await h.ready()
    h.send(["type": "response.created", "response": ["id": "old"]])
    h.send(["type": "output_audio_buffer.started", "response_id": "old"])
    h.send(["type": "input_audio_buffer.speech_started"])
    #expect(h.transport.silenced == 1); #expect(h.session.phase == .userSpeaking)
    h.send(["type": "response.done", "response": ["id": "old", "status": "cancelled", "output": [h.tool("create_task", ["title": "Stale"])]]])
    #expect(h.tools.calls.isEmpty)
}
@Test @MainActor func toolFailureIsReturnedWithoutSavedTaskAndSessionRemainsOpen() async {
    let h = VoiceHarness(); await h.ready(); h.tools.fails = true
    await h.respond([h.tool("create_task", ["title": "Fail"])])
    #expect(h.session.sessionCreatedTasks.isEmpty); #expect(h.session.telemetry.toolFailures == 1); #expect(!h.transport.closed)
    let results = h.transport.sends.compactMap { ($0["item"] as? [String: Any])?["output"] as? String }
    #expect(results.contains { $0.contains("Database failed") })
}
@Test @MainActor func contextualNoCannotEndRecurrenceClarification() async {
    let h = VoiceHarness(); await h.ready()
    await h.respond([h.tool("set_conversation_context", ["question": "recurrence", "pendingIntent": "Groceries"])])
    await h.respond([h.tool("end_session", ["reason": "declinedMore"])])
    #expect(!h.transport.muted); #expect(!h.transport.closed)
    await h.respond([h.tool("set_conversation_context", ["question": "anythingElse", "pendingIntent": ""])])
    await h.respond([h.tool("end_session", ["reason": "declinedMore"])])
    h.audioResponse(); #expect(h.transport.closed)
}
@Test @MainActor func inactivityNeverTerminatesWhileUserIsSpeaking() async {
    let h = VoiceHarness(); await h.ready()
    h.send(["type": "input_audio_buffer.speech_started"])
    h.time += 200; h.session.tick(); #expect(!h.transport.closed)
}
@Test @MainActor func backgroundAndMutePreventFurtherMicrophoneTransmission() async {
    let h = VoiceHarness(); await h.ready(); h.session.toggleMute(); #expect(h.transport.muted)
    h.session.background(true); h.time += 6; h.session.tick()
    #expect(h.transport.closed); #expect(h.session.telemetry.terminationReason == .appBackgrounded)
}
@Test @MainActor func inactivityWarnsThenClosesAfterFarewell() async {
    let h = VoiceHarness(); await h.ready(); h.time += 46; h.session.tick()
    #expect(h.transport.sends.last?["type"] as? String == "response.create")
    h.audioResponse(); h.time += 21; h.session.tick()
    #expect(!h.transport.closed); h.audioResponse()
    #expect(h.transport.closed); #expect(h.session.telemetry.terminationReason == .inactivityTimeout)
}
@Test @MainActor func generationCompletionBeforePlaybackDoesNotResumeListening() async {
    let h = VoiceHarness(); await h.ready()
    h.send(["type": "response.created", "response": ["id": "audio"]])
    h.send(["type": "response.done", "response": ["id": "audio", "status": "completed", "output": [["type": "message", "content": [["type": "audio"]]]]]])
    #expect(h.session.phase != .listening)
    h.send(["type": "output_audio_buffer.started", "response_id": "audio"])
    h.send(["type": "output_audio_buffer.stopped", "response_id": "audio"])
    #expect(h.session.phase == .listening)
}
@Test @MainActor func stalePlaybackStopCannotFinishNewResponse() async {
    let h = VoiceHarness(); await h.ready()
    h.send(["type": "response.created", "response": ["id": "new"]])
    h.send(["type": "output_audio_buffer.started", "response_id": "new"])
    h.send(["type": "response.done", "response": ["id": "new", "status": "completed", "output": []]])
    h.send(["type": "output_audio_buffer.stopped", "response_id": "old"])
    #expect(h.session.phase == .assistantSpeaking)
}

@Test @MainActor func requestedHandsFreeSequenceSavesEditsAndClosesOneSession() async {
    let h = VoiceHarness(); await h.ready()
    for (index, title) in ["Call Damien", "Go grocery shopping", "Submit expense report"].enumerated() {
        h.send(["type": "input_audio_buffer.speech_started"])
        h.send(["type": "input_audio_buffer.speech_stopped"])
        h.send(["type": "input_audio_buffer.committed", "item_id": "speech-\(index)"])
        await h.respond([h.tool("create_task", ["title": title])])
        h.audioResponse()
        #expect(h.session.phase == .listening)
        #expect(!h.transport.muted && !h.transport.closed)
    }
    h.send(["type": "input_audio_buffer.speech_started"])
    h.send(["type": "input_audio_buffer.speech_stopped"])
    h.send(["type": "input_audio_buffer.committed", "item_id": "correction"])
    await h.respond([h.tool("update_task", ["taskId": "last", "scheduledAt": "2027-01-01T14:30:00Z"])])
    h.audioResponse()
    #expect(h.tools.calls.last?.1["taskId"] as? String == "task-3")
    #expect(h.session.sessionCreatedTasks.count == 3)
    await h.respond([h.tool("end_session", ["reason": "explicitFinish"])])
    #expect(!h.transport.closed)
    h.audioResponse()
    #expect(h.transport.closed)
    #expect(h.transport.connects == 1)
}

@Test @MainActor func interruptedCompletedResponseCannotSaveStaleTask() async {
    let h = VoiceHarness(); await h.ready()
    h.send(["type": "response.created", "response": ["id": "interrupted"]])
    h.send(["type": "output_audio_buffer.started", "response_id": "interrupted"])
    h.send(["type": "input_audio_buffer.speech_started"])
    h.send(["type": "response.done", "response": ["id": "interrupted", "status": "completed", "output": [h.tool("create_task", ["title": "Stale task"])]]])
    for _ in 0..<30 { await Task.yield() }
    #expect(h.tools.calls.isEmpty)
    #expect(h.transport.sends.contains { $0["type"] as? String == "response.cancel" })
    #expect(h.session.phase == .userSpeaking)
}

@Test func completionIntentDependsOnActiveQuestion() {
    for word in ["No", "Nope", "No."] {
        #expect(ConversationIntent.completion(reason: "explicitFinish", question: "anythingElse", utterance: word) == .endSession)
        for question in ["schedule", "recurrence", "contact", "none"] {
            #expect(ConversationIntent.completion(reason: "explicitFinish", question: question, utterance: word) == .answerQuestion)
        }
    }
    for word in ["That's it", "That's all", "I'm done", "Nothing else", "We're good", "Done", "Finish"] {
        #expect(ConversationIntent.completion(reason: "explicitFinish", question: "anythingElse", utterance: word) == .endSession)
    }
    #expect(ConversationIntent.completion(reason: "explicitFinish", question: "schedule", utterance: "That's it") == .answerQuestion)
    #expect(ConversationIntent.completion(reason: nil, question: "none", utterance: "Finish the report tomorrow") == .continueConversation)
}

@Test @MainActor func activeQuestionSnapshotPreventsReclassifyingNoAsGoodbye() async {
    let h = VoiceHarness(); await h.ready()
    await h.respond([h.tool("set_conversation_context", ["question": "recurrence", "pendingIntent": "Call Damien"])])
    h.audioResponse()
    h.send(["type": "input_audio_buffer.speech_started"])
    h.send(["type": "input_audio_buffer.speech_stopped"])
    h.send(["type": "conversation.item.input_audio_transcription.completed", "transcript": "No"])
    await h.respond([h.tool("set_conversation_context", ["question": "anythingElse", "pendingIntent": ""]), h.tool("end_session", ["reason": "explicitFinish"])])
    #expect(!h.transport.closed)
    #expect(h.session.telemetry.terminationReason == nil)
}

@Test @MainActor func semanticGoodbyeFinishesAudioBeforeCleanupAndDismissal() async {
    let h = VoiceHarness(); await h.ready()
    await h.respond([h.tool("create_task", ["title": "Saved task"])])
    h.audioResponse()
    await h.respond([h.tool("set_conversation_context", ["question": "anythingElse", "pendingIntent": ""])])
    h.audioResponse()
    var dismissed = false
    h.session.onClose = { dismissed = true }
    h.send(["type": "input_audio_buffer.speech_started"])
    h.send(["type": "input_audio_buffer.speech_stopped"])
    h.send(["type": "conversation.item.input_audio_transcription.completed", "transcript": "Nope"])
    await h.respond([h.tool("end_session", ["reason": "declinedMore"])])
    #expect(!h.transport.closed && !h.transport.muted && !dismissed)
    h.audioResponse()
    #expect(h.transport.closed && h.transport.muted && dismissed)
    #expect(h.session.context.createdTaskIDs.isEmpty)
    #expect(h.session.context.pendingClarification == "none")
    #expect(h.session.telemetry.tasksCreated == 1)
    #expect(h.tools.calls.count == 1)
}

@Test @MainActor func dismissalWaitsForAudioSessionRelease() async {
    let h = VoiceHarness(); await h.ready()
    h.transport.deferRelease = true
    var dismissed = false
    h.session.onClose = { dismissed = true }
    h.session.close()
    #expect(h.transport.closed && !dismissed)
    h.transport.released?()
    #expect(dismissed && h.session.phase == .disconnected)
}
