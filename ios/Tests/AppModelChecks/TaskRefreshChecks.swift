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
struct TaskRefreshChecks {
    @MainActor static func model() throws -> AppModel {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockProtocol.self]
        let api = try APIClient(baseURL: URL(string: "https://nexdo.test")!, configuration: configuration)
        let model = AppModel(api: api)
        model.profile = Profile(id: "qa", name: "QA", email: "qa@example.test", timeZone: "America/Los_Angeles")
        return model
    }
    static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        precondition(condition(), message)
    }
    static func body(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var data = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
    @MainActor static func main() async throws {
        // A hanging/failing optional service must not keep Tasks loading.
        MockProtocol.state.configure { request in
            if request.url?.path == "/api/tasks" {
                expect(request.timeoutInterval == 15, "Task reads need a bounded timeout")
                return Reply(body: "{\"tasks\":[]}", delay: 0.02)
            }
            return Reply(status: 500, delay: 1)
        }
        let first = try model()
        let start = Date()
        await first.refresh()
        expect(Date().timeIntervalSince(start) < 0.5, "Task refresh waited for optional services")
        expect(!first.tasksLoading && !first.busy && !first.tasksLoadFailed && first.error == nil, "Refresh did not settle independently")
        await first.reset()
        print("PASS: task refresh finishes before slow optional services")

        // Inline failure retains data, and a subsequent retry clears the error.
        let second = try model()
        let retained = NexdoTask(id: "retained", title: "Keep me", status: "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: nil, dueAt: nil)
        second.tasks = [retained]
        MockProtocol.state.configure { _ in Reply(status: 500) }
        await second.refreshTasks()
        expect(second.tasks.first?.id == "retained" && second.tasksLoadFailed && !second.tasksLoading && second.error == nil, "Failure lost tasks or raised a blocking alert")
        MockProtocol.state.configure { _ in Reply(body: "{\"tasks\":[]}") }
        await second.refreshTasks()
        expect(!second.tasksLoadFailed && !second.tasksLoading, "Retry did not clear loading/error")
        await second.reset()
        print("PASS: failed task read retains data; retry settles")

        // Duplicate loads coalesce; an old GET cannot erase a successful POST.
        MockProtocol.state.configure { request in
            if request.httpMethod == "POST" {
                let input = try! JSONSerialization.jsonObject(with: body(request)) as! [String: Any]
                let at = input["startAt"] as! String
                let payload: [String: Any] = ["task": ["id": "created", "title": input["title"]!, "notes": "", "status": "PLANNED", "priority": "NORMAL", "durationMin": 30, "startAt": at, "dueAt": at]]
                return Reply(body: String(data: try! JSONSerialization.data(withJSONObject: payload), encoding: .utf8)!)
            }
            return Reply(body: "{\"tasks\":[]}", delay: 0.3)
        }
        let third = try model()
        let pending = Task { await third.refreshTasks() }
        try await Task.sleep(for: .milliseconds(50))
        await third.refreshTasks()
        expect(MockProtocol.state.count("/api/tasks") == 1, "Duplicate task requests were started")
        let saved = await third.saveTask(id: nil, title: "New task", notes: "", duration: 30)
        expect(saved && third.taskQuery.date == .today, "Create must reveal Today")
        expect(third.taskQuery.results(third.tasks, timeZone: "America/Los_Angeles").first?.id == "created", "Created task not visible today")
        await pending.value
        expect(third.tasks.first?.id == "created", "Old task response erased a successful creation")
        expect(MockProtocol.state.count("/api/agenda") == 0, "Task save/refresh fetched unrelated data")
        await third.reset()
        print("PASS: Today creation, duplicate refresh protection, stale GET protection")

        MockProtocol.state.configure { _ in Reply(failure: .timedOut) }
        let timedOut = try model()
        await timedOut.refreshTasks()
        expect(!timedOut.tasksLoading && !timedOut.busy && timedOut.tasksLoadFailed && timedOut.error == nil, "Timeout left a spinner or blocking dialog")
        await timedOut.reset()
        print("PASS: timed-out task request clears spinner and permits retry")

        // The observed legacy login redirect is an expired session, not a spinner loop.
        MockProtocol.state.configure { _ in Reply(status: 307, headers: ["Location": "/login"]) }
        let fourth = try model()
        await fourth.refreshTasks()
        expect(fourth.profile == nil && !fourth.tasksLoading && fourth.error != nil, "Login redirect did not end expired session")
        print("PASS: same-origin login redirect ends expired session")

        MockProtocol.state.configure { _ in Reply(status: 307, headers: ["Location": "https://elsewhere.test/login"]) }
        let fifth = try model()
        await fifth.refreshTasks()
        expect(fifth.profile != nil && fifth.tasksLoadFailed, "External redirect was treated as trusted login")
        expect(MockProtocol.state.count("/login") == 0, "Redirect was followed")
        await fifth.reset()
        print("PASS: external redirect is never followed")
    }
}
