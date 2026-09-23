import Foundation
import Testing
@testable import NexdoCore

private let zone = TimeZone(identifier: "America/Los_Angeles")!
// Wed Sep 23 2026, 3:30 PM in Los Angeles.
private let now = ISO8601DateFormatter().date(from: "2026-09-23T22:30:00Z")!
private func text(_ iso: String?, status: String = "connected") -> String {
    CalendarSyncStatus.text(status: status, lastSyncedAt: iso.flatMap { ISO8601DateFormatter().date(from: $0) }, now: now, timeZone: zone)
}

@Test func lastSyncedJustNow() {
    #expect(text("2026-09-23T22:30:00Z") == "Last synced just now")
    #expect(text("2026-09-23T22:29:01Z") == "Last synced just now")
    // A server clock slightly ahead is still "just now".
    #expect(text("2026-09-23T22:30:20Z") == "Last synced just now")
}

@Test func lastSyncedMinutesAgo() {
    #expect(text("2026-09-23T22:29:00Z") == "Last synced 1 min ago")
    #expect(text("2026-09-23T22:25:30Z") == "Last synced 4 min ago")
    #expect(text("2026-09-23T21:30:01Z") == "Last synced 59 min ago")
}

@Test func lastSyncedToday() {
    #expect(text("2026-09-23T21:30:00Z") == "Last synced today at 2:30 PM")
    #expect(text("2026-09-23T07:05:00Z") == "Last synced today at 12:05 AM")
}

@Test func lastSyncedYesterday() {
    #expect(text("2026-09-23T06:59:00Z") == "Last synced yesterday at 11:59 PM")
    #expect(text("2026-09-22T16:07:00Z") == "Last synced yesterday at 9:07 AM")
}

@Test func lastSyncedOlder() {
    #expect(text("2026-09-22T06:59:00Z") == "Last synced Sep 21 at 11:59 PM")
    #expect(text("2026-03-05T20:00:00Z") == "Last synced Mar 5 at 12:00 PM")
    #expect(text("2025-12-31T18:45:00Z") == "Last synced Dec 31 at 10:45 AM")
}

@Test func notSyncedYetAndNeedsReconnecting() {
    #expect(text(nil) == "Not synced yet")
    #expect(text(nil, status: "error") == "Needs reconnecting")
    #expect(text("2026-09-23T22:30:00Z", status: "error") == "Needs reconnecting")
    #expect(text("2026-09-23T22:30:00Z", status: "disconnected") == "Needs reconnecting")
    #expect(text("2026-09-23T22:30:00Z", status: "Connected") == "Last synced just now")
}

@Test func connectionReadsServerTimestampsInEitherForm() {
    let fractional = CalendarConnection(id: "1", provider: "google", accountEmail: nil, calendarName: nil, status: "connected", lastSyncedAt: "2026-09-23T22:20:00.123Z")
    #expect(fractional.lastSyncedText(now: now, timeZone: zone) == "Last synced 9 min ago")
    let plain = CalendarConnection(id: "2", provider: "google", accountEmail: nil, calendarName: nil, status: "connected", lastSyncedAt: "2026-09-23T22:20:00Z")
    #expect(plain.lastSyncedText(now: now, timeZone: zone) == "Last synced 10 min ago")
    let never = CalendarConnection(id: "3", provider: "google", accountEmail: nil, calendarName: nil, status: "connected", lastSyncedAt: nil)
    #expect(never.lastSyncedText(now: now, timeZone: zone) == "Not synced yet")
    let broken = CalendarConnection(id: "4", provider: "google", accountEmail: nil, calendarName: nil, status: "error", lastSyncedAt: "2026-09-23T22:20:00Z")
    #expect(broken.lastSyncedText(now: now, timeZone: zone) == "Needs reconnecting")
}
