import Foundation

public struct FestivalSettings: Codable, Equatable, Sendable {
    public var groupID = UUID().uuidString
    public var prepareDays = 1
    public var catalogID = "", catalogManaged = false
    public var baseMessage = "", tone = "Warm", personalContext = ""
    public var manuallyEdited = false
    public var approvedAt: String?
    public var includeImage = false, imageID = "", imageStyle = "Traditional", imageAspect = "Portrait", imagePrompt = ""
    public var draftSendDate: String?
    public var draftNotify: Bool?
    public var cardSignature: String?
    public var cardGreeting: String?
    public var overrides: [String:String] = [:], channels: [String:String] = [:], contactIDs: [String:String] = [:]
    public var automatic: [String:Bool] = [:], selected: [String:Bool] = [:]
    public var catalogNotice:String?
    public var archived = false
    public init() {}
    /// Settings saved by Manage Moment. Nil when the JSON is not an object or has no `groupID` (never saved
    /// there, e.g. a fresh moment's `{}`), so group identity stays stable. Any other missing or mistyped key
    /// keeps its default instead of discarding everything that was saved.
    public static func read(_ raw: String?) -> Self? {
        guard let data = raw?.data(using: .utf8), let settings = try? JSONDecoder().decode(Self.self, from: data),
              settings.hasGroup else { return nil }
        return settings
    }
    private var hasGroup = true
    private enum CodingKeys: String, CodingKey {
        case groupID, prepareDays, catalogID, catalogManaged, baseMessage, tone, personalContext, manuallyEdited, approvedAt
        case includeImage, imageID, imageStyle, imageAspect, imagePrompt, draftSendDate, draftNotify, cardSignature, cardGreeting
        case overrides, channels, contactIDs, automatic, selected, catalogNotice, archived
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func value<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T { ((try? c.decodeIfPresent(T.self, forKey: key)) ?? nil) ?? fallback }
        func optional<T: Decodable>(_ key: CodingKeys) -> T? { (try? c.decodeIfPresent(T.self, forKey: key)) ?? nil }
        let group: String? = optional(.groupID)
        hasGroup = !(group ?? "").isEmpty
        groupID = hasGroup ? group! : groupID
        prepareDays = value(.prepareDays, prepareDays); catalogID = value(.catalogID, catalogID); catalogManaged = value(.catalogManaged, catalogManaged)
        baseMessage = value(.baseMessage, baseMessage); tone = value(.tone, tone); personalContext = value(.personalContext, personalContext)
        manuallyEdited = value(.manuallyEdited, manuallyEdited); approvedAt = optional(.approvedAt)
        includeImage = value(.includeImage, includeImage); imageID = value(.imageID, imageID); imageStyle = value(.imageStyle, imageStyle)
        imageAspect = value(.imageAspect, imageAspect); imagePrompt = value(.imagePrompt, imagePrompt)
        draftSendDate = optional(.draftSendDate); draftNotify = optional(.draftNotify); cardSignature = optional(.cardSignature); cardGreeting = optional(.cardGreeting)
        overrides = value(.overrides, overrides); channels = value(.channels, channels); contactIDs = value(.contactIDs, contactIDs)
        automatic = value(.automatic, automatic); selected = value(.selected, selected); catalogNotice = optional(.catalogNotice); archived = value(.archived, archived)
    }
    /// How `draftSendDate` stores a send time.
    public static func draftDate(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }
    /// Records the send time and notify choice Manage Moment opens with. Applied to both the live and the saved
    /// settings, so opening a moment is never an unsaved change; changing either afterwards still is.
    public mutating func recordOpenedDraft(sendDate: Date, notify: Bool) {
        draftSendDate = Self.draftDate(sendDate); draftNotify = notify
    }
}
public struct ManagedFestivalRecipient: Identifiable, Codable, Equatable, Sendable {
    public var id: String { key }
    public var momentID: String?
    public var key, name, phone, email: String
    public var selected = true
    public var contactIdentifier = ""
    public init(momentID: String? = nil, key: String = UUID().uuidString, name: String = "", phone: String = "", email: String = "", selected: Bool = true, contactIdentifier: String = "") {
        self.momentID=momentID; self.key=key; self.name=name; self.phone=phone; self.email=email; self.selected=selected; self.contactIdentifier=contactIdentifier
    }
    public var initials: String { name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined() }
    public func masked(channel: String) -> String {
        if channel == "email" { let parts=email.split(separator:"@"); return parts.count == 2 ? "Email · \(parts[0].prefix(1))••••@\(parts[1])" : "Choose email" }
        return channel == "messages" ? "Mobile · ••• ••• \(phone.filter(\.isNumber).suffix(4))" : "Copy / Share"
    }
}
public enum FestivalValidation {
    public static func phone(_ value: String) -> String { let digits=value.filter(\.isNumber); return value.hasPrefix("+") ? "+"+digits : digits }
    /// A contact's phone numbers, each once: compared without spaces, dashes and brackets; the first spelling is kept.
    public static func uniquePhones(_ values: [String]) -> [String] {
        var seen=Set<String>()
        return values.filter { seen.insert($0.filter { !$0.isWhitespace && !"-‐‑‒–—()[]{}".contains($0) }).inserted }
    }
    /// A contact's email addresses, each once, ignoring case; the first spelling is kept.
    public static func uniqueEmails(_ values: [String]) -> [String] {
        var seen=Set<String>()
        return values.filter { seen.insert($0.lowercased()).inserted }
    }
    public static func validEmail(_ value: String) -> Bool { value.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options:.regularExpression) != nil }
    public static func recipients(_ values:[ManagedFestivalRecipient], settings:FestivalSettings) -> String? {
        let selected=values.filter(\.selected)
        guard !selected.isEmpty else { return "Select at least one recipient." }
        var used=Set<String>()
        for value in selected {
            if value.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty { return "Enter a recipient name." }
            let channel=settings.channels[value.key] ?? (value.phone.isEmpty ? "email" : "messages")
            let address = channel == "email" ? value.email.lowercased().trimmingCharacters(in:.whitespaces) : phone(value.phone)
            if channel == "email" && !validEmail(address) { return "Choose a valid email address for \(value.name)." }
            if channel == "messages" && !(7...15).contains(address.filter(\.isNumber).count) { return "Choose a valid phone number for \(value.name)." }
            if channel != "share" && !used.insert(channel+address).inserted { return "Remove duplicate delivery addresses." }
        }
        return nil
    }
    public static func schedule(settings:FestivalSettings, date:Date, active:Bool, emailReady:Bool, recipients:[ManagedFestivalRecipient], now:Date=Date()) -> String? {
        if !active { return "Enable the festival before scheduling." }
        if let error=Self.recipients(recipients,settings:settings) { return error }
        if settings.baseMessage.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || settings.baseMessage.count > 500 { return "Enter a wish of 1–500 characters." }
        if settings.approvedAt == nil { return "Review and save the message before scheduling." }
        if date <= now { return "Choose a future delivery time." }
        if settings.includeImage { return "Image delivery is not configured. Exclude the preview image to schedule a text wish." }
        for r in recipients.filter(\.selected) {
            let channel=settings.channels[r.key] ?? "messages"
            if channel == "share" { return "Copy / Share is available now from Review Wish; choose Messages or Email to schedule." }
            if channel == "email" && !emailReady { return "Connect email and enable the backend scheduler first." }
        }
        return nil
    }
    /// Reject nonexistent wall times rather than silently moving them across a DST gap.
    public static func instant(day:String, hour:Int, minute:Int, zone:String) -> Date? {
        guard let tz=TimeZone(identifier:zone) else { return nil }
        var c=Calendar(identifier:.gregorian);c.timeZone=tz
        let start=MomentDates.date(day,zone:zone)
        guard let value=c.nextDate(after:start.addingTimeInterval(-1), matching:DateComponents(hour:hour,minute:minute), matchingPolicy:.strict, repeatedTimePolicy:.first), MomentDates.day(value,zone:zone)==day else { return nil }
        return value
    }
    /// Offline draft wording. Birthday and anniversary match the server's `fallback` (src/server/moments/domain.ts)
    /// exactly, with the recipient's first name; getWellSoon and festival keep the app's own wording.
    public static func fallback(name:String,tone:String,type:String="festival",firstName:String="",version:Int=1) -> String {
        if type == "getWellSoon" {
            return tone == "Short" ? "Get well soon. Thinking of you." : "Get well soon. Sending care, comfort, and warm wishes for brighter days ahead."
        }
        if type == "birthday" || type == "anniversary" {
            let greeting = type == "birthday" ? "Happy Birthday" : "Happy Anniversary"
            let who = firstName.isEmpty ? "" : ", \(firstName)"
            switch tone {
            case "Short": return "\(greeting)\(who)! Wishing you a wonderful day."
            case "Fun": return "\(greeting)\(who)! Here’s to smiles, good company, and a day worth celebrating! 🎉"
            case "Personal": return "\(greeting)\(who)! Thinking of you and sending my warmest wishes on this special day."
            default: return "\(greeting)\(who)! \(version % 2 != 0 ? "Wishing you a wonderful day and a fantastic year ahead!" : "Hope your day is filled with happiness and lovely moments!") 🎉"
            }
        }
        switch tone {
        case "Short": return "\(name)! Wishing you joy and happiness."
        case "Fun": return "\(name)! Here’s to a celebration full of smiles, good company, and wonderful memories! ✨"
        case "Personal": return "\(name)! Thinking of you and your family and sending warm wishes for a joyful celebration."
        default: return "\(name)! Wishing you and your family a joyful celebration filled with happiness and new beginnings! ✨"
        }
    }
}
public struct FestivalCatalogEntry: Codable, Identifiable, Sendable {
    public let id, name: String
    public let dates: [String]
    public let sourceURL: String
    public func next(after day:String) -> String? { dates.sorted().first { $0 >= day } }
}
public struct FestivalImageRequest: Equatable, Sendable {
    public var festival:String, style:String, aspect:String, prompt:String
    public init(festival:String,style:String,aspect:String,prompt:String) {self.festival=festival;self.style=style;self.aspect=aspect;self.prompt=prompt}
    public var safePrompt:String { "Create respectful \(style) artwork for \(festival), \(aspect). \(prompt). No text, real people, political content, stereotypes, religious misrepresentation, copyrighted characters, logos, or watermarks." }
}
public struct FestivalImageVariation: Identifiable, Sendable { public let id:String; public let data:Data; public let isMock:Bool; public init(id:String,data:Data,isMock:Bool) {self.id=id;self.data=data;self.isMock=isMock} }
public protocol FestivalImageGenerationService: Sendable {
    func generate(_ request:FestivalImageRequest) async throws -> [FestivalImageVariation]
    func cancel() async
}
public enum FestivalImageCompatibility {
    public static func valid(data:Data, mime:String, providerSupportsImages:Bool) -> Bool {
        providerSupportsImages && !data.isEmpty && data.count <= 5_000_000 && ["image/jpeg","image/png"].contains(mime)
    }
}
