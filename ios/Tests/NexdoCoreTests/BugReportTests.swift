import Foundation
import Testing
@testable import NexdoCore

private let bugMetadata = BugDiagnostics(appVersion: "1", buildNumber: "1", deviceModel: "iPhone18,2", iosVersion: "26", screen: "tasks", timestamp: "2026-10-10T12:00:00Z", correlationID: UUID().uuidString)
@Test func bugDescriptionAndConsent() {
    var draft = BugReportDraft()
    #expect(!draft.valid); #expect(!draft.screenshotConsent)
    draft.description = "  \n"; #expect(!draft.valid)
    draft.description = String(repeating: "a", count: 2000); #expect(draft.valid)
    draft.description += "a"; #expect(!draft.valid)
    draft.description = "Calendar issue"
    draft.includeScreenshot(Data([1,2])); #expect(draft.screenshotConsent)
    draft.removeScreenshot(); #expect(draft.screenshot == nil); #expect(!draft.screenshotConsent)
    #expect(draft.description == "Calendar issue")
}
@Test func bugRetryIsImmutable() throws {
    var draft = BugReportDraft(); draft.description = "Original"
    let firstValue = draft.submission(metadata: bugMetadata)
    let first = try #require(firstValue)
    draft.description = "Edited"; draft.includeScreenshot(Data([1]))
    let retryValue = draft.submission(metadata: bugMetadata)
    let retry = try #require(retryValue)
    #expect(first.id == retry.id); #expect(retry.description == "Original"); #expect(retry.screenshot == nil)
    draft.clear(); #expect(draft.id != first.id); #expect(!draft.valid)
}
@Test func bugShakeDebounce() {
    var gate = BugShakeGate()
    let result1 = gate.accept(enabled: false, active: true, presenting: false, acceleration: 4, now: 0)
    #expect(!result1)
    let result2 = gate.accept(enabled: true, active: false, presenting: false, acceleration: 4, now: 0)
    #expect(!result2)
    let result3 = gate.accept(enabled: true, active: true, presenting: true, acceleration: 4, now: 0)
    #expect(!result3)
    let result4 = gate.accept(enabled: true, active: true, presenting: false, acceleration: 1, now: 0)
    #expect(!result4)
    let result5 = gate.accept(enabled: true, active: true, presenting: false, acceleration: 4, now: 0)
    #expect(result5)
    let result6 = gate.accept(enabled: true, active: true, presenting: false, acceleration: 4, now: 7)
    #expect(!result6)
    let result7 = gate.accept(enabled: true, active: true, presenting: false, acceleration: 4, now: 8)
    #expect(result7)
}

@Test func bugSubmissionErrorsExplainTheActualFailure() {
    #expect(BugReportFailure.message(for: APIError.response(404)).contains("not available"))
    #expect(BugReportFailure.message(for: APIError.server(404, "Not found")).contains("not available"))
    #expect(BugReportFailure.message(for: APIError.signedOut).contains("sign in again"))
    #expect(BugReportFailure.message(for: APIError.server(429, "Too many attempts. Please try again later.")) == "Too many attempts. Please try again later.")
    #expect(BugReportFailure.message(for: URLError(.notConnectedToInternet)).contains("connection"))
}
