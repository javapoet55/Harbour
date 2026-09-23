import Foundation
import Testing
@testable import NexdoCore

// 3. Ported from src/server/moments/wish-message.integration.test.ts ("the resolved wish text").
@Test func greetingMatchesTheServerRules() {
    #expect(MomentGreeting.message("Happy birthday! Enjoy.", type: "birthday", firstName: "Asha") == "Happy Birthday, Asha! Enjoy.")
    #expect(MomentGreeting.message("Happy Birthday", type: "birthday", firstName: "Asha") == "Happy Birthday, Asha!")
    #expect(MomentGreeting.message("Dear asha, enjoy.", type: "birthday", firstName: "Asha") == "Dear asha, enjoy.")
    #expect(MomentGreeting.message("Happy Birthdays all round", type: "birthday", firstName: "Asha") == "Happy Birthday, Asha! Happy Birthdays all round")
    #expect(MomentGreeting.message("Joyful Diwali!", type: "festival", firstName: "Asha") == "Joyful Diwali!")
}

@Test func greetingNeverProducesTwoGreetings() {
    #expect(MomentGreeting.message("Happy anniversary! Wishing you a wonderful year.", type: "birthday", firstName: "Visakan") == "Happy Anniversary, Visakan! Wishing you a wonderful year.")
    #expect(MomentGreeting.message("Happy Birthday! Enjoy.", type: "anniversary", firstName: "Visakan") == "Happy Birthday, Visakan! Enjoy.")
    #expect(MomentGreeting.message("Get well soon. Rest up.", type: "birthday", firstName: "Visakan") == "Get well soon, Visakan! Rest up.")
    #expect(MomentGreeting.message("Best wishes! Have a lovely day.", type: "birthday", firstName: "Visakan") == "Best wishes, Visakan! Have a lovely day.")
    #expect(MomentGreeting.message("Happy anniversary", type: "birthday", firstName: "Visakan") == "Happy Anniversary, Visakan!")
}

@Test func greetingUnchangedWhenMessageOpensWithTheMomentsOwnGreeting() {
    #expect(MomentGreeting.message("Happy Anniversary! Here’s to ten years.", type: "anniversary", firstName: "Asha") == "Happy Anniversary, Asha! Here’s to ten years.")
    #expect(MomentGreeting.message("get well soon. Thinking of you.", type: "getWellSoon", firstName: "Asha") == "Get well soon, Asha! Thinking of you.")
}

@Test func greetingAddedWhenMessageHasNoOpening() {
    #expect(MomentGreeting.message("Have a lovely day!", type: "birthday", firstName: "Asha") == "Happy Birthday, Asha! Have a lovely day!")
    #expect(MomentGreeting.message("Have a lovely day!", type: "anniversary", firstName: "Asha") == "Happy Anniversary, Asha! Have a lovely day!")
    #expect(MomentGreeting.message("Rest up.", type: "getWellSoon", firstName: "Asha") == "Get well soon, Asha! Rest up.")
    #expect(MomentGreeting.message("Happy anniversaries all round", type: "birthday", firstName: "Asha") == "Happy Birthday, Asha! Happy anniversaries all round")
}

@Test func noGreetingWithoutANameOrForOccasionsWithoutOne() {
    #expect(MomentGreeting.message("Happy anniversary! Wishing you well.", type: "birthday", firstName: "") == "Happy anniversary! Wishing you well.")
    #expect(MomentGreeting.message("Happy anniversary! Wishing you well.", type: "birthday", firstName: "   ") == "Happy anniversary! Wishing you well.")
    #expect(MomentGreeting.message("Happy Birthday! Enjoy.", type: "festival", firstName: "Asha") == "Happy Birthday! Enjoy.")
    #expect(MomentGreeting.message("Best wishes! Enjoy.", type: "custom", firstName: "Asha") == "Best wishes! Enjoy.")
}

@Test func greetingKeepsTextAfterTheOpeningExactly() {
    // Several separators after the opening are consumed; line breaks later in the wish are kept.
    #expect(MomentGreeting.message("Happy Birthday!!\n\nCake at seven.\nSee you!", type: "birthday", firstName: "Asha") == "Happy Birthday, Asha! Cake at seven.\nSee you!")
    #expect(MomentGreeting.message("  best WISHES. 🎉 Enjoy  ", type: "birthday", firstName: "Asha") == "Best wishes, Asha! 🎉 Enjoy")
    #expect(MomentGreeting.message("Happy Birthday, dear friend", type: "birthday", firstName: "Asha") == "Happy Birthday, Asha! Happy Birthday, dear friend")
}

// 4. Birthday and anniversary fallbacks match src/server/moments/domain.ts `fallback`.
@Test func birthdayAndAnniversaryFallbackMatchTheServer() {
    #expect(FestivalValidation.fallback(name: "Asha’s Birthday", tone: "Warm", type: "birthday", firstName: "Asha") == "Happy Birthday, Asha! Wishing you a wonderful day and a fantastic year ahead! 🎉")
    #expect(FestivalValidation.fallback(name: "x", tone: "Warm", type: "birthday", firstName: "Asha", version: 2) == "Happy Birthday, Asha! Hope your day is filled with happiness and lovely moments! 🎉")
    #expect(FestivalValidation.fallback(name: "x", tone: "Short", type: "birthday", firstName: "Asha") == "Happy Birthday, Asha! Wishing you a wonderful day.")
    #expect(FestivalValidation.fallback(name: "x", tone: "Fun", type: "anniversary", firstName: "Ravi") == "Happy Anniversary, Ravi! Here’s to smiles, good company, and a day worth celebrating! 🎉")
    #expect(FestivalValidation.fallback(name: "x", tone: "Personal", type: "anniversary", firstName: "Ravi") == "Happy Anniversary, Ravi! Thinking of you and sending my warmest wishes on this special day.")
    #expect(FestivalValidation.fallback(name: "x", tone: "Short", type: "anniversary") == "Happy Anniversary! Wishing you a wonderful day.")
    // Unchanged: get well soon and festival.
    #expect(FestivalValidation.fallback(name: "Sam", tone: "Short", type: "getWellSoon", firstName: "Sam") == "Get well soon. Thinking of you.")
    #expect(FestivalValidation.fallback(name: "Sam", tone: "Warm", type: "getWellSoon") == "Get well soon. Sending care, comfort, and warm wishes for brighter days ahead.")
    #expect(FestivalValidation.fallback(name: "Happy Diwali", tone: "Warm", firstName: "Asha") == "Happy Diwali! Wishing you and your family a joyful celebration filled with happiness and new beginnings! ✨")
    // The fallback's own greeting is what the wish is sent with: the name is not doubled.
    let draft = FestivalValidation.fallback(name: "x", tone: "Warm", type: "birthday")
    #expect(MomentGreeting.message(draft, type: "birthday", firstName: "Asha") == "Happy Birthday, Asha! Wishing you a wonderful day and a fantastic year ahead! 🎉")
}

// 2. Any old default, for any title, counts as untouched.
@Test func cardGreetingReplacesAnyOldDefault() {
    let defaults = [
        "Ravi’s anniversary! Sending you warm wishes on your special day.",
        "Old title! Sending you warm wishes on your special day.",
        "Get well soon. Wishing you comfort, rest, and brighter days ahead.",
        "Happy Holi! Wishing you and your family a joyful celebration filled with happiness and new beginnings! ✨",
        "Pongal! Wishing you joy and happiness.",
        "Eid! Here’s to a celebration full of smiles, good company, and wonderful memories! ✨",
        "Onam! Thinking of you and your family and sending warm wishes for a joyful celebration.",
        "  Renamed moment! Sending you warm wishes on your special day.\n",
    ]
    for base in defaults {
        var s = FestivalSettings(); s.baseMessage = base; s.approvedAt = "then"; s.cardGreeting = "Asha, thirty looks great on you."
        #expect(WishMessage.reconcile(&s), "\(base)")
        #expect(s.baseMessage == "Asha, thirty looks great on you." && s.approvedAt == nil && s.manuallyEdited && s.cardGreeting == nil)
    }
    // Hand-edited defaults, text that only resembles one, or real wishes are kept.
    for (base, edited) in [("Old title! Sending you warm wishes on your special day.", true),
                           ("Sending you warm wishes on your special day.", false),
                           ("Asha! Sending you warm wishes on your special day. Love, Sri", false),
                           ("Happy Birthday, Asha! Wishing you a wonderful day.", false)] {
        var s = FestivalSettings(); s.baseMessage = base; s.manuallyEdited = edited; s.cardGreeting = "Card text"
        #expect(!WishMessage.reconcile(&s), "\(base)")
        #expect(s.baseMessage == base && s.cardGreeting == nil)
    }
}

// 1. Opening a moment is not an unsaved change, and a phone-less email recipient defaults to Email.
@Test func openedSettingsShareChannelDefaults() {
    var saved = FestivalSettings(); saved.groupID = "g"; saved.baseMessage = "Hello"; saved.channels["kept"] = "share"
    let recipients = [ManagedFestivalRecipient(key: "mail", name: "Asha", email: "asha@example.com"),
                      ManagedFestivalRecipient(key: "phone", name: "Ravi", phone: "+15555550123", email: "ravi@example.com"),
                      ManagedFestivalRecipient(key: "none", name: "Sam"),
                      ManagedFestivalRecipient(key: "kept", name: "Lee", phone: "+15555550124")]
    let opened = WishMessage.opened(saved, recipients: recipients, latestBody: nil, latestStatus: nil)
    #expect(opened.live == opened.baseline)
    #expect(!opened.adoptedCardText)
    #expect(opened.live.channels == ["mail": "email", "phone": "messages", "none": "share", "kept": "share"])
    // With an adopted card greeting only the message differs: channels are in both.
    saved.baseMessage = ""; saved.cardGreeting = "From the card"
    let adopted = WishMessage.opened(saved, recipients: recipients, latestBody: nil, latestStatus: nil)
    #expect(adopted.adoptedCardText && adopted.live.baseMessage == "From the card" && adopted.baseline.baseMessage == "")
    #expect(adopted.live.channels == adopted.baseline.channels && adopted.baseline.channels["mail"] == "email")
    #expect(adopted.baseline.cardGreeting == nil && adopted.live.cardGreeting == nil)
    let editLive = FestivalEditState(title: "t", day: "d", zone: "z", yearly: true, active: true, recipients: recipients, settings: adopted.live)
    let editSaved = FestivalEditState(title: "t", day: "d", zone: "z", yearly: true, active: true, recipients: recipients, settings: adopted.baseline)
    #expect(editLive.change(from: editSaved) == .messageOnly)
}

// 5. Every type chosen in the editor is the type both Save buttons send.
@Test func chosenMomentTypeIsSaved() throws {
    for type in ["birthday", "anniversary", "festival", "getWellSoon", "custom"] {
        for start in ["birthday", "anniversary", "festival", "getWellSoon", "custom"] {
            var input = MomentInput(); input.type = start; input.firstName = "Asha"
            input.title = MomentTitles.defaultTitle(for: start, firstName: "Asha") ?? "My moment"
            input.choose(type: type)
            let payload = input.forSave(day: "2030-06-01")
            let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as! [String: Any]
            #expect(json["type"] as? String == type, "\(start) → \(type)")
            #expect(json["occurrenceDate"] as? String == "2030-06-01")
        }
    }
    var input = MomentInput(); input.firstName = "Asha"; input.title = "Asha’s Birthday"
    input.choose(type: "anniversary"); #expect(input.title == "Asha’s Anniversary" && input.yearly)
    input.choose(type: "getWellSoon"); #expect(input.title == "Get Well Soon" && !input.yearly)
    input.title = "Custom title"; input.choose(type: "birthday"); #expect(input.title == "Custom title" && input.type == "birthday")
}

// The offline Get Well Soon drafts FestivalValidation.fallback writes are defaults too.
@Test func offlineGetWellDraftsAreDefaults() {
    for tone in ["Short", "Warm", "Personal", "Fun"] {
        let draft = FestivalValidation.fallback(name: "Sam", tone: tone, type: "getWellSoon")
        var s = FestivalSettings(); s.baseMessage = draft; s.manuallyEdited = false; s.approvedAt = "then"; s.cardGreeting = "Sam, rest up. We miss you!"
        #expect(WishMessage.isUntouchedDefault(s), "\(tone)")
        #expect(WishMessage.reconcile(&s), "\(tone)")
        #expect(s.baseMessage == "Sam, rest up. We miss you!" && s.approvedAt == nil && s.manuallyEdited && s.cardGreeting == nil)
    }
    #expect(WishMessage.isUntouchedDefault({ var s = FestivalSettings(); s.baseMessage = "Get well soon. Thinking of you."; return s }()))
    #expect(WishMessage.isUntouchedDefault({ var s = FestivalSettings(); s.baseMessage = "Get well soon. Sending care, comfort, and warm wishes for brighter days ahead."; return s }()))
    // Edited, extended, or on a later line: kept.
    for (base, edited) in [("Get well soon. Thinking of you.", true),
                           ("Get well soon. Thinking of you. Love, Sri", false),
                           ("Sam,\nGet well soon. Thinking of you.", false)] {
        var s = FestivalSettings(); s.baseMessage = base; s.manuallyEdited = edited; s.cardGreeting = "Card text"
        #expect(!WishMessage.reconcile(&s), "\(base)")
        #expect(s.baseMessage == base)
    }
}
