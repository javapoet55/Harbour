import Foundation

public struct ProfilePreferences: Codable, Sendable {
    public var workStart: String
    public var workEnd: String
    public var quietStart: String
    public var quietEnd: String
    public var confirmationLevel: String
    public var voiceEnabled: Bool
    public var personalizationEnabled: Bool
    public var pushEnabled: Bool
    public var emailEnabled: Bool
    public var smsEnabled: Bool
    public var morningSummary: Bool
    public var eveningSummary: Bool
    public var phoneNumber: String?
}
public struct NextActionPreference: Codable, Sendable {
    public var enabled: Bool
    public var switchingThreshold: Int
}
public struct ProfileSettingsInput: Encodable, Sendable {
    public var name: String
    public var timeZone: String
    public var preference: ProfilePreferences
    public var nextAction: NextActionPreference
}
public struct CalendarConnection: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let provider: String
    public let accountEmail: String?
    public let calendarName: String?
    public let status: String
    public let lastSyncedAt: String?
    public let writeEnabled: Bool
    public init(id: String, provider: String, accountEmail: String?, calendarName: String?, status: String, lastSyncedAt: String?, writeEnabled: Bool = false) {
        self.id = id; self.provider = provider; self.accountEmail = accountEmail
        self.calendarName = calendarName; self.status = status; self.lastSyncedAt = lastSyncedAt
        self.writeEnabled = writeEnabled
    }
    public var displayName: String {
        if let calendarName, !calendarName.isEmpty { return calendarName }
        if let accountEmail, !accountEmail.isEmpty { return accountEmail }
        return providerLabel
    }
    public var providerLabel: String {
        switch provider.lowercased() {
        case "google": "Google Calendar"
        case "microsoft": "Outlook Calendar"
        default: provider.capitalized
        }
    }
    public var isHealthy: Bool { status.uppercased() == "ACTIVE" || status.uppercased() == "CONNECTED" }
    public var detail: String {
        var parts = [providerLabel]
        if let accountEmail, !accountEmail.isEmpty, accountEmail != displayName { parts.append(accountEmail) }
        if !isHealthy { parts.append(status.capitalized) }
        return parts.joined(separator: " · ")
    }
    /// The line under "Synchronize now": when this calendar last synced, from `status` and `lastSyncedAt`.
    public func lastSyncedText(now: Date = Date(), timeZone: TimeZone = .current) -> String {
        CalendarSyncStatus.text(status: status, lastSyncedAt: lastSyncedAt.flatMap(Self.parseTimestamp), now: now, timeZone: timeZone)
    }
    /// True exactly when the row reads "Needs reconnecting"; the row then offers Reconnect.
    public var needsReconnect: Bool { CalendarSyncStatus.needsReconnect(status: status) }
    // Prisma emits fractional seconds; tolerate either form.
    static func parseTimestamp(_ value: String) -> Date? {
        for options in [[.withInternetDateTime, .withFractionalSeconds], [.withInternetDateTime]] as [ISO8601DateFormatter.Options] {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = options
            if let date = formatter.date(from: value) { return date }
        }
        return nil
    }
}

public enum CalendarSyncStatus {
    /// "Needs reconnecting" unless status is "connected"; "Not synced yet" without a sync; otherwise
    /// "Last synced just now" (<1 min), "N min ago" (<60 min), "today/yesterday at h:mm AM/PM", or "MMM d at h:mm AM/PM".
    public static func text(status: String, lastSyncedAt: Date?, now: Date, timeZone: TimeZone = .current) -> String {
        guard !needsReconnect(status: status) else { return "Needs reconnecting" }
        guard let synced = lastSyncedAt else { return "Not synced yet" }
        let seconds = now.timeIntervalSince(synced)
        if seconds < 60 { return "Last synced just now" }
        if seconds < 3600 { return "Last synced \(Int(seconds / 60)) min ago" }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timeZone
        let time = formatter("h:mm a", timeZone).string(from: synced)
        if calendar.isDate(synced, inSameDayAs: now) { return "Last synced today at \(time)" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(synced, inSameDayAs: yesterday) { return "Last synced yesterday at \(time)" }
        return "Last synced \(formatter("MMM d", timeZone).string(from: synced)) at \(time)"
    }
    public static func needsReconnect(status: String) -> Bool { status.lowercased() != "connected" }
    private static func formatter(_ format: String, _ timeZone: TimeZone) -> DateFormatter {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = timeZone; f.dateFormat = format; f.amSymbol = "AM"; f.pmSymbol = "PM"
        return f
    }
}

/// Nexdo's public legal pages on the marketing site. App routes such as /privacy on the API host
/// redirect to sign-in, so Settings links here instead.
public enum LegalLinks {
    public static let privacyPolicyTitle = "Privacy policy"
    public static let privacyPolicy = URL(string: "https://nexdoapp.com/privacy")!
    public static let termsOfServiceTitle = "Terms of service"
    public static let termsOfService = URL(string: "https://nexdoapp.com/terms")!
}

/// How a finished Google sign-in sheet ended.
public enum CalendarOAuthResult: Equatable, Sendable {
    case connected
    /// Google's page was closed without signing in. Settings closes quietly.
    case cancelled
    case failed(String)

    /// - Parameters:
    ///   - callback: the `nexdo://calendar-connected?…` URL the server redirected to, if any.
    ///   - cancelled: the sheet was closed (`ASWebAuthenticationSessionError.canceledLogin`).
    ///   - error: the description of any other session error.
    public init(callback: URL?, cancelled: Bool, error: String?) {
        if cancelled { self = .cancelled; return }
        if let error { self = .failed("Google Calendar connection failed: \(error)"); return }
        guard let callback else { self = .cancelled; return }
        let query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if query.first(where: { $0.name == "calendar" })?.value == "error" || query.contains(where: { $0.name == "detail" }) {
            let detail = query.first(where: { $0.name == "detail" })?.value ?? "authorization failed"
            self = .failed("Google Calendar connection failed: \(detail)"); return
        }
        self = .connected
    }
}
