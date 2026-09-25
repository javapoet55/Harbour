import Foundation
import Testing
@testable import NexdoCore

private func facts(_ calories: Double? = 150, fat: Double? = 8, protein: Double? = 8, amount: Double = 240, unit: String = "ml") -> ShoppingProductFacts {
    .init(source: "Test fixture only", nutrition: .init(servingSize: "Test serving", servingAmount: amount, servingUnit: unit, calories: calories, protein: protein, totalFat: fat, saturatedFat: 5, sugar: 12))
}
private func alternative(_ metadata: ShoppingProductFacts? = nil) -> ShoppingAlternative {
    var value = ShoppingAlternative(name: "2% Milk", category: "Dairy & Eggs", quantity: "1", size: "1 gallon", reason: "Suggestion", detail: "Compare labels")
    value.facts = metadata; return value
}
@Test func shoppingNutritionComparesLowerHigherSameAndUnknown() {
    let comparison = ShoppingComparison(original: facts(), alternative: facts(120, fat: 5, protein: 9))
    #expect(comparison.difference(.calories) == .lower(30))
    #expect(comparison.difference(.totalFat) == .lower(3))
    #expect(comparison.difference(.protein) == .higher(1))
    #expect(comparison.difference(.sugar) == .same)
    #expect(comparison.difference(.calcium) == .unknown)
    #expect(ShoppingComparison(original: nil, alternative: facts()).difference(.totalFat) == .unknown)
}
@Test func shoppingNutritionNormalizesOnlyCompatibleServings() {
    #expect(ShoppingComparison(original: facts(), alternative: facts(75, fat: 4, protein: 4, amount: 120)).difference(.totalFat) == .same)
    #expect(ShoppingComparison(original: facts(), alternative: facts(unit: "g")).difference(.totalFat) == .unknown)
    #expect(ShoppingComparison(original: facts(), alternative: facts(amount: 0)).difference(.totalFat) == .unknown)
    var unknown = facts(); unknown.source = ""
    #expect(ShoppingComparison(original: facts(), alternative: unknown).difference(.calories) == .unknown)
    #expect(ShoppingNutrient.totalFat.value(facts(fat: -1).nutrition) == nil)
}
@Test func shoppingGoalsRequireFactsAndPreserveUnverifiedAlternatives() {
    var metadata = facts(120, fat: 5, protein: 9)
    metadata.nutrition?.sugar = 10; metadata.dietary = ["Lactose-free", "Plant-based"]
    let known = alternative(metadata), unknown = alternative()
    for goal in [ShoppingGoal.lowerFat, .lowerSugar, .lowerCalorie, .higherProtein, .lactoseFree, .plantBased] {
        #expect(goal.supported(by: known, original: facts()))
        #expect(!goal.supported(by: unknown, original: facts()))
        #expect(goal.ranked([unknown,known], original: facts()).first?.facts != nil)
    }
}
@Test func shoppingPricesNeedSourceCurrencyAndMatchingPackage() {
    var original = facts(); original.price = 5; original.currency = "USD"; original.pricePackage = "1 gallon"
    var cheaper = facts(); cheaper.price = 4; cheaper.currency = "USD"; cheaper.pricePackage = "1 gallon"
    #expect(ShoppingGoal.lowerPrice.supported(by: alternative(cheaper), original: original))
    cheaper.pricePackage = "1 quart"
    #expect(!ShoppingGoal.lowerPrice.supported(by: alternative(cheaper), original: original))
    cheaper.currency = nil; #expect(cheaper.priceLabel == nil)
}
@Test func shoppingAllergensNeverInferAbsenceOrFreeFrom() {
    let data = ShoppingProductFacts(source: "Label fixture", contains: ["Milk"])
    #expect(data.allergenLabels == ["Contains Milk"])
    #expect(!data.allergenLabels.contains("Nuts-free"))
    #expect(ShoppingProductFacts(source: "Label fixture").allergenLabels.isEmpty)
    #expect(ShoppingProductFacts(source: "", freeFrom: ["Nuts"]).allergenLabels.isEmpty)
    #expect(ShoppingProductFacts(source: "Label fixture", freeFrom: ["Gluten"]).allergenLabels == ["Gluten-free"])
}
@Test func shoppingSwapsPreserveMetadataAndPreventDuplicateAdds() throws {
    var item = GroceryItem(name: "Whole Milk", category: "Dairy & Eggs", quantity: "2", size: "1 gallon", notes: "For Saturday")
    item.checked = true; item.favorite = true
    let list = GroceryList(id: "list", title: "Store list", date: "2026-09-25", timeZone: "UTC", weekly: true, revision: 4, items: [item])
    let replaced = try #require(ShoppingSwap.replacing(item, with: alternative(), in: list))
    #expect(replaced.items.count == 1)
    #expect(replaced.items[0].name == "2% Milk")
    #expect(replaced.items[0].id == item.id)
    #expect(replaced.items[0].quantity == "2")
    #expect(replaced.items[0].size == item.size)
    #expect(replaced.items[0].notes == item.notes)
    #expect(replaced.items[0].checked && replaced.items[0].favorite == true)
    #expect(replaced.weekly && replaced.id == list.id && replaced.revision == 4)
    #expect(try JSONDecoder().decode(GroceryList.self, from: JSONEncoder().encode(replaced)) == replaced)
    let added = try #require(ShoppingSwap.adding(alternative(), to: list))
    #expect(added.items[0] == item && added.items.count == 2)
    #expect(added.items[1].id != item.id)
    #expect(ShoppingSwap.adding(alternative(), to: added) == nil)
}
@Test func shoppingLegacyResponsesAndMissingMetadataRemainUsable() throws {
    let value = alternative()
    let decoded = try JSONDecoder().decode(ShoppingAlternative.self, from: JSONEncoder().encode(value))
    #expect(decoded.facts == nil && decoded.groceryItem.imageData == nil)
    #expect(decoded.explanation(comparedTo: nil).contains("Compare"))
    var other = decoded; other.name = "Bread"
    #expect(other.usages.isEmpty)
    #expect(other.facts?.priceLabel == nil)
}
@Test func shoppingFavoritesRoundTrip() throws {
    var item = GroceryItem(name: "Milk"); item.favorite = true; item.favoriteAlternatives = [alternative().id]
    let saved = try JSONDecoder().decode(GroceryItem.self, from: JSONEncoder().encode(item))
    #expect(saved.favorite == true && saved.favoriteAlternatives == item.favoriteAlternatives)
}
@Test func shoppingProductionFactsPreserveSourceAndTraceWarnings() throws {
    let json = """
    {"source":"OPEN_FOOD_FACTS","name":"Example Milk","matchQuality":"exact_barcode","barcode":"0123456789012","brand":"Example","ingredientText":"Milk, vitamin D","contains":["Milk"],"mayContain":["Peanuts"],"allergenStatus":"declared","freshness":"stale","nutrition":{"servingSize":"100 g","servingAmount":100,"servingUnit":"g","totalFat":3.25}}
    """
    let metadata = try JSONDecoder().decode(ShoppingProductFacts.self, from: Data(json.utf8))
    #expect(metadata.matchLabel == "Exact barcode match")
    #expect(metadata.mayContain == ["Peanuts"])
    #expect(metadata.allergenLabels == ["Contains Milk"])
    #expect(metadata.ingredientText == "Milk, vitamin D")
    var choice = alternative(metadata)
    choice.whyThisSwap = "A source-grounded explanation."
    #expect(choice.groceryItem.barcode == metadata.barcode)
    let original = GroceryItem(name: "Milk")
    let list = GroceryList(id: "test", title: "List", date: "2026-09-25", timeZone: "UTC", weekly: false, revision: 0, items: [original])
    let swapped = try #require(ShoppingSwap.replacing(original, with: choice, in: list))
    #expect(swapped.items[0].brand == "Example")
    #expect(swapped.items[0].barcode == metadata.barcode)
}
