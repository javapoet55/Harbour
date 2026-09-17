import Foundation

public struct ImportantMoment: Codable, Identifiable, Sendable {
    public var id, type, title, firstName, phone, email, occurrenceDate, timeZoneID, source, sourceKey: String
    public var yearly, enabled: Bool
    public var snoozedUntil: String?
    public var nextOccurrence: String
    public var drafts: [WishDraft]
    public var icon: String { switch type { case "birthday": "gift.fill"; case "anniversary": "heart.fill"; case "festival": "sparkles"; default: "star.fill" } }
    public var latest: WishDraft? { drafts.first }
}
public struct WishDraft: Codable, Identifiable, Sendable {
    public var id, momentID, tone, body, personalContext, status: String
    public var generationVersion: Int
    public var plans: [WishDeliveryPlan]?
}
public struct WishDeliveryPlan: Codable, Identifiable, Sendable {
    public var id, draftID, channel, recipient, subject, body, scheduledAtUTC, timeZoneID, status, idempotencyKey: String
    public var automaticDelivery, repeatYearly: Bool
    public var reminderOffset: Int
    public var sentAt, lastError: String?
    public var date: Date { ISO8601DateFormatter().date(from: scheduledAtUTC) ?? MomentDates.parseInstant(scheduledAtUTC) ?? .distantPast }
    public var editable: Bool { ["SCHEDULED", "AWAITING_CONFIRMATION", "FAILED"].contains(status) }
    public var statusLabel: String { switch status {
    case "SCHEDULED": "Auto-send scheduled"
    case "AWAITING_CONFIRMATION": "Confirmation required"
    case "SENT": "Sent"
    case "COPIED": "Copied — delivery not confirmed"
    case "SHARED": "Shared — delivery not confirmed"
    case "UNCERTAIN": "Check Sent mail"
    default: status.capitalized.replacingOccurrences(of: "_", with: " ")
    } }
}
public enum MomentDates {
    public static func relative(_ value: String, zone: String, now: Date = Date()) -> String {
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: zone) ?? .current
        let days = c.dateComponents([.day], from: c.startOfDay(for: now), to: date(value, zone: zone)).day ?? 0
        return days == 0 ? "Today" : days == 1 ? "Tomorrow" : days > 1 ? "In \(days) days" : "Past moment"
    }
    public static func label(_ date: Date, zone: String) -> String { let f = DateFormatter(); f.dateStyle = .medium; f.timeStyle = .short; f.timeZone = TimeZone(identifier: zone); return f.string(from: date) }
    public static func parseInstant(_ value: String) -> Date? { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.date(from: value) }
    public static func day(_ date: Date, zone: String) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: zone); f.dateFormat = "yyyy-MM-dd"; return f.string(from: date) }
    public static func date(_ day: String, zone: String) -> Date { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: zone); f.dateFormat = "yyyy-MM-dd"; return f.date(from: day) ?? Date() }
    public static func next(_ day: String, yearly: Bool, zone: String, now: Date = Date()) -> String {
        guard yearly else { return day }
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: zone) ?? .current
        let today = Self.day(now, zone: zone); let suffix = String(day.suffix(5))
        for y in c.component(.year, from: now)...c.component(.year, from: now)+8 {
            let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)
            let candidate = "\(y)-" + (suffix == "02-29" && !leap ? "02-28" : suffix)
            if candidate >= today { return candidate }
        }
        return day
    }
}
public struct MomentInput: Encodable, Sendable {
    public var type = "birthday", title = "", firstName = "", phone = "", email = "", occurrenceDate = "", timeZoneID = TimeZone.current.identifier
    public var yearly = true
    public var source = "manual", sourceKey = UUID().uuidString
    public init() {}
}
