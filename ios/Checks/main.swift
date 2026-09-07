import Foundation
import NexdoCore

// Minimal command-line smoke checks for Macs without Xcode's Swift Testing framework.
// The larger Swift Testing suite remains in Tests and should run after installing Xcode.
enum CheckFailure: Error { case failed(String) }
func check(_ condition: @autoclosure () -> Bool, _ name: String) throws {
    guard condition() else { throw CheckFailure.failed(name) }
    print("PASS: \(name)")
}

try check(ServerDate.parse("2026-09-06T12:00:00.000Z") == ServerDate.parse("2026-09-06T12:00:00Z"), "ISO timestamp formats")
try check(ServerDate.day("2026-09-06T01:00:00Z", timeZone: "America/Los_Angeles") == "2026-09-05", "Account timezone")
try check(ServerDate.day("2026-03-08T07:59:59Z", timeZone: "America/Los_Angeles") == "2026-03-07", "DST boundary")
let event = try JSONDecoder().decode(CalendarEvent.self, from: Data(#"{"id":"e","title":"Conference","startAt":"2026-09-05T07:00:00Z","endAt":"2026-09-07T07:00:00Z","allDay":true}"#.utf8))
try check(ServerDate.occurs(event, on: "2026-09-06", timeZone: "America/Los_Angeles") && !ServerDate.occurs(event, on: "2026-09-07", timeZone: "America/Los_Angeles"), "Multi-day exclusive end")
var rejected = false
do { _ = try APIClient(baseURL: URL(string: "http://example.com")!) } catch APIError.insecureURL { rejected = true }
try check(rejected, "HTTP rejected")
let request = AssistantRequest(transcript: "no", contextActionId: "context", rejectActionId: "proposal")
let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as! [String: String]
try check(body["contextActionId"] == "context" && body["rejectActionId"] == "proposal" && body["confirmActionId"] == nil, "Context retained and rejection separated from approval")
