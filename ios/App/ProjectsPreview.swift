#if DEBUG
import Foundation

/// Isolated in-memory transport for simulator QA. Never sends preview data to a server.
final class ProjectsPreviewProtocol: URLProtocol, @unchecked Sendable {
    private static let store = Store()
    private final class Store: @unchecked Sendable {
        let lock = NSLock()
        var projects: [[String: Any]] = zip(["Nexdo mobile app", "Orlando roofing", "Personal", "Home"], ProjectQuery.palette).enumerated().map { index, pair in
            ["id": "p\(index)", "name": pair.0, "color": pair.1, "createdAt": "2026-09-08T12:00:00Z", "updatedAt": "2026-09-08T12:00:00Z"]
        }
        var tasks: [[String: Any]] = [
            ["id": "t1", "title": "Review mobile app", "status": "PLANNED", "priority": "HIGH", "durationMin": 30, "projectId": "p0"],
            ["id": "t2", "title": "Ship bug fixes", "status": "COMPLETED", "priority": "NORMAL", "durationMin": 30, "projectId": "p0"],
            ["id": "t3", "title": "Book roofing call", "status": "PLANNED", "priority": "NORMAL", "durationMin": 30, "projectId": "p1"],
            ["id": "t4", "title": "Unassigned task", "status": "PLANNED", "priority": "NORMAL", "durationMin": 30]
        ]
        var failed = false
        func projection(_ project: [String: Any]) -> [String: Any] {
            var result = project
            let members = tasks.filter { ($0["projectId"] as? String) == (project["id"] as? String) && ($0["status"] as? String) != "CANCELLED" }
            result["totalTaskCount"] = members.count
            result["completedTaskCount"] = members.filter { $0["status"] as? String == "COMPLETED" }.count
            return result
        }
        func respond(_ request: URLRequest) -> (Int, Any) {
            lock.lock(); defer { lock.unlock() }
            let path = request.url!.path; let method = request.httpMethod ?? "GET"
            var data = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; data.append(buffer, count: count) }
            }
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            if path == "/api/projects", method == "GET" { return (200, ["projects": projects.map(projection), "unassignedTaskCount": tasks.filter { $0["projectId"] == nil || $0["projectId"] is NSNull }.count]) }
            if path == "/api/projects", method == "POST" {
                if ProcessInfo.processInfo.arguments.contains("-projects-fail-first-save"), !failed { failed = true; return (503, ["error": "Sample connection interrupted. Try again."]) }
                var value = body; value["id"] = UUID().uuidString; value["createdAt"] = "2026-09-09T12:00:00Z"; value["updatedAt"] = "2026-09-09T12:00:00Z"
                projects.append(value); return (201, ["project": projection(value)])
            }
            if path.hasPrefix("/api/projects/"), let index = projects.firstIndex(where: { $0["id"] as? String == request.url!.lastPathComponent }) {
                if method == "PATCH" { projects[index].merge(body) { _, new in new }; return (200, ["project": projection(projects[index])]) }
                if method == "DELETE" {
                    let id = projects.remove(at: index)["id"] as? String
                    for index in tasks.indices where tasks[index]["projectId"] as? String == id { tasks[index].removeValue(forKey: "projectId") }
                    return (200, ["ok": true])
                }
            }
            if path == "/api/tasks", method == "GET" { return (200, ["tasks": tasks]) }
            if path == "/api/tasks", method == "POST" {
                var value = body; value["id"] = UUID().uuidString; value["status"] = "PLANNED"; value["priority"] = "NORMAL"; value["durationMin"] = body["durationMin"] ?? 30
                tasks.append(value); return (201, ["task": value])
            }
            if path.hasPrefix("/api/tasks/"), method == "PATCH", let index = tasks.firstIndex(where: { $0["id"] as? String == request.url!.lastPathComponent }) {
                tasks[index].merge(body) { _, new in new }; return (200, ["task": tasks[index]])
            }
            if path == "/api/agenda" { return (200, ["timeZone": "America/Los_Angeles", "range": ["days": []], "tasks": tasks, "events": [], "overdue": []]) }
            return (503, ["error": "Not available in the isolated Projects preview."])
        }
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, value) = Self.store.respond(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
    @MainActor static func model() -> AppModel {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ProjectsPreviewProtocol.self]
        let model = AppModel(api: try! APIClient(baseURL: URL(string: "https://projects-preview.test")!, configuration: configuration))
        model.profile = Profile(id: "projects-preview", name: "Sri", email: "preview@example.com", timeZone: "America/Los_Angeles")
        return model
    }
}
#endif
