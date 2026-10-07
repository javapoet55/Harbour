import Foundation
import Testing
@testable import NexdoCore

@Test func offerLastDayIsTheStoresDayInAnyPhoneZone() {
    let us = Locale(identifier: "en_US")
    // Costco: 23:59:59 on 6 Oct in Los Angeles. Read in India it is already 7 Oct; the store's day is 6 Oct.
    #expect(ShoppingOfferDates.lastDay("2026-10-07T06:59:59.000Z", locale: us) == "Oct 6, 2026")
    #expect(ShoppingOfferDates.lastDay("2026-10-07T06:59:59Z", locale: us) == "Oct 6, 2026")
    // Flipp: an ad that ends at the next midnight in New York still ends on 6 Oct.
    #expect(ShoppingOfferDates.lastDay("2026-10-07T04:00:00Z", locale: us) == "Oct 6, 2026")
    // Hawaii, the furthest US zone behind UTC.
    #expect(ShoppingOfferDates.lastDay("2026-10-07T09:59:59Z", locale: us) == "Oct 6, 2026")
    #expect(ShoppingOfferDates.lastDay("not a date", locale: us) == "not a date")
}
