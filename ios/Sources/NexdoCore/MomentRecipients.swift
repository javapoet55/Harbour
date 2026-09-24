import Foundation
import CryptoKit

/// A recipient being added or edited in the recipient sheet, used by Create Moment and Manage Moment.
public struct RecipientDraft: Equatable, Sendable {
    public var name = "", phone = "", email = ""
    /// The Contacts identifier when the person was chosen from Contacts; empty when entered manually.
    public var contactIdentifier = ""
    /// The chosen contact's numbers and addresses, each once, offered as quick choices. Empty when unknown.
    public var phoneChoices: [String] = [], emailChoices: [String] = []
    public init(name: String = "", phone: String = "", email: String = "", contactIdentifier: String = "", phoneChoices: [String] = [], emailChoices: [String] = []) {
        self.name = name; self.phone = phone; self.email = email; self.contactIdentifier = contactIdentifier
        self.phoneChoices = FestivalValidation.uniquePhones(phoneChoices); self.emailChoices = FestivalValidation.uniqueEmails(emailChoices)
    }
    /// A contact chosen from Contacts, pre-filled with its first number and address.
    public init(contact identifier: String, name: String, phones: [String], emails: [String]) {
        self.init(contactIdentifier: identifier, phoneChoices: phones, emailChoices: emails)
        self.name = name; phone = phoneChoices.first ?? ""; email = emailChoices.first ?? ""
    }
    /// An existing recipient opened for editing.
    public init(editing recipient: ManagedFestivalRecipient, phones: [String] = [], emails: [String] = []) {
        self.init(name: recipient.name, phone: recipient.phone, email: recipient.email, contactIdentifier: recipient.contactIdentifier, phoneChoices: phones, emailChoices: emails)
    }
    public static let nameRequired = "Enter a name."
    public static let nameTooLong = "Use a name of 80 characters or fewer."
    public static let addressRequired = "Enter a phone number or email."
    public static let invalidPhone = "Enter a valid phone number."
    public static let invalidEmail = "Enter a valid email address."
    public static let duplicate = "This person is already a recipient."
    /// Why the draft can't be added or saved, or nil. `others` are the moment's other recipients (not the one being edited).
    public func issue(among others: [ManagedFestivalRecipient]) -> String? {
        let phone = phone.trimmingCharacters(in: .whitespacesAndNewlines), email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return Self.nameRequired }
        if name.count > 80 { return Self.nameTooLong }
        if phone.isEmpty && email.isEmpty { return Self.addressRequired }
        if !phone.isEmpty && !FestivalValidation.validPhone(phone) { return Self.invalidPhone }
        if !email.isEmpty && !FestivalValidation.validEmail(email) { return Self.invalidEmail }
        if others.contains(where: { FestivalValidation.samePerson($0, phone: phone, email: email) }) { return Self.duplicate }
        return nil
    }
    /// The recipient this draft saves: new (with a fresh key) or the edited one, trimmed.
    public func recipient(updating existing: ManagedFestivalRecipient? = nil) -> ManagedFestivalRecipient {
        var value = existing ?? ManagedFestivalRecipient()
        value.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        value.phone = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        value.email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        value.contactIdentifier = contactIdentifier
        return value
    }
}

public extension FestivalValidation {
    /// 7–15 digits, optionally with a leading +, as the server accepts for Messages.
    static func validPhone(_ value: String) -> Bool { (7...15).contains(phone(value).filter(\.isNumber).count) }
    /// The same person: an equal phone number (ignoring formatting) or email (ignoring case).
    static func samePerson(_ recipient: ManagedFestivalRecipient, phone: String, email: String) -> Bool {
        let phone = Self.phone(phone), email = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return !phone.isEmpty && Self.phone(recipient.phone) == phone
            || !email.isEmpty && recipient.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == email
    }
    /// A new recipient's delivery channel: Messages when there is a phone number, else Email.
    static func defaultChannel(phone: String) -> String { phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "email" : "messages" }
}

public extension ManagedFestivalRecipient {
    /// The row's secondary line: the masked phone and/or email.
    var maskedAddresses: String {
        var parts: [String] = []
        if !phone.isEmpty { parts.append(masked(channel: "messages")) }
        if !email.isEmpty { parts.append(masked(channel: "email")) }
        return parts.joined(separator: " · ")
    }
}

/// The `festivalSave` request (src/server/moments/festival.ts): the moment's details and every recipient, saved together.
public struct FestivalSaveRequest: Encodable, Sendable {
    public struct Recipient: Encodable, Equatable, Sendable {
        public let id: String?
        public let key, name, phone, email: String
        public let selected: Bool
        public init(_ r: ManagedFestivalRecipient) {
            id = r.momentID; key = r.key; name = r.name; phone = FestivalValidation.phone(r.phone)
            email = r.email.trimmingCharacters(in: .whitespaces); selected = r.selected
        }
    }
    public let ids: [String]
    public let title, date, timeZoneID: String
    public let yearly, active: Bool
    public let recipients: [Recipient]
    public let settings: FestivalSettings
    public let cancelSchedules: Bool
    public init(ids: [String], title: String, date: String, timeZoneID: String, yearly: Bool, active: Bool, recipients: [ManagedFestivalRecipient], settings: FestivalSettings, cancelSchedules: Bool = false) {
        self.ids = ids; self.title = title; self.date = date; self.timeZoneID = timeZoneID; self.yearly = yearly; self.active = active
        self.recipients = recipients.map(Recipient.init); self.settings = settings; self.cancelSchedules = cancelSchedules
    }
    /// A new moment's recipients, saved onto the moment just created (`anchorID`). The first recipient is that moment,
    /// keyed by its id as Manage Moment reads it back; each other recipient becomes its own moment in the group. All are
    /// selected, each with its default channel and, when chosen from Contacts, its contact.
    public static func creating(anchorID: String, title: String, date: String, timeZoneID: String, yearly: Bool, recipients: [ManagedFestivalRecipient], settings base: FestivalSettings = FestivalSettings()) -> Self {
        var settings = base
        let saved = recipients.enumerated().map { index, r in
            var value = r
            value.momentID = index == 0 ? anchorID : nil
            if index == 0 { value.key = anchorID }
            value.selected = true
            return value
        }
        for r in saved {
            settings.channels[r.key] = FestivalValidation.defaultChannel(phone: r.phone)
            settings.selected[r.key] = true
            settings.contactIDs[r.key] = r.contactIdentifier
        }
        return Self(ids: [anchorID], title: title, date: date, timeZoneID: timeZoneID, yearly: yearly, active: true, recipients: saved, settings: settings)
    }
}

/// Which saved addresses were taken from a contact card. Contacts only reports a changed card for those, so an
/// address the user typed (or picked and then edited) never reads as "changed". Keys are one-way hashes: no address or
/// contact identifier is stored. Contacts identifiers only exist on this device, so this lives on the device too.
public struct ContactAddressLinks: Equatable, Sendable {
    public enum Field: String, Sendable { case phone, email }
    public private(set) var entries: [String: Bool]
    public init(entries: [String: Bool] = [:]) { self.entries = entries }
    static func id(contact: String, field: Field, address: String) -> String {
        let normalized = field == .phone ? FestivalValidation.phone(address) : address.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let digest = SHA256.hash(data: Data([contact, field.rawValue, normalized].joined(separator: "\u{1F}").utf8))
        return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
    }
    public func linked(contact: String, field: Field, address: String) -> Bool? { entries[Self.id(contact: contact, field: field, address: address)] }
    public mutating func record(contact: String, field: Field, address: String, linked: Bool) {
        guard !contact.isEmpty, !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        entries[Self.id(contact: contact, field: field, address: address)] = linked
    }
    /// Records a recipient saved from the sheet. With the contact's choices, an address is linked when it is one of them.
    /// Without them (editing later), a changed address was typed; an unchanged one keeps what was recorded.
    public mutating func record(_ draft: RecipientDraft, previous: ManagedFestivalRecipient? = nil) {
        guard !draft.contactIdentifier.isEmpty else { return }
        let fields: [(Field, String, [String], String?)] = [(.phone, draft.phone, draft.phoneChoices, previous?.phone), (.email, draft.email, draft.emailChoices, previous?.email)]
        for (field, address, choices, before) in fields where !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let id = Self.id(contact: draft.contactIdentifier, field: field, address: address)
            if !choices.isEmpty { entries[id] = choices.contains { Self.id(contact: draft.contactIdentifier, field: field, address: $0) == id } }
            else if before.map({ Self.id(contact: draft.contactIdentifier, field: field, address: $0) }) != id { entries[id] = false }
        }
    }
    public static let phoneChanged = "A contact’s phone number changed. Review their delivery address."
    public static let emailChanged = "A contact’s email changed. Review their delivery address."
    public static let contactDeleted = "A selected contact was deleted. Re-select or enter the recipient manually."
    /// The warning for a recipient chosen from Contacts, given its card now (`nil` when the contact was deleted): only when an
    /// address taken from the card is no longer on it. An address with no record (saved before links existed) is recorded
    /// from the card as it is now, without a warning.
    public mutating func review(_ r: ManagedFestivalRecipient, card: (phones: [String], emails: [String])?) -> String? {
        guard !r.contactIdentifier.isEmpty else { return nil }
        let fields: [(Field, String, String)] = [(.phone, r.phone, Self.phoneChanged), (.email, r.email, Self.emailChanged)]
        guard let card else {
            return fields.contains { !$0.1.isEmpty && linked(contact: r.contactIdentifier, field: $0.0, address: $0.1) == true } ? Self.contactDeleted : nil
        }
        for (field, address, warning) in fields where !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let id = Self.id(contact: r.contactIdentifier, field: field, address: address)
            let onCard = (field == .phone ? card.phones : card.emails).contains { Self.id(contact: r.contactIdentifier, field: field, address: $0) == id }
            switch entries[id] {
            case .some(true): if !onCard { return warning }
            case .some(false): break
            case .none: entries[id] = onCard
            }
        }
        return nil
    }
}
