import Foundation

/// One wish per moment: the Wish Message is the text scheduled for delivery and the text printed on the card.
public enum WishMessage {
    /// Suggested wording shown as a placeholder while the Wish Message is empty. Never saved unless the user
    /// taps "Use suggestion".
    public static func suggestion(type: String, title: String) -> String {
        if type == "getWellSoon" { return "Get well soon. Wishing you comfort, rest, and brighter days ahead." }
        if type == "festival" { return FestivalValidation.fallback(name: title, tone: "Warm") }
        return "\(title)! Sending you warm wishes on your special day."
    }

    /// The text printed on a recipient's card: their personalized message, else the shared Wish Message.
    /// Without a recipient (the shared preview) it is the Wish Message.
    public static func card(_ settings: FestivalSettings, recipientKey: String? = nil) -> String {
        if let key = recipientKey, let custom = settings.overrides[key] { return custom }
        return settings.baseMessage
    }

    /// The text to start editing with when nothing is saved: a draft the user approved in Review Wish, else empty.
    public static func initial(saved: String, latestBody: String?, latestStatus: String?) -> String {
        guard saved.isEmpty else { return saved }
        guard let body = latestBody, ["READY", "PLANNED"].contains(latestStatus ?? ""),
              !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "" }
        return body
    }

    /// Folds a card-only greeting saved by older versions into the Wish Message. The greeting wins when the
    /// Wish Message is empty or still the untouched suggestion, and the change needs a fresh Save Message.
    /// `cardGreeting` is always cleared. Returns true when the Wish Message changed.
    @discardableResult
    public static func reconcile(_ settings: inout FestivalSettings, suggestion: String) -> Bool {
        defer { settings.cardGreeting = nil }
        guard let greeting = settings.cardGreeting, !greeting.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              greeting != settings.baseMessage else { return false }
        let base = settings.baseMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard base.isEmpty || (base == suggestion && !settings.manuallyEdited) else { return false }
        settings.baseMessage = String(greeting.prefix(500)); settings.manuallyEdited = true; settings.approvedAt = nil
        return true
    }

    /// Why the Wish Message can't be approved yet; nil when it can. An empty message never falls back to the suggestion.
    public static func approvalError(_ settings: FestivalSettings) -> String? {
        let valid = { (text: String) in !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.count <= 500 }
        return valid(settings.baseMessage) && settings.overrides.values.allSatisfy(valid) ? nil : "Each message must contain 1–500 characters."
    }

    /// Shown when a save is refused because the wish is being sent (HTTP 409 "in progress" / "started").
    public static let sendingNow = "This wish is being sent right now, so its message can’t change. Refresh in a minute to see the result."
    public static func saveError(status: Int, message: String) -> String? {
        status == 409 && (message.contains("in progress") || message.contains("delivery started")) ? sendingNow : nil
    }
}

/// What a Manage Moment save changes, compared with the last saved state. Mirrors the server's message-only
/// rule (src/server/moments/festival.ts `onlyMessageChanged`): only message and card fields changed.
public enum FestivalChange: Equatable, Sendable {
    case none, messageOnly, delivery

    /// Asks to cancel existing schedules only when the save changes who, when or how a wish is delivered, or
    /// saves a message without approving it.
    public func needsCancelPrompt(approve: Bool, hasSchedules: Bool) -> Bool {
        guard hasSchedules else { return false }
        switch self {
        case .delivery: return true
        case .messageOnly: return !approve
        case .none: return false
        }
    }
}

public struct FestivalEditState: Equatable, Sendable {
    public var title, day, zone: String
    public var yearly, active: Bool
    public var recipients: [ManagedFestivalRecipient]
    public var settings: FestivalSettings
    public init(title: String, day: String, zone: String, yearly: Bool, active: Bool, recipients: [ManagedFestivalRecipient], settings: FestivalSettings) {
        self.title = title; self.day = day; self.zone = zone; self.yearly = yearly; self.active = active; self.recipients = recipients; self.settings = settings
    }

    /// The settings with every message and card field blanked, i.e. what decides delivery.
    static func delivery(_ value: FestivalSettings) -> FestivalSettings {
        var s = value
        s.baseMessage = ""; s.tone = ""; s.personalContext = ""; s.manuallyEdited = false; s.approvedAt = nil; s.overrides = [:]
        s.cardGreeting = nil; s.cardSignature = nil; s.imageID = ""; s.imageStyle = ""; s.imageAspect = ""; s.imagePrompt = ""
        s.draftSendDate = nil; s.draftNotify = nil; s.catalogNotice = nil; s.archived = false
        return s
    }

    public func change(from saved: Self) -> FestivalChange {
        if self == saved { return .none }
        let recipients = { (list: [ManagedFestivalRecipient]) in list.map { r -> ManagedFestivalRecipient in var r = r; r.momentID = nil; return r } }
        let sameDelivery = title == saved.title && day == saved.day && zone == saved.zone && yearly == saved.yearly && active == saved.active
            && recipients(self.recipients) == recipients(saved.recipients) && Self.delivery(settings) == Self.delivery(saved.settings)
        return sameDelivery ? .messageOnly : .delivery
    }
}
