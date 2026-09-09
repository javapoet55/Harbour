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
struct ProjectChecks {
    static func project(_ name: String = "Home") -> String {
        "{\"id\":\"p1\",\"name\":\"\(name)\",\"color\":\"#8875ff\",\"createdAt\":\"2026-01-01T00:00:00Z\",\"updatedAt\":\"2026-01-02T00:00:00Z\",\"completedTaskCount\":0,\"totalTaskCount\":1}"
    }
    static func projects(_ name: String = "Home") -> String { "{\"projects\":[\(project(name))],\"unassignedTaskCount\":0}" }
    @MainActor static func main() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockProtocol.self]
        let model = AppModel(api: try APIClient(baseURL: URL(string: "https://projects.test")!, configuration: config))
        model.profile = Profile(id: "qa", name: "QA", email: "qa@test.invalid", timeZone: "America/Los_Angeles")
        MockProtocol.state.configure { _ in Reply(body: projects()) }
        await model.refreshProjects()
        precondition(model.projects.first?.name == "Home" && model.projectsLoaded)
        MockProtocol.state.configure { _ in Reply(status: 500) }
        await model.refreshProjects()
        precondition(model.projectsError != nil && model.projects.first?.name == "Home" && !model.projectsLoading)
        do { try await model.saveProject(id: "p1", name: "Failed edit", color: "#8875ff"); preconditionFailure() } catch {}
        precondition(model.projects.first?.name == "Home" && !model.projectMutationBusy)
        print("PASS: offline reads and failed saves preserve projects and settle progress")

        MockProtocol.state.configure { _ in Reply(body: projects("Obsolete"), delay: 0.2) }
        let old = Task { await model.refreshProjects() }
        try await Task.sleep(for: .milliseconds(25))
        MockProtocol.state.configure { request in
            request.httpMethod == "PATCH" ? Reply(body: "{\"project\":\(project("Renamed"))}") : Reply(body: projects("Renamed"))
        }
        try await model.saveProject(id: "p1", name: "Renamed", color: "#8875ff")
        await old.value
        precondition(model.projects.first?.name == "Renamed")
        print("PASS: obsolete refresh cannot overwrite a successful project mutation")

        MockProtocol.state.configure { _ in Reply(body: "{\"project\":\(project("Created"))}", delay: 0.1) }
        let saving = Task { try await model.saveProject(id: nil, name: "Created", color: "#8875ff") }
        try await Task.sleep(for: .milliseconds(20))
        do { try await model.saveProject(id: nil, name: "Created", color: "#8875ff"); preconditionFailure() } catch {}
        try await saving.value
        precondition(MockProtocol.state.count("/api/projects") <= 2)
        print("PASS: duplicate submissions are blocked while a save is pending")

        var task = NexdoTask(id: "t1", title: "Keep this task", status: "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: nil, dueAt: nil)
        task.projectId = "p1"; model.tasks = [task]
        model.agenda = Agenda(timeZone: "America/Los_Angeles", range: .init(days: []), tasks: [task], events: [], overdue: [])
        MockProtocol.state.configure { request in
            request.httpMethod == "DELETE" ? Reply(body: "{}") : Reply(body: "{\"projects\":[],\"unassignedTaskCount\":1}")
        }
        let existing = model.projects.first!
        try await model.deleteProject(existing)
        precondition(model.projects.isEmpty && model.tasks.count == 1 && model.tasks[0].projectId == nil && model.agenda?.tasks[0].projectId == nil)
        print("PASS: deleting a project unassigns local and agenda tasks without deleting them")

        // A task mutation must win over project and task reads started before it.
        let moving = AppModel(api: try APIClient(baseURL: URL(string: "https://projects.test")!, configuration: config))
        moving.profile = model.profile
        moving.tasks = [task]
        moving.agenda = Agenda(timeZone: "America/Los_Angeles", range: .init(days: []), tasks: [task], events: [], overdue: [])
        MockProtocol.state.configure { _ in Reply(body: projects()) }
        await moving.refreshProjects()
        MockProtocol.state.configure { _ in Reply(body: projects("Stale counts"), delay: 0.2) }
        let staleCounts = Task { await moving.refreshProjects() }
        try await Task.sleep(for: .milliseconds(25))
        MockProtocol.state.configure { request in
            if request.httpMethod == "PATCH" { return Reply(body: #"{"task":{"id":"t1","title":"Keep this task","status":"PLANNED","priority":"NORMAL","durationMin":30,"projectId":null}}"#) }
            return Reply(status: 503)
        }
        let original = TaskDraft(task: task)
        var unassigned = original; unassigned.projectId = nil
        try await moving.saveTaskDetails(task: task, draft: unassigned, original: original)
        precondition(moving.projects[0].totalTaskCount == 0 && moving.unassignedTaskCount == 1)
        precondition(moving.tasks[0].projectId == nil && moving.agenda?.tasks[0].projectId == nil)
        await staleCounts.value
        precondition(moving.projects[0].totalTaskCount == 0 && moving.unassignedTaskCount == 1)
        print("PASS: task reassignment updates counts and agenda immediately; stale reads cannot undo it")

        MockProtocol.state.configure { _ in Reply(body: projects("Old account"), delay: 0.1) }
        let delayed = Task { await model.refreshProjects() }
        try await Task.sleep(for: .milliseconds(20))
        await model.reset(); await delayed.value
        precondition(model.projects.isEmpty && !model.projectsLoaded && !model.projectsLoading && model.projectsError == nil)
        print("PASS: logout rejects late project data")
    }
}
