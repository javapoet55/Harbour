import Foundation
import Testing
@testable import NexdoCore

@Test func voiceUsageMonthKeepsTheServerCalendarMonth() {
    let locale = Locale(identifier: "en_US")
    #expect(VoiceUsage.monthName("2026-09", locale: locale) == "September")
    #expect(VoiceUsage.monthName("2027-01", locale: locale) == "January")
    #expect(VoiceUsage.monthName("2026-12", locale: locale) == "December")
    #expect(VoiceUsage.monthName("2026-09", locale: Locale(identifier: "fr_FR")) == "septembre")
}

@Test func voiceUsageMonthRejectsInvalidPeriods() {
    for value in ["", "2026-00", "2026-13", "2026-9", "2026-09-01", "invalid"] {
        #expect(VoiceUsage.monthName(value) == nil)
    }
}
