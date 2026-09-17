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
