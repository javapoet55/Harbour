import Foundation
import Testing
@testable import NexdoCore

@Test func festivalWallTimeRejectsDSTGapAndPreservesPacificTime() {
    #expect(FestivalValidation.instant(day:"2026-03-08",hour:2,minute:30,zone:"America/Los_Angeles")==nil)
    let value=FestivalValidation.instant(day:"2026-11-01",hour:1,minute:30,zone:"America/Los_Angeles")!
    #expect(ISO8601DateFormatter().string(from:value)=="2026-11-01T08:30:00Z")
    #expect(FestivalValidation.instant(day:"2026-09-17",hour:8,minute:0,zone:"America/Los_Angeles")==ISO8601DateFormatter().date(from:"2026-09-17T15:00:00Z"))
}
@Test func festivalContactsValidateAndMask() {
    let a=ManagedFestivalRecipient(key:"a",name:"Example",phone:"(925) 555-4821",email:"sample@example.com")
    var settings=FestivalSettings();settings.channels["a"]="messages"
    #expect(FestivalValidation.recipients([a],settings:settings)==nil)
    var b=a;b.key="b";settings.channels["b"]="messages"
    #expect(FestivalValidation.recipients([a,b],settings:settings)=="Remove duplicate delivery addresses.")
    #expect(a.masked(channel:"messages")=="Mobile · ••• ••• 4821")
    #expect(!a.masked(channel:"email").contains("sample@"))
    b.phone="bad";#expect(FestivalValidation.recipients([b],settings:settings) != nil)
    #expect(FestivalValidation.recipients([],settings:settings) != nil)
}
@Test func festivalScheduleRequiresApprovalAndProvider() {
    var s=FestivalSettings();s.baseMessage="Happy Diwali";s.channels["a"]="email"
    let r=ManagedFestivalRecipient(key:"a",name:"Example",email:"test@example.com")
    let future=Date().addingTimeInterval(3600)
    #expect(FestivalValidation.schedule(settings:s,date:future,active:true,emailReady:true,recipients:[r]) != nil)
    s.approvedAt="approved"
    #expect(FestivalValidation.schedule(settings:s,date:future,active:true,emailReady:true,recipients:[r])==nil)
    #expect(FestivalValidation.schedule(settings:s,date:future,active:false,emailReady:true,recipients:[r]) != nil)
    #expect(FestivalValidation.schedule(settings:s,date:future,active:true,emailReady:false,recipients:[r]) != nil)
    #expect(FestivalValidation.schedule(settings:s,date:.distantPast,active:true,emailReady:true,recipients:[r]) != nil)
    s.includeImage=true;#expect(FestivalValidation.schedule(settings:s,date:future,active:true,emailReady:true,recipients:[r]) != nil)
}
@Test func festivalCatalogDoesNotExtrapolateLunarDates() throws {
    let json=#"{"id":"test","name":"Festival","dates":["2026-10-20","2027-10-09"],"sourceURL":"https://example.com"}"#
    let entry=try JSONDecoder().decode(FestivalCatalogEntry.self,from:Data(json.utf8))
    #expect(entry.next(after:"2026-10-21")=="2027-10-09")
    #expect(entry.next(after:"2028-01-01")==nil)
}
@Test func festivalDraftRoundTripsOverridesAndApproval() throws {
    var s=FestivalSettings();s.baseMessage="Hello";s.overrides["a"]="Personal";s.approvedAt="now";s.manuallyEdited=true
    let raw=String(data:try JSONEncoder().encode(s),encoding:.utf8)!
    #expect(FestivalSettings.read(raw)==s)
    #expect(FestivalSettings.read("{}")==nil)
}
@Test func festivalFallbackAndImageContract() {
    for tone in ["Warm","Personal","Short","Fun"] {let text=FestivalValidation.fallback(name:"Happy Diwali",tone:tone);#expect(text.contains("Happy Diwali"));#expect(text.count<=500)}
    let request=FestivalImageRequest(festival:"Diwali",style:"Traditional",aspect:"Square",prompt:"Glowing diyas")
    #expect(request.safePrompt.contains("No text"))
    #expect(!FestivalImageCompatibility.valid(data:Data([1]),mime:"image/png",providerSupportsImages:false))
    #expect(!FestivalImageCompatibility.valid(data:Data([1]),mime:"image/webp",providerSupportsImages:true))
    #expect(FestivalImageCompatibility.valid(data:Data([1]),mime:"image/png",providerSupportsImages:true))
}

@Test func greetingCardSettingsPreserveLegacyAndPersonalization() throws {
    var settings=FestivalSettings();settings.baseMessage="Happy Diwali"
    let legacy=String(data:try JSONEncoder().encode(settings),encoding:.utf8)!
    #expect(FestivalSettings.read(legacy)?.cardSignature == nil)
    settings.cardSignature="With love, Sri & family";settings.cardGreeting="Wishing you light and joy."
    let saved=String(data:try JSONEncoder().encode(settings),encoding:.utf8)!
    #expect(FestivalSettings.read(saved)?.cardSignature==settings.cardSignature)
    #expect(FestivalSettings.read(saved)?.cardGreeting==settings.cardGreeting)
}

@Test func festivalSendDateUsesScheduledDayAndTimeZone() {
    let send=ISO8601DateFormatter().date(from:"2026-09-19T01:53:00Z")!
    #expect(MomentDates.sendDayLabel(send,zone:"America/Los_Angeles")=="Fri, Sep 18, 2026")
    #expect(MomentDates.sendDayLabel(send,zone:"Asia/Kolkata")=="Sat, Sep 19, 2026")
}
@Test func festivalContactChoicesListEachAddressOnce() {
    // Same number written with spaces, dashes and brackets: the first spelling is kept, in order.
    #expect(FestivalValidation.uniquePhones(["(925) 555-4821","925 555 4821","925-555-4821","+1 925 555 4821","[925]5554821","650 555 0101"])
        == ["(925) 555-4821","+1 925 555 4821","650 555 0101"])
    #expect(FestivalValidation.uniquePhones(["925\u{00A0}555\u{2013}4821","9255554821"]) == ["925\u{00A0}555\u{2013}4821"])
    #expect(FestivalValidation.uniqueEmails(["Sam@Example.com","sam@example.com","SAM@EXAMPLE.COM","sam.work@example.com"])
        == ["Sam@Example.com","sam.work@example.com"])
    #expect(FestivalValidation.uniquePhones([]).isEmpty && FestivalValidation.uniqueEmails([]).isEmpty)
    #expect(FestivalValidation.uniquePhones(["555 0101"]) == ["555 0101"])
}
