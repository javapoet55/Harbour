import Foundation

/// Facts supplied by a structured product source, never by the recommendation LLM.
public struct ShoppingProductFacts: Codable, Equatable, Sendable {
    public var source: String
    public var sourceURL: String?
    public var lastUpdated: String?
    public var name: String?
    public var brand: String?
    public var barcode: String?
    public var imageURL: String?
    public var matchQuality: String?
    public var retrievedAt: String?
    public var expiresAt: String?
    public var freshness: String?
    public var ingredientText: String?
    public var mayContain: [String]?
    public var allergenStatus: String?
    public var nutrition: ShoppingNutrition?
    public var contains: [String]?
    public var freeFrom: [String]?
    public var dietary: [String]?
    public var bestFor: [String]?
    public var price: Double?
    public var currency: String?
    public var pricePackage: String?
    public init(source: String, nutrition: ShoppingNutrition? = nil, contains: [String]? = nil, freeFrom: [String]? = nil, dietary: [String]? = nil, bestFor: [String]? = nil) {
        self.source = source; self.nutrition = nutrition; self.contains = contains; self.freeFrom = freeFrom; self.dietary = dietary; self.bestFor = bestFor
    }
    public var hasSource: Bool { !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    public var matchLabel: String? {
        switch matchQuality {
        case "representative_generic": "Representative food — not an exact product"
        case "exact_barcode": "Exact barcode match"
        case "branded_match": "Branded product match"
        default: nil
        }
    }
    public var allergenLabels: [String] {
        guard hasSource else { return [] }
        return (contains ?? []).map { "Contains \($0)" } + (freeFrom ?? []).map { "\($0)-free" }
    }
    public var priceLabel: String? {
        guard hasSource, let price, price.isFinite, price >= 0, let currency, currency.count == 3 else { return nil }
        return "Approx. " + price.formatted(.currency(code: currency))
    }
}
public struct ShoppingNutrition: Codable, Equatable, Sendable {
    public var servingSize: String
    public var servingAmount: Double?
    /// g or ml. Values use kcal, g for macros, and mg for sodium/calcium.
    public var servingUnit: String?
    public var calories: Double?, protein: Double?, totalFat: Double?, saturatedFat: Double?
    public var carbohydrates: Double?, sugar: Double?, sodium: Double?, calcium: Double?, fiber: Double?
    public init(servingSize: String, servingAmount: Double?, servingUnit: String?, calories: Double? = nil, protein: Double? = nil, totalFat: Double? = nil, saturatedFat: Double? = nil, carbohydrates: Double? = nil, sugar: Double? = nil, sodium: Double? = nil, calcium: Double? = nil, fiber: Double? = nil) {
        self.servingSize = servingSize; self.servingAmount = servingAmount; self.servingUnit = servingUnit
        self.calories = calories; self.protein = protein; self.totalFat = totalFat; self.saturatedFat = saturatedFat
        self.carbohydrates = carbohydrates; self.sugar = sugar; self.sodium = sodium; self.calcium = calcium; self.fiber = fiber
    }
}
public enum ShoppingNutrient: String, CaseIterable, Identifiable, Sendable {
    case calories = "Calories", protein = "Protein", totalFat = "Total Fat", saturatedFat = "Saturated Fat", carbohydrates = "Carbohydrates", sugar = "Sugar", sodium = "Sodium", calcium = "Calcium", fiber = "Fiber"
    public var id: String { rawValue }
    public var unit: String { self == .calories ? "" : (self == .sodium || self == .calcium ? "mg" : "g") }
    public func value(_ facts: ShoppingNutrition?) -> Double? {
        let value: Double?
        switch self {
        case .calories: value = facts?.calories; case .protein: value = facts?.protein
        case .totalFat: value = facts?.totalFat; case .saturatedFat: value = facts?.saturatedFat
        case .carbohydrates: value = facts?.carbohydrates; case .sugar: value = facts?.sugar
        case .sodium: value = facts?.sodium; case .calcium: value = facts?.calcium; case .fiber: value = facts?.fiber
        }
        return value.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
    }
}
public enum ShoppingDifference: Equatable, Sendable { case lower(Double), same, higher(Double), unknown }
public struct ShoppingComparison: Sendable {
    public let original: ShoppingNutrition?
    public let alternative: ShoppingNutrition?
    public init(original: ShoppingProductFacts?, alternative: ShoppingProductFacts?) {
        self.original = original?.hasSource == true ? original?.nutrition : nil
        self.alternative = alternative?.hasSource == true ? alternative?.nutrition : nil
    }
    public var factor: Double? {
        guard let original, let alternative, let a = original.servingAmount, let b = alternative.servingAmount,
              a.isFinite, b.isFinite, a > 0, b > 0, let unit = original.servingUnit,
              ["g", "ml"].contains(unit), unit == alternative.servingUnit else { return nil }
        let ratio = a / b
        return ratio.isFinite ? ratio : nil
    }
    public func alternativeValue(_ nutrient: ShoppingNutrient) -> Double? {
        guard let factor, let value = nutrient.value(alternative) else { return nil }
        let normalized = value * factor
        return normalized.isFinite ? normalized : nil
    }
    public func difference(_ nutrient: ShoppingNutrient) -> ShoppingDifference {
        guard let a = nutrient.value(original), let b = alternativeValue(nutrient) else { return .unknown }
        let delta = b - a
        if abs(delta) < 0.0001 { return .same }
        return delta < 0 ? .lower(-delta) : .higher(delta)
    }
}
public enum ShoppingGoal: String, CaseIterable, Identifiable, Sendable {
    case lowerFat = "Lower fat", lowerSugar = "Lower sugar", lowerCalorie = "Lower calorie", higherProtein = "Higher protein", lactoseFree = "Lactose-free", plantBased = "Plant-based", lowerPrice = "Lower price", glutenFree = "Gluten-free", highFiber = "High fiber", lowSodium = "Low sodium", noArtificial = "No artificial ingredients"
    public var id: String { rawValue }
    public func supported(by item: ShoppingAlternative, original: ShoppingProductFacts?) -> Bool {
        let comparison = ShoppingComparison(original: original, alternative: item.facts)
        switch self {
        case .lowerFat: if case .lower = comparison.difference(.totalFat) { return true }
        case .lowerSugar: if case .lower = comparison.difference(.sugar) { return true }
        case .lowerCalorie: if case .lower = comparison.difference(.calories) { return true }
        case .higherProtein: if case .higher = comparison.difference(.protein) { return true }
        case .lactoseFree: return item.facts?.hasSource == true && (item.facts?.dietary ?? []).contains("Lactose-free")
        case .plantBased: return item.facts?.hasSource == true && (item.facts?.dietary ?? []).contains("Plant-based")
        case .glutenFree: return item.facts?.hasSource == true && (item.facts?.dietary ?? []).contains("Gluten-free")
        case .highFiber: if case .higher = comparison.difference(.fiber) { return true }
        case .lowSodium: if case .lower = comparison.difference(.sodium) { return true }
        case .noArtificial: return item.facts?.hasSource == true && (item.facts?.dietary ?? []).contains("No artificial ingredients")
        case .lowerPrice:
            if let a = original, let b = item.facts, a.hasSource, b.hasSource, a.priceLabel != nil, b.priceLabel != nil,
               a.currency == b.currency, let pack = a.pricePackage, !pack.isEmpty, pack == b.pricePackage,
               let originalPrice = a.price, let price = b.price { return price < originalPrice }
        }
        return false
    }
    public func ranked(_ items: [ShoppingAlternative], original: ShoppingProductFacts?) -> [ShoppingAlternative] {
        items.filter { supported(by: $0, original: original) } + items.filter { !supported(by: $0, original: original) }
    }
}
public extension ShoppingAlternative {
    func explanation(comparedTo original: ShoppingProductFacts?) -> String {
        let matches = ShoppingGoal.allCases.filter { $0.supported(by: self, original: original) }.map(\.rawValue)
        return matches.isEmpty ? "A suggested swap for your list. Compare the package label, ingredients, size and price before choosing." : "Available product data supports: " + matches.joined(separator: ", ").lowercased() + ". Compare taste and suitability for your intended use."
    }
    var usages: [String] {
        if facts?.hasSource == true, let values = facts?.bestFor { return values }
        // General culinary uses only; never infers allergens, nutritional values or dietary safety.
        if name.lowercased().contains("milk") { return ["Cereal", "Coffee", "Cooking", "Smoothies"] }
        return []
    }
}
public enum ShoppingSwap {
    public static func replacing(_ original: GroceryItem, with alternative: ShoppingAlternative, in list: GroceryList) -> GroceryList? {
        guard let index = list.items.firstIndex(where: { $0.id == original.id }) else { return nil }
        var next = list
        var replacement = list.items[index]
        replacement.name = alternative.name; replacement.category = alternative.category
        replacement.barcode = alternative.facts?.barcode; replacement.brand = alternative.facts?.brand
        replacement.imageData = nil // The original item's photo must not misrepresent the replacement.
        next.items[index] = replacement
        return next
    }
    public static func adding(_ alternative: ShoppingAlternative, to list: GroceryList) -> GroceryList? {
        let name = alternative.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !list.items.contains(where: { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(name) == .orderedSame && $0.size.caseInsensitiveCompare(alternative.size) == .orderedSame }) else { return nil }
        var next = list; next.items.append(alternative.groceryItem); return next
    }
}

public enum ShoppingNutritionSortColumn: String, Sendable {
    case original = "Your item", alternative = "Alternative", difference = "Difference"
}
public extension ShoppingComparison {
    func sortedNutrients(by column: ShoppingNutritionSortColumn?, ascending: Bool) -> [ShoppingNutrient] {
        let rows = ShoppingNutrient.allCases.filter { $0.value(original) != nil || $0.value(alternative) != nil }
        guard let column else { return rows }
        func number(_ nutrient: ShoppingNutrient) -> Double? {
            switch column {
            case .original: return nutrient.value(original)?.rounded()
            case .alternative: return alternativeValue(nutrient)?.rounded()
            case .difference:
                guard let a = nutrient.value(original), let b = alternativeValue(nutrient) else { return nil }
                return (b - a).rounded()
            }
        }
        return rows.enumerated().sorted { left, right in
            let a = number(left.element), b = number(right.element)
            if a == b { return left.offset < right.offset }
            guard let a else { return false }
            guard let b else { return true }
            return ascending ? a < b : a > b
        }.map(\.element)
    }
}
