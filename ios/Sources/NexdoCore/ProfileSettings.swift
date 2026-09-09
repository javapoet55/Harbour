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
