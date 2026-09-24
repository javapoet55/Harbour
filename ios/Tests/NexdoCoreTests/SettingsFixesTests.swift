import Foundation
import Testing
@testable import NexdoCore

@Test func legalLinksPointAtThePublicSite() {
    #expect(LegalLinks.privacyPolicyTitle == "Privacy policy")
    #expect(LegalLinks.privacyPolicy.absoluteString == "https://nexdoapp.com/privacy")
    #expect(LegalLinks.termsOfServiceTitle == "Terms of service")
    #expect(LegalLinks.termsOfService.absoluteString == "https://nexdoapp.com/terms")
}

@Test func closingGooglesPageIsQuiet() {
    #expect(CalendarOAuthResult(callback: nil, cancelled: true, error: nil) == .cancelled)
    // No callback and no error also means the sheet ended without signing in.
    #expect(CalendarOAuthResult(callback: nil, cancelled: false, error: nil) == .cancelled)
}

@Test func realFailuresStillShowAnError() {
    let serverError = URL(string: "nexdo://calendar-connected?calendar=error&detail=Unable%20to%20read%20Google%20account%20calendar")!
    #expect(CalendarOAuthResult(callback: serverError, cancelled: false, error: nil) == .failed("Google Calendar connection failed: Unable to read Google account calendar"))
    let noDetail = URL(string: "nexdo://calendar-connected?calendar=error")!
    #expect(CalendarOAuthResult(callback: noDetail, cancelled: false, error: nil) == .failed("Google Calendar connection failed: authorization failed"))
    #expect(CalendarOAuthResult(callback: nil, cancelled: false, error: "The presentation context was invalid.") == .failed("Google Calendar connection failed: The presentation context was invalid."))
}

@Test func connectedCallbackSucceeds() {
    let ok = URL(string: "nexdo://calendar-connected?calendar=google-connected")!
    #expect(CalendarOAuthResult(callback: ok, cancelled: false, error: nil) == .connected)
}

@Test func reconnectShowsExactlyWhereNeedsReconnectingDoes() {
    for status in ["connected", "CONNECTED", "error", "revoked", "ACTIVE", ""] {
        let connection = CalendarConnection(id: "c", provider: "google", accountEmail: "a@example.com", calendarName: nil, status: status, lastSyncedAt: nil)
        #expect(connection.needsReconnect == (connection.lastSyncedText() == "Needs reconnecting"), "status \(status)")
    }
    #expect(CalendarConnection(id: "c", provider: "google", accountEmail: nil, calendarName: nil, status: "error", lastSyncedAt: nil).needsReconnect)
    #expect(!CalendarConnection(id: "c", provider: "google", accountEmail: nil, calendarName: nil, status: "connected", lastSyncedAt: nil).needsReconnect)
}
