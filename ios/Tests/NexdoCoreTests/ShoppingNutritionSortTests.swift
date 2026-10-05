import Testing
@testable import NexdoCore

@Test func nutritionSortUsesNormalizedValuesAndSignedDifferences() {
    let original = ShoppingProductFacts(source: "test", nutrition: .init(servingSize: "100 g", servingAmount: 100, servingUnit: "g", calories: 100, protein: 10, sugar: 20, sodium: 30))
    let alternative = ShoppingProductFacts(source: "test", nutrition: .init(servingSize: "50 g", servingAmount: 50, servingUnit: "g", calories: 60, protein: 10, sugar: 5))
    let comparison = ShoppingComparison(original: original, alternative: alternative)
    #expect(comparison.sortedNutrients(by: .original, ascending: false) == [.calories, .sodium, .sugar, .protein])
    #expect(comparison.sortedNutrients(by: .alternative, ascending: true) == [.sugar, .protein, .calories, .sodium])
    #expect(comparison.sortedNutrients(by: .difference, ascending: true) == [.sugar, .protein, .calories, .sodium])
    #expect(comparison.sortedNutrients(by: nil, ascending: true) == [.calories, .protein, .sugar, .sodium])
}

@Test func nutritionSortKeepsUnknownValuesAndTiesInStableOrder() {
    let facts = ShoppingProductFacts(source: "test", nutrition: .init(servingSize: "1 serving", servingAmount: nil, servingUnit: nil, protein: 1, sugar: 1))
    let comparison = ShoppingComparison(original: facts, alternative: facts)
    #expect(comparison.sortedNutrients(by: .difference, ascending: false) == [.protein, .sugar])
    #expect(comparison.sortedNutrients(by: .original, ascending: true) == [.protein, .sugar])
}
