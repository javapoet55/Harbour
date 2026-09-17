#if DEBUG
import SwiftUI
import Foundation

/// Local-only UI fixture. Never authenticates, contacts a provider, or sends a message.
final class MomentsPreviewProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var savedPlans: [[String: Any]] = []
    nonisolated(unsafe) private static var draftBody = "Happy Birthday, Damien! Wishing you a wonderful day and a fantastic year ahead! 🎉"
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "moments-preview.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock(); defer { Self.lock.unlock() }
        let url = request.url!; let now = Date(); let day = MomentDates.day(now, zone: "America/Los_Angeles")
        func draft() -> [String: Any] { ["id":"draft","momentID":"moment","tone":"Warm","body":Self.draftBody,"personalContext":"","generationVersion":1,"status":"READY","plans":Self.savedPlans] }
        var result: [String: Any]
        if request.httpMethod == "POST" {
            var data = request.httpBody
            if data == nil, let stream = request.httpBodyStream { stream.open(); defer { stream.close() }; var bytes = Data(); var buffer = [UInt8](repeating: 0, count: 1024); while stream.hasBytesAvailable { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; bytes.append(buffer, count: count) }; data = bytes }
            let json = (try? JSONSerialization.jsonObject(with: data ?? Data())) as? [String: Any] ?? [:]
            let operation = json["operation"] as? String ?? ""; let input = json["input"] as? [String: Any] ?? [:]
            switch operation {
            case "generate": result = ["draft":draft(),"usedAI":false]
            case "approve": Self.draftBody = input["body"] as? String ?? Self.draftBody; result = ["draft":draft()]
            case "schedule":
                var plan = input; plan["id"] = "plan"; plan["subject"] = "Damien’s Birthday"; plan["body"] = Self.draftBody; plan["status"] = (input["automaticDelivery"] as? Bool == true) ? "SCHEDULED" : "AWAITING_CONFIRMATION"
                Self.savedPlans = [plan]; result = ["plan":plan]
            case "plan":
                if !Self.savedPlans.isEmpty {
                    let action = input["action"] as? String ?? ""
                    if let status = ["cancel":"CANCELLED","copied":"COPIED","shared":"SHARED","sent":"SENT"][action] { Self.savedPlans[0]["status"] = status }
                    if action == "reschedule", let date = input["scheduledAtUTC"] { Self.savedPlans[0]["scheduledAtUTC"] = date }
                }
                result = ["ok":true]
            default: result = ["ok":true]
            }
        } else {
            let moment: [String: Any] = ["id":"moment","type":"birthday","title":"Damien’s Birthday","firstName":"Damien","phone":"+15555550184","email":"damien@example.com","occurrenceDate":day,"timeZoneID":"America/Los_Angeles","source":"manual","sourceKey":"fixture","yearly":true,"enabled":true,"nextOccurrence":day,"drafts":[draft()]]
            result = ["moments":[moment],"emailAccount":["email":"you@example.com","status":"connected"],"emailConfigured":true,"automaticEmailEnabled":true]
        }
        let data = try! JSONSerialization.data(withJSONObject: result)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
    @MainActor static func store() -> ImportantMomentsStore {
        lock.withLock { savedPlans = []; draftBody = "Happy Birthday, Damien! Wishing you a wonderful day and a fantastic year ahead! 🎉" }
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MomentsPreviewProtocol.self]
        return ImportantMomentsStore(api: try! APIClient(baseURL: URL(string:"https://moments-preview.invalid")!, configuration: config), notificationAuthorization: {
            if ProcessInfo.processInfo.arguments.contains("-moments-denied") { throw TaskActionServiceError.notificationsDenied }
        })
    }
}
struct MomentsDesignPreview: View {
    @StateObject private var store = MomentsPreviewProtocol.store()
    var body: some View {
        NavigationStack { ImportantMomentsView() }.environmentObject(store)
            .task { await store.activate("local-fixture") }
    }
}
#endif
