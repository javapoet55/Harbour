import Foundation
import Testing
@testable import NexdoCore

@Test func foodVoiceContextContainsOnlyBoundedProductQueries() throws {
    let context = FoodVoiceContext(original: .init(name: String(repeating: "a", count: 250), barcode: "not-a-barcode"), alternative: .init(name: "Milk", brand: "Example", barcode: "12345678"))
    let data = try JSONEncoder().encode(context)
    let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    #expect(Set(object.keys) == ["original", "alternative"])
    #expect(context.original.name.count == 200)
    #expect(context.original.barcode == nil)
    #expect(try JSONDecoder().decode(FoodVoiceContext.self, from: data) == context)
}
@Test func foodVoiceToolResultPreservesSourceAndUnknownAllergens() throws {
    let data = Data(#"{"success":true,"facts":{"source":"USDA","matchQuality":"representative_generic","nutrition":{"servingSize":"100 g","servingAmount":100,"servingUnit":"g","calories":60}},"error":null}"#.utf8)
    let result = try JSONDecoder().decode(FoodVoiceLookupResponse.self, from: data)
    let roundTrip = try JSONDecoder().decode(FoodVoiceLookupResponse.self, from: JSONEncoder().encode(result))
    #expect(roundTrip.facts?.source == "USDA")
    #expect(roundTrip.facts?.nutrition?.calories == 60)
    #expect(roundTrip.facts?.contains == nil)
}
