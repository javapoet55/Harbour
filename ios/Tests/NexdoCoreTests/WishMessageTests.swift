import Foundation
import Testing
@testable import NexdoCore

// 1. The suggestion is a placeholder, never the saved message.
@Test func wishSuggestionIsOnlyAPlaceholder() {
    #expect(WishMessage.suggestion(type: "birthday", title: "Asha’s birthday") == "Asha’s birthday! Sending you warm wishes on your special day.")
    #expect(WishMessage.suggestion(type: "getWellSoon", title: "Sam") == "Get well soon. Wishing you comfort, rest, and brighter days ahead.")
    #expect(WishMessage.suggestion(type: "festival", title: "Happy Diwali") == FestivalValidation.fallback(name: "Happy Diwali", tone: "Warm"))
    // Nothing saved: the editor starts empty rather than with the suggestion.
    #expect(WishMessage.initial(saved: "", latestBody: nil, latestStatus: nil) == "")
    #expect(WishMessage.initial(saved: "", latestBody: "Server fallback draft", latestStatus: "DRAFT") == "")
    #expect(WishMessage.initial(saved: "", latestBody: "Asha, you’re the best!", latestStatus: "READY") == "Asha, you’re the best!")
    #expect(WishMessage.initial(saved: "", latestBody: "Approved and scheduled", latestStatus: "PLANNED") == "Approved and scheduled")
    #expect(WishMessage.initial(saved: "Mine", latestBody: "Other", latestStatus: "READY") == "Mine")
}

@Test func approvingNeedsRealText() {
    var s = FestivalSettings()
    #expect(WishMessage.approvalError(s) == "Each message must contain 1–500 characters.")
    s.baseMessage = "  \n "
    #expect(WishMessage.approvalError(s) != nil)
    s.baseMessage = String(repeating: "a", count: 501)
    #expect(WishMessage.approvalError(s) != nil)
    s.baseMessage = "Happy birthday, Asha!"
    #expect(WishMessage.approvalError(s) == nil)
    s.overrides["a"] = " "
    #expect(WishMessage.approvalError(s) != nil)
    // Tapping "Use suggestion" is the only way the suggestion becomes the message.
    s = FestivalSettings(); s.baseMessage = WishMessage.suggestion(type: "birthday", title: "Asha’s birthday")
    #expect(WishMessage.approvalError(s) == nil)
}

// 2. One missing or mistyped key no longer discards the saved settings.
@Test func festivalSettingsDecodeFieldByField() throws {
    let partial = #"{"groupID":"g1","baseMessage":"Asha, cake at seven!","approvedAt":"2026-09-23T10:00:00Z","overrides":{"a":"Just for you"},"imageAspect":5,"channels":{"a":"email"}}"#
    let s = try #require(FestivalSettings.read(partial))
    #expect(s.groupID == "g1")
    #expect(s.baseMessage == "Asha, cake at seven!")
    #expect(s.approvedAt == "2026-09-23T10:00:00Z")
    #expect(s.overrides == ["a": "Just for you"])
    #expect(s.channels == ["a": "email"])
    #expect(s.imageAspect == "Portrait")
    #expect(s.tone == "Warm" && s.prepareDays == 1 && s.includeImage == false && s.cardGreeting == nil)
    // Settings never saved by Manage Moment (no group) stay nil, so group identity does not change per read.
    #expect(FestivalSettings.read("{}") == nil)
    #expect(FestivalSettings.read(#"{"archived":true}"#) == nil)
    #expect(FestivalSettings.read(#"{"groupID":""}"#) == nil)
    #expect(FestivalSettings.read("not json") == nil)
    #expect(FestivalSettings.read(nil) == nil)
    // Encoding is unchanged: no extra keys, and it round-trips.
    var full = FestivalSettings(); full.baseMessage = "Hello"; full.cardSignature = "Sri"
    let data = try JSONEncoder().encode(full)
    let keys = Set((try JSONSerialization.jsonObject(with: data) as! [String: Any]).keys)
    #expect(!keys.contains("hasGroup"))
    #expect(keys.contains("groupID") && keys.contains("baseMessage"))
    #expect(FestivalSettings.read(String(data: data, encoding: .utf8)) == full)
}

// 3. The card prints the Wish Message (or the recipient's own message).
@Test func cardPrintsTheWishMessage() {
    var s = FestivalSettings(); s.baseMessage = "Have a lovely day!"; s.overrides["b"] = "Ravi, just for you."
    #expect(WishMessage.card(s) == "Have a lovely day!")
    #expect(WishMessage.card(s, recipientKey: "a") == "Have a lovely day!")
    #expect(WishMessage.card(s, recipientKey: "b") == "Ravi, just for you.")
    s.cardGreeting = "Stale card text"
    #expect(WishMessage.card(s) == "Have a lovely day!")
}

@Test func olderCardGreetingFoldsIntoTheWishMessage() {
    let suggestion = WishMessage.suggestion(type: "birthday", title: "Asha’s birthday")
    // The reported case: the default was stored as the message and the user's text lived only on the card.
    var s = FestivalSettings(); s.baseMessage = suggestion; s.approvedAt = "then"; s.cardGreeting = "Asha, thirty looks great on you."
    #expect(WishMessage.reconcile(&s))
    #expect(s.baseMessage == "Asha, thirty looks great on you.")
    #expect(s.approvedAt == nil && s.manuallyEdited && s.cardGreeting == nil)
    // Empty message: the card text is adopted.
    s = FestivalSettings(); s.cardGreeting = "Card only"
    #expect(WishMessage.reconcile(&s) && s.baseMessage == "Card only")
    // A message the user wrote wins; the card text is dropped.
    s = FestivalSettings(); s.baseMessage = "Typed wish"; s.manuallyEdited = true; s.approvedAt = "then"; s.cardGreeting = "Old card"
    #expect(!WishMessage.reconcile(&s))
    #expect(s.baseMessage == "Typed wish" && s.approvedAt == "then" && s.cardGreeting == nil)
    // The suggestion typed or kept on purpose (manually edited) is not replaced.
    s = FestivalSettings(); s.baseMessage = suggestion; s.manuallyEdited = true; s.cardGreeting = "Card"
    #expect(!WishMessage.reconcile(&s) && s.baseMessage == suggestion)
    // Same text, or a blank card text: nothing to adopt.
    s = FestivalSettings(); s.baseMessage = "Same"; s.cardGreeting = "Same"
    #expect(!WishMessage.reconcile(&s) && s.cardGreeting == nil)
    s = FestivalSettings(); s.cardGreeting = "  "
    #expect(!WishMessage.reconcile(&s) && s.baseMessage.isEmpty)
}

// 5. Approved message-only saves keep schedules; delivery changes or unapproved messages ask to cancel.
private func state(_ edit: (inout FestivalEditState) -> Void = { _ in }) -> FestivalEditState {
    var s = FestivalSettings(); s.groupID = "g"; s.baseMessage = "Hello"; s.approvedAt = "then"; s.channels["a"] = "email"; s.automatic["a"] = true
    var value = FestivalEditState(title: "Asha’s birthday", day: "2030-06-01", zone: "America/Los_Angeles", yearly: true, active: true,
                                  recipients: [ManagedFestivalRecipient(momentID: "m1", key: "a", name: "Asha", email: "asha@example.com")], settings: s)
    edit(&value)
    return value
}

@Test func saveChangeClassification() {
    let saved = state()
    #expect(state().change(from: saved) == .none)
    for edit in [{ (s: inout FestivalEditState) in s.settings.baseMessage = "New" },
                 { $0.settings.overrides["a"] = "Mine" }, { $0.settings.tone = "Fun" }, { $0.settings.approvedAt = nil },
                 { $0.settings.cardSignature = "Sri" }, { $0.settings.imageID = "img" }, { $0.settings.cardGreeting = "Old" },
                 { $0.settings.draftSendDate = "2030-06-01T15:00:00Z" }, { $0.settings.personalContext = "Loves cake" },
                 { $0.recipients[0].momentID = "m2" }] as [(inout FestivalEditState) -> Void] {
        #expect(state(edit).change(from: saved) == .messageOnly || state(edit).change(from: saved) == .none)
    }
    #expect(state { $0.settings.baseMessage = "New" }.change(from: saved) == .messageOnly)
    for edit in [{ (s: inout FestivalEditState) in s.title = "Renamed" }, { $0.day = "2030-06-02" }, { $0.zone = "Asia/Kolkata" },
                 { $0.yearly = false }, { $0.active = false }, { $0.recipients[0].email = "other@example.com" },
                 { $0.recipients[0].selected = false }, { $0.recipients.append(ManagedFestivalRecipient(key: "b", name: "Ravi", phone: "+15555550123")) },
                 { $0.settings.channels["a"] = "share" }, { $0.settings.automatic["a"] = false }, { $0.settings.prepareDays = 3 },
                 { $0.settings.catalogManaged = true }, { $0.settings.includeImage = true }] as [(inout FestivalEditState) -> Void] {
        #expect(state(edit).change(from: saved) == .delivery)
    }
}

@Test func cancelPromptOnlyForDeliveryOrUnapprovedMessage() {
    #expect(!FestivalChange.messageOnly.needsCancelPrompt(approve: true, hasSchedules: true))
    #expect(FestivalChange.messageOnly.needsCancelPrompt(approve: false, hasSchedules: true))
    #expect(FestivalChange.delivery.needsCancelPrompt(approve: true, hasSchedules: true))
    #expect(FestivalChange.delivery.needsCancelPrompt(approve: false, hasSchedules: true))
    #expect(!FestivalChange.none.needsCancelPrompt(approve: true, hasSchedules: true))
    for change in [FestivalChange.none, .messageOnly, .delivery] { #expect(!change.needsCancelPrompt(approve: false, hasSchedules: false)) }
}

@Test func sendInProgressConflictHasAClearMessage() {
    #expect(WishMessage.saveError(status: 409, message: "A delivery is in progress. Refresh before editing.") == WishMessage.sendingNow)
    #expect(WishMessage.saveError(status: 409, message: "A delivery started. Refresh before editing.") == WishMessage.sendingNow)
    #expect(WishMessage.saveError(status: 409, message: "Existing schedules must be cancelled before saving changes. Review and schedule again.") == nil)
    #expect(WishMessage.saveError(status: 400, message: "A delivery is in progress.") == nil)
}
