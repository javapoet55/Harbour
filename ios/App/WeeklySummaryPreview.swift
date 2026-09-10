#if DEBUG
import Foundation

/// Opt-in simulator fixture. All requests stay in memory, including task actions.
final class WeeklySummaryPreviewProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let zone = "America/Los_Angeles"
        let start = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "start" }?.value
            ?? WeeklySummaryDates.apiDay(WeeklySummaryDates.startOfWeek(containing: Date(), timeZoneID: zone), timeZoneID: zone)
        let formatter = DateFormatter()
        formatter.calendar = WeeklySummaryDates.calendar(timeZoneID: zone)
        formatter.timeZone = formatter.calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let date = formatter.date(from: start)!
        let days = (0..<7).map { formatter.string(from: formatter.calendar.date(byAdding: .day, value: $0, to: date)!) }
        let tasks: [[String: Any]] = (0..<8).map { index in
            ["id": "weekly-\(index)", "title": ["Finish launch proposal", "Review design", "Send project update", "Prepare meeting", "Book appointment", "Review budget", "Read research", "Plan release"][index],
             "status": index < 3 ? "COMPLETED" : "PLANNED", "priority": index == 0 ? "CRITICAL" : "NORMAL",
             "durationMin": 25, "startAt": "\(days[0])T17:00:00Z", "dueAt": "\(days[0])T18:00:00Z"]
        }
        let completed = Array(tasks.prefix(3))
        let path = request.url!.path
        let value: [String: Any]
        if path == "/api/weekly-summary" {
            value = ["timeZone": zone, "start": start, "end": days[6], "generatedAt": ISO8601DateFormatter().string(from: Date()),
                     "headline": "You completed 3 planned tasks, Sri", "summary": "5 of 8 planned tasks remain. No focus time was recorded.",
                     "metrics": ["completed": 3, "planned": 8, "completionRate": 38, "overdue": 5, "focusMinutes": 0],
                     "taskGroups": ["planned": tasks, "completed": completed, "overdue": Array(tasks.suffix(5))],
                     "days": days.enumerated().map { ["date": $0.element, "planned": $0.offset == 0 ? 8 : 0, "completed": $0.offset == 0 ? 3 : 0] as [String: Any] },
                     "accomplishments": completed, "limitations": ["Planned counts use scheduled start, or due date when no start exists.", "Historical edits cannot be reconstructed."]]
        } else if path == "/api/tasks" { value = ["tasks": tasks] }
        else if path == "/api/projects" { value = ["projects": [], "unassignedTaskCount": 8] }
        else if path == "/api/agenda" { value = ["timeZone": zone, "range": ["days": days], "tasks": tasks, "events": [], "overdue": Array(tasks.suffix(5))] }
        else { value = ["error": "Unavailable in simulator preview"] }
        let response = HTTPURLResponse(url: request.url!, statusCode: value["error"] == nil ? 200 : 503, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}

    @MainActor static func model() -> AppModel {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [WeeklySummaryPreviewProtocol.self]
        let model = AppModel(api: try! APIClient(baseURL: URL(string: "https://weekly-preview.test")!, configuration: config))
        model.profile = Profile(id: "weekly-preview", name: "Sri", email: "preview@example.com", timeZone: "America/Los_Angeles")
        return model
    }
}
#endif
