import Foundation

private final class VoiceMock: URLProtocol, @unchecked Sendable {
    private final class State: @unchecked Sendable {
        let lock = NSLock()
        var status = 200
        var paths: [String] = []
        var approvalSent = false
    }
    private static let state = State()
    static func reset(status: Int = 200) { state.lock.withLock { state.status = status; state.paths = []; state.approvalSent = false } }
    static var paths: [String] { state.lock.withLock { state.paths } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url!.path
        let (status, approved) = Self.state.lock.withLock {
            Self.state.paths.append(path)
            return (Self.state.status, Self.state.approvalSent)
        }
        let json: String
        switch path {
        case "/api/speech":
            precondition(request.value(forHTTPHeaderField: "Accept") == "audio/mpeg")
            let payload = try! JSONSerialization.jsonObject(with: Self.body(request)) as! [String: String]
            precondition(payload["text"] == "Review")
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "audio/mpeg"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data([73, 68, 51]))
            client?.urlProtocolDidFinishLoading(self)
            return
        case "/api/transcribe":
            precondition(request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
            precondition(request.value(forHTTPHeaderField: "Authorization") == nil, "Provider credentials must not be present on the iPhone")
            json = #"{"text":"Create a task to buy groceries today."}"#
        case "/api/assistant":
            let body = Self.body(request)
            let payload = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
            if approved {
                precondition(payload?["confirmActionId"] as? String == "proposal")
                json = #"{"spoken":"Created","visual":{"summary":"Created"}}"#
            } else {
                precondition(payload?["transcript"] as? String == "Create a task to buy groceries today.")
                Self.state.lock.withLock { Self.state.approvalSent = true }
                json = #"{"spoken":"Review","visual":{"summary":"Review","tasks":["Buy groceries"]},"confirmation":{"actionId":"proposal","prompt":"Create Buy groceries?"}}"#
            }
        case "/api/tasks":
            json = #"{"tasks":[{"id":"new","title":"Buy groceries","status":"PLANNED","priority":"NORMAL","durationMin":30}]}"#
        default: json = "{}"
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
    private static func body(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var result = Data(); var bytes = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&bytes, maxLength: bytes.count)
            if count <= 0 { break }
            result.append(bytes, count: count)
        }
        return result
    }
}

@main
struct VoiceInputChecks {
    @MainActor static func main() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [VoiceMock.self]
        let model = AppModel(api: try APIClient(baseURL: URL(string: "https://nexdo.test")!, configuration: config))
        model.profile = Profile(id: "voice", name: "QA", email: "qa@example.test", timeZone: "America/Los_Angeles")
        VoiceMock.reset()
        do { _ = try await model.transcribeVoice(Data([1])); preconditionFailure("Voice requires consent") }
        catch VoiceUploadError.consentRequired {}
        precondition(VoiceMock.paths.isEmpty)
        model.aiConsent = true
        do { _ = try await model.transcribeVoice(Data([1])); preconditionFailure("Text consent alone does not cover audio") }
        catch VoiceUploadError.consentRequired {}
        precondition(VoiceMock.paths.isEmpty)
        model.voiceConsent = true
        let transcript = try await model.transcribeVoice(Data([1, 2, 3]))
        precondition(VoiceMock.paths == ["/api/transcribe"], "Transcription must not create a task")
        precondition(transcript == "Create a task to buy groceries today.")
        let proposed = await model.ask(transcript)
        precondition(proposed && model.turn?.confirmation?.actionId == "proposal")
        precondition(!VoiceMock.paths.contains("/api/tasks"), "Task data must not mutate before approval")
        let speech = try await model.speechAudio(for: model.turn!.spoken)
        precondition(speech == Data([73, 68, 51]))
        _ = try await model.speechAudio(for: model.turn!.spoken)
        precondition(VoiceMock.paths.filter { $0 == "/api/assistant" }.count == 1, "Retrying voice playback must not resubmit a task or question")
        let accepted = await model.ask("yes", accept: true)
        precondition(accepted && model.tasks.first?.title == "Buy groceries", "Approved voice task must refresh Tasks")
        print("PASS: audio consent, transcription, assistant answer, voice fetch/retry without duplicate actions, approval, and task refresh")
        model.withdrawConsent()
        precondition(!model.aiConsent && !model.voiceConsent)
        do { _ = try await model.speechAudio(for: "Review"); preconditionFailure("Speech requires sharing consent") }
        catch VoiceUploadError.consentRequired {}
        model.aiConsent = true; model.voiceConsent = true
        VoiceMock.reset(status: 401)
        do { _ = try await model.transcribeVoice(Data([1])); preconditionFailure("Expired session should fail") }
        catch APIError.signedOut {}
        precondition(model.profile == nil && !model.voiceConsent)
        print("PASS: withdrawal and expired-session cleanup")
    }
}
