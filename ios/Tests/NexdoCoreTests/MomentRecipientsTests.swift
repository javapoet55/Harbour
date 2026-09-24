import Foundation
import Testing
@testable import NexdoCore

@Test func recipientDraftFromContactPrefillsAndDedupesChoices() {
    let draft = RecipientDraft(contact: "C1", name: "Asha", phones: ["+1 (555) 555-0101", "+15555550101", "555-0102"], emails: ["Asha@Example.com", "asha@example.com", "a@work.com"])
    #expect(draft.name == "Asha")
    #expect(draft.phone == "+1 (555) 555-0101")
    #expect(draft.email == "Asha@Example.com")
    #expect(draft.phoneChoices == ["+1 (555) 555-0101", "555-0102"])
    #expect(draft.emailChoices == ["Asha@Example.com", "a@work.com"])
    #expect(draft.contactIdentifier == "C1")
}

@Test func recipientDraftValidation() {
    #expect(RecipientDraft(name: " ", phone: "+15555550101").issue(among: []) == RecipientDraft.nameRequired)
    #expect(RecipientDraft(name: String(repeating: "a", count: 81), phone: "+15555550101").issue(among: []) == RecipientDraft.nameTooLong)
    #expect(RecipientDraft(name: String(repeating: "a", count: 80), phone: "+15555550101").issue(among: []) == nil)
    #expect(RecipientDraft(name: "Asha").issue(among: []) == RecipientDraft.addressRequired)
    #expect(RecipientDraft(name: "Asha", phone: "  ", email: " ").issue(among: []) == RecipientDraft.addressRequired)
    #expect(RecipientDraft(name: "Asha", phone: "12345").issue(among: []) == RecipientDraft.invalidPhone)
    #expect(RecipientDraft(name: "Asha", email: "asha@").issue(among: []) == RecipientDraft.invalidEmail)
    // A filled field must be valid even when the other one is.
    #expect(RecipientDraft(name: "Asha", phone: "12", email: "asha@example.com").issue(among: []) == RecipientDraft.invalidPhone)
    #expect(RecipientDraft(name: "Asha", phone: "+1 (555) 555-0101").issue(among: []) == nil)
    #expect(RecipientDraft(name: "Asha", email: " asha@example.com ").issue(among: []) == nil)
}

@Test func recipientDraftRejectsTheSamePersonByPhoneOrEmail() {
    let existing = [ManagedFestivalRecipient(key: "a", name: "Asha", phone: "+1 555-555-0101", email: "asha@example.com")]
    #expect(RecipientDraft(name: "Other", phone: "+15555550101").issue(among: existing) == RecipientDraft.duplicate)
    #expect(RecipientDraft(name: "Other", email: "ASHA@example.com ").issue(among: existing) == RecipientDraft.duplicate)
    #expect(RecipientDraft(name: "Asha", phone: "+15555550199", email: "new@example.com").issue(among: existing) == nil)
    // Editing a recipient compares against the others only, so keeping its own details is not a duplicate.
    #expect(RecipientDraft(editing: existing[0]).issue(among: []) == nil)
}

@Test func recipientDraftSavesTrimmedValuesAndKeepsEditedIdentity() {
    let existing = ManagedFestivalRecipient(momentID: "m1", key: "k1", name: "Asha", phone: "+15555550101", selected: false, contactIdentifier: "C1")
    var draft = RecipientDraft(editing: existing)
    draft.name = " Asha K "; draft.email = " asha@example.com "; draft.contactIdentifier = "C1"
    let saved = draft.recipient(updating: existing)
    #expect(saved.key == "k1" && saved.momentID == "m1" && saved.selected == false)
    #expect(saved.name == "Asha K" && saved.email == "asha@example.com" && saved.phone == "+15555550101")
    let added = RecipientDraft(name: "Ravi", phone: "+15555550102").recipient()
    #expect(added.momentID == nil && added.selected && !added.key.isEmpty && added.key != RecipientDraft(name: "Ravi").recipient().key)
}

@Test func recipientRowShowsMaskedPhoneAndEmail() {
    #expect(ManagedFestivalRecipient(name: "A", phone: "+15555550101", email: "asha@example.com").maskedAddresses == "Mobile · ••• ••• 0101 · Email · a••••@example.com")
    #expect(ManagedFestivalRecipient(name: "A", email: "asha@example.com").maskedAddresses == "Email · a••••@example.com")
    #expect(ManagedFestivalRecipient(name: "A", phone: "+15555550101").maskedAddresses == "Mobile · ••• ••• 0101")
}

@Test func creatingAMomentSavesEveryRecipientWithItsOwnAddressAndChannel() throws {
    let recipients = [
        ManagedFestivalRecipient(key: "r1", name: "Asha", phone: "+1 (555) 555-0101", email: "asha@example.com", contactIdentifier: "C1"),
        ManagedFestivalRecipient(key: "r2", name: "Ravi", email: " ravi@example.com "),
        ManagedFestivalRecipient(key: "r3", name: "Lee", phone: "555 555 0103", selected: false)
    ]
    var base = FestivalSettings(); base.groupID = "G"
    let request = FestivalSaveRequest.creating(anchorID: "anchor", title: "Diwali Wishes", date: "2026-11-08", timeZoneID: "Asia/Kolkata", yearly: false, recipients: recipients, settings: base)
    #expect(request.ids == ["anchor"])
    #expect(request.active && !request.cancelSchedules)
    // The first recipient is the moment just created, keyed by its id; the rest are new moments in the group.
    #expect(request.recipients.map(\.id) == ["anchor", nil, nil])
    #expect(request.recipients.map(\.key) == ["anchor", "r2", "r3"])
    #expect(request.recipients.map(\.phone) == ["+15555550101", "", "5555550103"])
    #expect(request.recipients.map(\.email) == ["asha@example.com", "ravi@example.com", ""])
    #expect(request.recipients.map(\.selected) == [true, true, true])
    #expect(request.settings.groupID == "G")
    #expect(request.settings.channels == ["anchor": "messages", "r2": "email", "r3": "messages"])
    #expect(request.settings.selected == ["anchor": true, "r2": true, "r3": true])
    #expect(request.settings.contactIDs == ["anchor": "C1", "r2": "", "r3": ""])

    let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as! [String: Any]
    #expect(Set(json.keys) == ["ids", "title", "date", "timeZoneID", "yearly", "active", "recipients", "settings", "cancelSchedules"])
    let first = (json["recipients"] as! [[String: Any]])[0]
    #expect(Set(first.keys) == ["id", "key", "name", "phone", "email", "selected"])
}

@Test func createdRecipientsPassTheServerRecipientRules() {
    let recipients = [ManagedFestivalRecipient(key: "r1", name: "Asha", phone: "+15555550101"), ManagedFestivalRecipient(key: "r2", name: "Ravi", email: "ravi@example.com")]
    let request = FestivalSaveRequest.creating(anchorID: "anchor", title: "T", date: "2026-11-08", timeZoneID: "UTC", yearly: true, recipients: recipients)
    let saved = zip(recipients, request.recipients).map { original, sent in ManagedFestivalRecipient(momentID: sent.id, key: sent.key, name: sent.name, phone: sent.phone, email: sent.email, selected: sent.selected, contactIdentifier: original.contactIdentifier) }
    #expect(FestivalValidation.recipients(saved, settings: request.settings) == nil)
}

@Test func typedEmailThatDiffersFromTheContactIsNeverReportedAsChanged() {
    var links = ContactAddressLinks()
    // Picked from Contacts (phone from the card), then an email typed that the card doesn't have.
    var draft = RecipientDraft(contact: "C1", name: "Asha", phones: ["+15555550101"], emails: ["asha@home.com"])
    draft.email = "asha@work.com"
    links.record(draft)
    let saved = draft.recipient()
    let card = (phones: ["+1 555-555-0101"], emails: ["asha@home.com"])
    #expect(links.review(saved, card: card) == nil)
    // Only a card change to the address taken from it is reported.
    #expect(links.review(saved, card: (phones: ["+15555550199"], emails: ["asha@home.com"])) == ContactAddressLinks.phoneChanged)
    #expect(links.review(saved, card: (phones: ["+15555550101"], emails: [])) == nil)
}

@Test func emailTakenFromTheCardIsReportedOnlyAfterTheCardChanges() {
    var links = ContactAddressLinks()
    let draft = RecipientDraft(contact: "C1", name: "Asha", phones: [], emails: ["asha@home.com"])
    links.record(draft)
    let saved = draft.recipient()
    #expect(links.review(saved, card: (phones: [], emails: ["ASHA@home.com"])) == nil)
    #expect(links.review(saved, card: (phones: [], emails: ["asha@new.com"])) == ContactAddressLinks.emailChanged)
    #expect(links.review(saved, card: nil) == ContactAddressLinks.contactDeleted)
}

@Test func editingAnAddressWithoutTheCardsChoicesUnlinksIt() {
    var links = ContactAddressLinks()
    let first = RecipientDraft(contact: "C1", name: "Asha", phones: [], emails: ["asha@home.com"])
    links.record(first)
    let saved = first.recipient()
    var edit = RecipientDraft(editing: saved)
    edit.email = "asha@typed.com"
    links.record(edit, previous: saved)
    let edited = edit.recipient(updating: saved)
    #expect(links.review(edited, card: (phones: [], emails: ["asha@home.com"])) == nil)
    #expect(links.review(edited, card: nil) == nil)
    // Saving without changing the address keeps its link.
    links.record(RecipientDraft(editing: saved), previous: saved)
    #expect(links.linked(contact: "C1", field: .email, address: "asha@home.com") == true)
}

@Test func recipientsSavedBeforeLinksAreBaselinedWithoutAWarning() {
    var links = ContactAddressLinks()
    let legacy = ManagedFestivalRecipient(key: "k", name: "Asha", phone: "+15555550101", email: "typed@example.com", contactIdentifier: "C1")
    #expect(links.review(legacy, card: (phones: ["+15555550101"], emails: ["asha@home.com"])) == nil)
    #expect(links.linked(contact: "C1", field: .phone, address: "+15555550101") == true)
    #expect(links.linked(contact: "C1", field: .email, address: "typed@example.com") == false)
    #expect(links.review(legacy, card: (phones: [], emails: ["asha@home.com"])) == ContactAddressLinks.phoneChanged)
    // A manually entered recipient is never checked against Contacts.
    #expect(links.review(ManagedFestivalRecipient(name: "M", email: "m@example.com"), card: nil) == nil)
}

@Test func contactLinksStoreNoAddressesOrIdentifiers() {
    var links = ContactAddressLinks()
    links.record(RecipientDraft(contact: "CONTACT-ID", name: "Asha", phones: ["+15555550101"], emails: ["asha@home.com"]))
    let stored = links.entries.keys.joined()
    #expect(links.entries.count == 2)
    #expect(!stored.contains("CONTACT") && !stored.contains("asha") && !stored.contains("5555550101"))
}
