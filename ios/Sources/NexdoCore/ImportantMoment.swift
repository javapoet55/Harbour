import Foundation

public struct ImportantMoment: Codable, Identifiable, Sendable {
    public var id, type, title, firstName, phone, email, occurrenceDate, timeZoneID, source, sourceKey: String
    public var yearly, enabled: Bool
    public var festivalSettings: String?
    public var snoozedUntil: String?
    public var nextOccurrence: String
    public var drafts: [WishDraft]
    /// The saved greeting card automatic emails include, or nil. Absent from servers before the card feature.
    public var card: GreetingCardInfo?
    public var typeLabel: String { Self.label(for:type) }
    public static func label(for type:String) -> String { type == "getWellSoon" ? "Get Well Soon" : type.capitalized }
    public var supportsGreetingCard: Bool { ["birthday","anniversary","festival","getWellSoon"].contains(type) }
    public var icon: String { switch type { case "birthday": "gift.fill"; case "anniversary": "heart.fill"; case "festival": "sparkles"; case "getWellSoon": "heart.text.clipboard.fill"; default: "star.fill" } }
    public var hasRecipient: Bool { [firstName, phone, email].contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } }
    public var isArchived: Bool {
        guard let data = festivalSettings?.data(using: .utf8),
              let settings = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return settings["archived"] as? Bool == true
    }
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
    public var statusLabel: String { statusLabel(now: Date()) }
    public func statusLabel(now: Date) -> String { switch status {
    case "SCHEDULED": "Auto-send scheduled"
    case "AWAITING_CONFIRMATION":
        if lastError == "Messages opened; delivery not confirmed." { "Opened — delivery not confirmed" }
        else if date > now { "Scheduled — manual send" }
        else { channel == "copy" ? "Ready to copy" : channel == "share" ? "Ready to share" : "Ready to send" }
    case "SENT": "Sent"
    case "COPIED": "Copied — delivery not confirmed"
    case "SHARED": "Shared — delivery not confirmed"
    case "UNCERTAIN": "Check Sent mail"
    default: status.capitalized.replacingOccurrences(of: "_", with: " ")
    } }
}
public enum MomentDates {
    public static func sendDayLabel(_ date: Date, zone: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: zone) ?? .current
        formatter.dateFormat = "EEE, MMM d, yyyy"
        return formatter.string(from: date)
    }

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
    /// Choosing a type in the editor: the type is what gets saved; an automatic title follows it, and
    /// get well soon does not repeat.
    public mutating func choose(type newType: String) {
        title = MomentTitles.updating(title, from: type, firstName: firstName, to: newType, firstName: firstName)
        type = newType
        if newType == "getWellSoon" { yearly = false }
    }
    /// The payload both editor Save buttons send: this input with the picked day.
    public func forSave(day: String) -> MomentInput { var value = self; value.occurrenceDate = day; return value }
}

/// Date filters use each moment's local calendar, including across midnight and DST.
public enum MomentUpcomingFilter: String, CaseIterable, Sendable {
    case today = "Today", tomorrow = "Tomorrow", thisWeek = "This Week", later = "Later"
    public func includes(day: String, zone: String, now: Date = Date(), calendar input: Calendar = .current) -> Bool {
        var calendar=input
        calendar.timeZone=TimeZone(identifier:zone) ?? .current
        let today=calendar.startOfDay(for:now)
        let tomorrow=calendar.date(byAdding:.day,value:1,to:today)!
        let afterTomorrow=calendar.date(byAdding:.day,value:2,to:today)!
        let date=MomentDates.date(day,zone:zone)
        let weekEnd=calendar.dateInterval(of:.weekOfYear,for:now)?.end ?? afterTomorrow
        switch self {
        case .today: return date >= today && date < tomorrow
        case .tomorrow: return date >= tomorrow && date < afterTomorrow
        case .thisWeek: return date >= today && date < weekEnd
        case .later: return date >= max(weekEnd,afterTomorrow)
        }
    }
}
public enum MomentScheduleSummary {
    public static func labels(plans: [WishDeliveryPlan], locale: Locale = .current) -> [String] {
        let multipleZones=Set(plans.map(\.timeZoneID)).count > 1
        let labels=plans.sorted { $0.date < $1.date }.map { plan in
            let formatter=DateFormatter()
            formatter.locale=locale;formatter.timeZone=TimeZone(identifier:plan.timeZoneID) ?? .current
            formatter.dateStyle = .none;formatter.timeStyle = .short
            return formatter.string(from:plan.date) + (multipleZones ? " \(formatter.timeZone.abbreviation(for:plan.date) ?? plan.timeZoneID)" : "")
        }
        var ordered:[String]=[]
        for label in labels where !ordered.contains(label) { ordered.append(label) }
        return ordered.map { label in "\(labels.filter { $0 == label }.count) scheduled @ \(label)" }
    }
}

public enum MomentUpcomingGroup: String, CaseIterable, Sendable {
    case thisWeek = "This Week", nextWeek = "Next Week", thisMonth = "This Month", nextMonth = "Next Month", later = "Later"
}
public extension ImportantMoment {
    var upcomingDelivery: WishDeliveryPlan? {
        drafts.flatMap { $0.plans ?? [] }.filter {
            ["SCHEDULED", "AWAITING_CONFIRMATION"].contains($0.status) &&
            MomentDates.day($0.date, zone: timeZoneID) == nextOccurrence
        }.sorted { $0.date < $1.date }.first
    }
    /// Approval is distinct from scheduling. Annual occurrences need a fresh review.
    var readyToSchedule: Bool {
        guard enabled, upcomingDelivery == nil, occurrenceDate == nextOccurrence else {return false}
        if supportsGreetingCard, let settings=FestivalSettings.read(festivalSettings) {
            return settings.approvedAt != nil && !settings.baseMessage.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty
        }
        return latest?.status == "READY" && !(latest?.plans?.contains { ["SENT","COPIED","SHARED"].contains($0.status) } ?? false)
    }
    var needsWishReview: Bool { enabled && upcomingDelivery == nil && !readyToSchedule }
    func upcomingGroup(now: Date = Date()) -> MomentUpcomingGroup {
        var calendar = Calendar.current
        calendar.timeZone = TimeZone(identifier: timeZoneID) ?? .current
        let occurrence = MomentDates.date(nextOccurrence, zone: timeZoneID)
        if let week = calendar.dateInterval(of: .weekOfYear, for: now),
           occurrence >= week.start && occurrence < week.end { return .thisWeek }
        if let month = calendar.dateInterval(of: .month, for: now),
           let next = calendar.dateInterval(of: .month, for: month.end),
           occurrence >= next.start && occurrence < next.end { return .nextMonth }
        if let nextWeek = calendar.date(byAdding: .weekOfYear, value: 1, to: now),
           let week = calendar.dateInterval(of: .weekOfYear, for: nextWeek),
           occurrence >= week.start && occurrence < week.end { return .nextWeek }
        if let month = calendar.dateInterval(of: .month, for: now),
           occurrence >= month.start && occurrence < month.end { return .thisMonth }
        return .later
    }
}

/// Display grouping only; approved drafts and deliveries remain recipient-specific.
public struct MomentDisplayGroup: Identifiable, Sendable {
    public let id: String
    public let moments: [ImportantMoment]
    public static func editableGroups(_ moments: [ImportantMoment]) -> [Self] {
        groups(moments.filter { !$0.isArchived })
    }
    public static func groups(_ moments: [ImportantMoment]) -> [Self] {
        var order: [String] = []
        var entries: [String: [ImportantMoment]] = [:]
        for moment in moments {
            let key: String
            if moment.supportsGreetingCard, let settings = FestivalSettings.read(moment.festivalSettings) {
                key = moment.type + "-group:" + settings.groupID
            } else if moment.type == "festival", moment.hasRecipient {
                let title = moment.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                key = [title, moment.nextOccurrence, moment.timeZoneID, String(moment.yearly)]
                    .map { "\($0.utf8.count):\($0)" }.joined()
            } else {
                key = "moment:" + moment.id
            }
            if entries[key] == nil { order.append(key) }
            entries[key, default: []].append(moment)
        }
        return order.map { Self(id: $0, moments: entries[$0]!) }
    }
}
