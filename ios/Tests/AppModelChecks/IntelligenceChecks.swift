import Foundation

private struct Reply: Sendable {
    var status = 200
    var body = "{}"
    var headers: [String: String] = [:]
    var delay: Double = 0
    var failure: URLError.Code? = nil
}
private final class MockState: @unchecked Sendable {
    private let lock = NSLock()
    private var handler: @Sendable (URLRequest) -> Reply = { _ in Reply() }
    private var requests: [URLRequest] = []
    func configure(_ handler: @escaping @Sendable (URLRequest) -> Reply) {
        lock.withLock { self.handler = handler; requests = [] }
    }
    func reply(_ request: URLRequest) -> Reply {
        let handle = lock.withLock { requests.append(request); return handler }
        return handle(request)
    }
    func count(_ path: String) -> Int { lock.withLock { requests.filter { $0.url?.path == path }.count } }
}
private final class MockProtocol: URLProtocol, @unchecked Sendable {
    static let state = MockState()
    private let lock = NSLock()
    private var stopped = false
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let reply = Self.state.reply(request)
        DispatchQueue.global().asyncAfter(deadline: .now() + reply.delay) { [self] in
            guard !lock.withLock({ stopped }) else { return }
            if let failure = reply.failure {
                client?.urlProtocol(self, didFailWithError: URLError(failure))
                return
            }
            let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: reply.headers)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(reply.body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() { lock.withLock { stopped = true } }
}

@main
struct IntelligenceChecks {
    static func fixture(_ title: String, day: String? = nil) -> String {
        let today = day ?? ServerDate.day(ISO8601DateFormatter().string(from: Date()), timeZone: "America/Los_Angeles")!
        return """
        {"today":{"day":"\(today)","timeZone":"America/Los_Angeles","commitments":0,"appointments":0,"tasks":0,"overdue":0,"availableMinutes":60,"timeline":[],"attention":[],"recommendation":{"title":"\(title)","explanation":"Server analysis","kind":"task"}}}
        """
    }
    @MainActor static func main() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockProtocol.self]
        let model = AppModel(api: try APIClient(baseURL: URL(string: "https://nexdo.test")!, configuration: config))
        model.profile = Profile(id: "qa", name: "QA", email: "qa@example.test", timeZone: "America/Los_Angeles")
        MockProtocol.state.configure { _ in Reply(body: fixture("Current review"), delay: 0.08) }
        async let first: Void = model.refreshScheduleIntelligence()
        async let second: Void = model.refreshScheduleIntelligence()
        try await Task.sleep(for: .milliseconds(20))
        precondition(model.intelligenceLoading)
        _ = await (first, second)
        precondition(MockProtocol.state.count("/api/schedule-intelligence") == 1)
        precondition(model.scheduleIntelligence?.today.recommendation.title == "Current review" && !model.intelligenceLoading)
        print("PASS: concurrent Calendar/foreground refreshes share one request and settle loading")

        MockProtocol.state.configure { _ in Reply(status: 500) }
        await model.refreshScheduleIntelligence()
        precondition(model.intelligenceError != nil && model.error == nil && !model.intelligenceLoading)
        precondition(model.scheduleIntelligence?.today.recommendation.title == "Current review")
        MockProtocol.state.configure { _ in Reply(body: fixture("Recovered")) }
        await model.refreshScheduleIntelligence()
        precondition(model.intelligenceError == nil && model.scheduleIntelligence?.today.recommendation.title == "Recovered")
        print("PASS: failure retains the last review; independent retry recovers without a blocking alert")

        MockProtocol.state.configure { _ in Reply(body: fixture("Obsolete", day: "2020-01-01")) }
        await model.refreshScheduleIntelligence()
        precondition(model.intelligenceError != nil && model.scheduleIntelligence?.today.recommendation.title == "Recovered")
        print("PASS: outdated server days are rejected instead of presented as current")

        MockProtocol.state.configure { _ in Reply(body: fixture("Before edit"), delay: 0.2) }
        let old = Task { await model.refreshScheduleIntelligence() }
        try await Task.sleep(for: .milliseconds(30))
        MockProtocol.state.configure { request in
            if request.url?.path == "/api/tasks" {
                return Reply(body: #"{"task":{"id":"new","title":"New task","status":"PLANNED","priority":"NORMAL","durationMin":30}}"#)
            }
            return Reply(body: fixture("After edit"), delay: 0.02)
        }
        let saved = await model.saveTask(id: nil, title: "New task", notes: "", duration: 30)
        precondition(saved)
        await old.value
        // Join the refresh started by the mutation (or reload after it has finished).
        await model.refreshScheduleIntelligence()
        precondition(model.scheduleIntelligence?.today.recommendation.title == "After edit")
        precondition(!model.intelligenceLoading && model.intelligenceError == nil)
        print("PASS: saving a task invalidates the old request and reloads analysis")

        MockProtocol.state.configure { _ in Reply(body: fixture("Old account"), delay: 0.1) }
        let delayed = Task { await model.refreshScheduleIntelligence() }
        try await Task.sleep(for: .milliseconds(20))
        await model.reset()
        await delayed.value
        precondition(model.scheduleIntelligence == nil && !model.intelligenceLoading && model.intelligenceError == nil)
        print("PASS: logout cancels analysis and rejects late account data")
    }
}
