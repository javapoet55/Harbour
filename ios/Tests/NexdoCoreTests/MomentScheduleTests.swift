import Foundation
import Testing
@testable import NexdoCore

private func scheduledMoment(day: String, yearly: Bool = true) throws -> ImportantMoment {
    let raw: [String: Any] = ["id":"birthday:person","type":"birthday","title":"Alex’s birthday","firstName":"Alex","phone":"","email":"","occurrenceDate":day,"nextOccurrence":day,"timeZoneID":"Asia/Tokyo","source":"manual","sourceKey":"test","yearly":yearly,"enabled":true,"drafts":[]]
    return try JSONDecoder().decode(ImportantMoment.self, from: JSONSerialization.data(withJSONObject: raw))
}

@Test func momentsAppearOnTheirCalendarDateAndNotTheReminderDate() throws {
    let moment = try scheduledMoment(day: "1990-10-09")
    let events = MomentSchedule.events([moment], days: ["2026-10-08", "2026-10-09", "2026-10-10"], timeZone: "America/Los_Angeles")
    #expect(events.count == 1)
    let event = try #require(events.first)
    #expect(event.allDay == true)
    #expect(ServerDate.occurs(event, on: "2026-10-09", timeZone: "America/Los_Angeles"))
    #expect(!ServerDate.occurs(event, on: "2026-10-10", timeZone: "America/Los_Angeles"))
    #expect(MomentSchedule.momentID(event.id) == moment.id)
    #expect(MomentSchedule.momentID("ordinary-task") == nil)
    let index = CalendarDayIndex(days: ["2026-10-09"], timeZone: "America/Los_Angeles", tasks: [], events: events)
    #expect(index.events["2026-10-09"]?.count == 1)
}

@Test func momentsRespectRecurrenceArchivesAndDisabledState() throws {
    var moment = try scheduledMoment(day: "2000-02-29")
    #expect(MomentSchedule.occurs(moment, on: "2027-02-28"))
    #expect(!MomentSchedule.occurs(moment, on: "2028-02-28"))
    #expect(MomentSchedule.occurs(moment, on: "2028-02-29"))
    moment.enabled = false
    #expect(!MomentSchedule.occurs(moment, on: "2028-02-29"))
    moment.enabled = true; moment.festivalSettings = #"{"archived":true}"#
    #expect(!MomentSchedule.occurs(moment, on: "2028-02-29"))
    let oneOff = try scheduledMoment(day: "2026-10-09", yearly: false)
    #expect(!MomentSchedule.occurs(oneOff, on: "2027-10-09"))
}

@Test func momentTaskProjectionUsesExistingDayFiltersWithoutDuplicates() throws {
    let moment = try scheduledMoment(day: "1990-10-09")
    let now = ServerDate.parse("2026-10-09T16:00:00Z")!
    let entries = MomentSchedule.tasks([moment], timeZone: "America/Los_Angeles", now: now)
    var query = TaskQuery()
    let today = query.snapshot(entries, timeZone: "America/Los_Angeles", now: now)
    #expect(today.tasks.count == 1)
    #expect(today.counts[.today] == 1)
    #expect(today.counts[.tomorrow, default: 0] == 0)
    #expect(today.tasks.first?.durationMin == 0)
    query.status = "Completed"
    #expect(query.results(entries, timeZone: "America/Los_Angeles", now: now).isEmpty)
    query.status = "Open"; query.search = "Alex"
    #expect(query.results(entries, timeZone: "America/Los_Angeles", now: now).count == 1)
    #expect(Set(entries.map(\.id)).count == entries.count)
}
