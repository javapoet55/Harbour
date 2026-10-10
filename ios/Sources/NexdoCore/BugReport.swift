import Foundation

public struct BugDiagnostics: Codable, Sendable, Equatable {
    public let appVersion: String
    public let buildNumber: String
    public let deviceModel: String
    public let iosVersion: String
    public let screen: String
    public let timestamp: String
    public let correlationID: String
    public init(appVersion: String, buildNumber: String, deviceModel: String, iosVersion: String, screen: String, timestamp: String, correlationID: String) {
        self.appVersion = appVersion; self.buildNumber = buildNumber; self.deviceModel = deviceModel
        self.iosVersion = iosVersion; self.screen = screen; self.timestamp = timestamp; self.correlationID = correlationID
    }
}
public struct BugReportInput: Encodable, Sendable {
    public let id: String
    public let description: String
    public let metadata: BugDiagnostics
    public let screenshotConsent: Bool
    public let screenshot: String?
}
public struct BugReportReceipt: Decodable, Sendable { public let reference: String }
public struct BugReportDraft: Sendable {
    public var description = ""
    public private(set) var screenshot: Data?
    public private(set) var screenshotConsent = false
    public private(set) var id = UUID().uuidString
    public private(set) var frozen: BugReportInput?
    public init() {}
    public var valid: Bool { !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && description.utf16.count <= 2000 }
    public mutating func includeScreenshot(_ data: Data) { screenshot = data; screenshotConsent = true }
    public mutating func removeScreenshot() { screenshot = nil; screenshotConsent = false }
    // A retry always reuses the exact first request, even after an ambiguous network response.
    public mutating func submission(metadata: BugDiagnostics) -> BugReportInput? {
        if let frozen { return frozen }
        guard valid else { return nil }
        let input = BugReportInput(id: id, description: description.trimmingCharacters(in: .whitespacesAndNewlines), metadata: metadata, screenshotConsent: screenshotConsent, screenshot: screenshotConsent ? screenshot?.base64EncodedString() : nil)
        frozen = input
        return input
    }
    public mutating func clear() { self = BugReportDraft() }
}
public struct BugShakeGate: Sendable {
    private var last = -Double.infinity
    public init() {}
    public mutating func accept(enabled: Bool, active: Bool, presenting: Bool, acceleration: Double, now: Double) -> Bool {
        guard enabled, active, !presenting, acceleration > 2.7, now - last >= 8 else { return false }
        last = now; return true
    }
}
