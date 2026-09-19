import Foundation
import Testing
@testable import NexdoCore

@Test func momentRecurrenceKeepsLeapDayAndUsesRecipientZone() {
    let now = ISO8601DateFormatter().date(from: "2027-03-01T01:00:00Z")!
    #expect(MomentDates.next("2000-02-29", yearly: true, zone: "America/Los_Angeles", now: now) == "2027-02-28")
    #expect(MomentDates.next("2000-02-29", yearly: true, zone: "Asia/Tokyo", now: now) == "2028-02-29")
    #expect(MomentDates.next("2026-12-25", yearly: false, zone: "UTC", now: now) == "2026-12-25")
}
@Test func wishResultsNeverConfuseCopyWithSent() throws {
    let raw: [String: Any] = ["id":"plan","draftID":"draft","channel":"copy","recipient":"","subject":"Wish","body":"Hello","scheduledAtUTC":"2026-09-17T16:00:00.000Z","timeZoneID":"America/Los_Angeles","status":"COPIED","idempotencyKey":"key","automaticDelivery":false,"repeatYearly":false,"reminderOffset":0]
    let plan = try JSONDecoder().decode(WishDeliveryPlan.self, from: JSONSerialization.data(withJSONObject: raw))
    #expect(plan.statusLabel == "Copied — delivery not confirmed")
    #expect(!plan.editable)
    #expect(MomentDates.day(plan.date, zone: plan.timeZoneID) == "2026-09-17")
}
@Test func momentLocalDatesAcrossDST() {
    for day in ["2026-03-08", "2026-11-01"] {
        #expect(MomentDates.day(MomentDates.date(day, zone: "America/Los_Angeles"), zone: "America/Los_Angeles") == day)
    }
}

@Test func momentGroupsUseOccurrenceAndRecipientCalendar() throws {
    func moment(_ day: String) throws -> ImportantMoment {
        let raw: [String: Any] = ["id":"m","type":"birthday","title":"Birthday","firstName":"","phone":"","email":"","occurrenceDate":day,"nextOccurrence":day,"timeZoneID":"America/Los_Angeles","source":"manual","sourceKey":"test","yearly":false,"enabled":true,"drafts":[]]
        return try JSONDecoder().decode(ImportantMoment.self, from: JSONSerialization.data(withJSONObject: raw))
    }
    let now = MomentDates.date("2026-09-16", zone: "America/Los_Angeles")
    #expect(try moment("2026-09-17").upcomingGroup(now: now) == .thisWeek)
    #expect(try moment("2026-09-23").upcomingGroup(now: now) == .nextWeek)
    #expect(try moment("2026-09-30").upcomingGroup(now: now) == .thisMonth)
    #expect(try moment("2026-10-20").upcomingGroup(now: now) == .nextMonth)
    #expect(try moment("2026-11-20").upcomingGroup(now: now) == .later)
    #expect(try moment("2027-01-20").upcomingGroup(now: MomentDates.date("2026-12-16", zone: "America/Los_Angeles")) == .nextMonth)
}

@Test func festivalCardsGroupRecipientsWithoutMergingOtherOccasions() throws {
    func moment(_ id: String, type: String = "festival", title: String = "Happy Diwali", day: String = "2026-10-20") throws -> ImportantMoment {
        let raw: [String: Any] = ["id":id,"type":type,"title":title,"firstName":id,"phone":"","email":"","occurrenceDate":day,"nextOccurrence":day,"timeZoneID":"America/Los_Angeles","source":"manual","sourceKey":id,"yearly":false,"enabled":true,"drafts":[]]
        return try JSONDecoder().decode(ImportantMoment.self, from: JSONSerialization.data(withJSONObject: raw))
    }
    let groups = MomentDisplayGroup.groups(try [
        moment("a"), moment("b", title: " happy diwali "),
        moment("c", day: "2026-10-21"), moment("d", title: "Happy Holi"),
        moment("e", type: "birthday"), moment("f", type: "birthday")
    ])
    #expect(groups.count == 5)
    #expect(groups[0].moments.map(\.id) == ["a", "b"])
    #expect(groups.dropFirst().allSatisfy { $0.moments.count == 1 })
}

@Test func wishReviewDistinguishesApprovalFromScheduling() throws {
    let raw:[String:Any] = ["id":"m","type":"festival","title":"Diwali","firstName":"Sam","phone":"","email":"","occurrenceDate":"2026-09-20","nextOccurrence":"2026-09-20","timeZoneID":"UTC","source":"manual","sourceKey":"test","yearly":false,"enabled":true,"drafts":[]]
    var moment=try JSONDecoder().decode(ImportantMoment.self,from:JSONSerialization.data(withJSONObject:raw))
    #expect(moment.needsWishReview)
    var settings=FestivalSettings();settings.baseMessage="Happy Diwali";settings.approvedAt="2026-09-17T00:00:00Z"
    moment.festivalSettings=String(data:try JSONEncoder().encode(settings),encoding:.utf8)
    #expect(moment.readyToSchedule)
    #expect(!moment.needsWishReview)
    let planRaw:[String:Any] = ["id":"p","draftID":"d","channel":"messages","recipient":"+15555550123","subject":"Diwali","body":"Hi","scheduledAtUTC":"2026-09-20T08:00:00Z","timeZoneID":"UTC","status":"AWAITING_CONFIRMATION","idempotencyKey":"k","automaticDelivery":false,"repeatYearly":false,"reminderOffset":60]
    var plan=try JSONDecoder().decode(WishDeliveryPlan.self,from:JSONSerialization.data(withJSONObject:planRaw))
    moment.drafts=[WishDraft(id:"d",momentID:"m",tone:"Warm",body:"Hi",personalContext:"",status:"PLANNED",generationVersion:1,plans:[plan])]
    #expect(moment.upcomingDelivery != nil)
    #expect(!moment.needsWishReview)
    #expect(!moment.readyToSchedule)
    plan.status="CANCELLED";moment.drafts[0].plans=[plan]
    #expect(moment.readyToSchedule)
    settings.approvedAt=nil
    moment.festivalSettings=String(data:try JSONEncoder().encode(settings),encoding:.utf8)
    #expect(moment.needsWishReview)
    moment.type="birthday";moment.festivalSettings=nil
    moment.drafts=[WishDraft(id:"d",momentID:"m",tone:"Warm",body:"Happy Birthday",personalContext:"",status:"READY",generationVersion:1,plans:[])]
    #expect(moment.readyToSchedule)
    moment.nextOccurrence="2027-09-20"
    #expect(moment.needsWishReview)
    moment.enabled=false
    #expect(!moment.needsWishReview)
}


@Test func allGreetingCategoriesKeepGroupsAndApproval() throws {
    for type in ["birthday","anniversary","getWellSoon","festival"] {
        var settings=FestivalSettings();settings.groupID="shared";settings.baseMessage="Warm wishes";settings.cardSignature="With love, Sam";settings.approvedAt="2026-09-17T00:00:00Z"
        let encoded=String(data:try JSONEncoder().encode(settings),encoding:.utf8)!
        func make(_ id:String,_ category:String) throws -> ImportantMoment {
            let raw:[String:Any]=["id":id,"type":category,"title":"Occasion","firstName":id,"phone":"","email":"","occurrenceDate":"2030-09-20","nextOccurrence":"2030-09-20","timeZoneID":"UTC","source":"manual","sourceKey":id,"yearly":false,"enabled":true,"drafts":[],"festivalSettings":encoded]
            return try JSONDecoder().decode(ImportantMoment.self,from:JSONSerialization.data(withJSONObject:raw))
        }
        let a=try make("a",type),b=try make("b",type),other=try make("c",type == "festival" ? "birthday":"festival")
        #expect(a.supportsGreetingCard)
        #expect(a.readyToSchedule)
        #expect(!a.needsWishReview)
        #expect(FestivalSettings.read(a.festivalSettings)?.cardSignature == "With love, Sam")
        let groups=MomentDisplayGroup.groups([a,b,other])
        #expect(groups.count == 2)
        #expect(groups[0].moments.count == 2)
    }
}

@Test func editableMomentGroupsExcludeArchivedRecipientsButHistoryKeepsThem() throws {
    var settings = FestivalSettings()
    settings.groupID = "shared"
    func moment(_ id: String, archived: Bool) throws -> ImportantMoment {
        var saved = settings
        saved.archived = archived
        let raw: [String: Any] = ["id":id,"type":"birthday","title":"Birthday","firstName":id,"phone":"","email":"","occurrenceDate":"2030-01-01","nextOccurrence":"2030-01-01","timeZoneID":"UTC","source":"manual","sourceKey":id,"yearly":true,"enabled":!archived,"drafts":[],"festivalSettings":String(data:try JSONEncoder().encode(saved),encoding:.utf8)!]
        return try JSONDecoder().decode(ImportantMoment.self,from:JSONSerialization.data(withJSONObject:raw))
    }
    let removed = try moment("removed", archived:true)
    let current = try moment("current", archived:false)
    #expect(MomentDisplayGroup.editableGroups([removed,current]).first?.moments.map(\.id) == ["current"])
    #expect(MomentDisplayGroup.groups([removed,current]).first?.moments.count == 2)
    var deleted = current
    deleted.festivalSettings = "{ \"archived\" : true }"
    #expect(deleted.isArchived)
    #expect(MomentDisplayGroup.editableGroups([deleted]).isEmpty)
}
