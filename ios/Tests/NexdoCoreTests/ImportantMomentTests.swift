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
