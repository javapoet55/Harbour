import Foundation
import Testing
@testable import NexdoCore

@Test func legacyZoneNamesMapToTheirCurrentNames() {
    #expect(TimeZoneNames.canonical("Asia/Calcutta") == "Asia/Kolkata")
    #expect(TimeZoneNames.canonical("Europe/Kiev") == "Europe/Kyiv")
    #expect(TimeZoneNames.canonical("Asia/Kolkata") == "Asia/Kolkata")
    #expect(TimeZoneNames.canonical("America/Los_Angeles") == "America/Los_Angeles")
    #expect(TimeZoneNames.same("Asia/Calcutta", "Asia/Kolkata"))
    #expect(!TimeZoneNames.same("Asia/Kolkata", "Asia/Dhaka"))
}

@Test func pickerListsEachZoneOnceByItsCurrentName() {
    let zones = TimeZoneNames.pickerIdentifiers()
    // The device's Asia/Kolkata has a row, so the picker is never blank for India.
    #expect(zones.contains("Asia/Kolkata"))
    #expect(!zones.contains("Asia/Calcutta"))
    #expect(zones.filter { $0 == "Asia/Kolkata" }.count == 1)
    #expect(zones == zones.sorted())
    // A list that only spells India the old way still yields one current-name row.
    #expect(TimeZoneNames.pickerIdentifiers(including: "Asia/Kolkata", known: ["Asia/Calcutta", "UTC"]) == ["Asia/Kolkata", "UTC"])
    // A stored legacy name selects the current-name row; an unknown one adds nothing.
    #expect(TimeZoneNames.pickerIdentifiers(including: "Asia/Calcutta", known: ["UTC"]) == ["Asia/Kolkata", "UTC"])
    #expect(TimeZoneNames.pickerIdentifiers(including: "Mars/Olympus", known: ["UTC"]) == ["UTC"])
}
