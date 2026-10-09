import Testing
@testable import NexdoCore

@Test func offerPriceBreakdownUsesExactDollarAmounts() {
    #expect(ShoppingOfferPricing.originalPrice(finalPrice: "$7.99", savings: "$2 off") == "$9.99")
    #expect(ShoppingOfferPricing.originalPrice(finalPrice: "$199.99", savings: "$99.99 OFF") == "$299.98")
    #expect(ShoppingOfferPricing.originalPrice(finalPrice: "$1,299.99", savings: "$100 off") == "$1,399.99")
}
@Test func offerPriceBreakdownDoesNotInventMissingOrConditionalPrices() {
    #expect(ShoppingOfferPricing.originalPrice(finalPrice: nil, savings: "$99.99 off") == nil)
    #expect(ShoppingOfferPricing.originalPrice(finalPrice: "$7.99", savings: nil) == nil)
    for savings in ["Up to $2 off", "$2 off when you buy 3", "20% OFF", "Buy one get one free"] {
        #expect(ShoppingOfferPricing.originalPrice(finalPrice: "$7.99", savings: savings) == nil)
    }
    for price in ["2 for $7.99", "$7.99/lb", "From $7.99", "$7,99"] {
        #expect(ShoppingOfferPricing.originalPrice(finalPrice: price, savings: "$2 off") == nil)
    }
}
