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
    public var lastSyncedDescription: String? {
        guard let lastSyncedAt, let date = CalendarConnection.parseTimestamp(lastSyncedAt) else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return "Synchronized \(formatter.localizedString(for: date, relativeTo: Date()))"
    }
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
