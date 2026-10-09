import Foundation
import Testing
@testable import NexdoCore

@Test func storeHoursHighlightUsesStoreDayAcrossMidnight() {
    let instant = ServerDate.parse("2026-10-10T01:00:00Z")!
    #expect(ShoppingStoreHoursDay.isToday("Friday: 10:00 AM–8:30 PM", at: instant, utcOffsetMinutes: -420))
    #expect(!ShoppingStoreHoursDay.isToday("Saturday: 9:30 AM–7:00 PM", at: instant, utcOffsetMinutes: -420))
    #expect(ShoppingStoreHoursDay.isToday("Saturday: Closed", at: instant, utcOffsetMinutes: 330))
    #expect(!ShoppingStoreHoursDay.isToday("Open 24 hours", at: instant, utcOffsetMinutes: 330))
    #expect(ShoppingStoreHoursDay.isToday("Saturday: Closed", at: instant.addingTimeInterval(86400), utcOffsetMinutes: -420))
}
