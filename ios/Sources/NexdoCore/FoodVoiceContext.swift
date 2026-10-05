import Foundation

/// Send only the two product queries, never shopping-list notes or account data.
public struct FoodVoiceContext: Codable, Equatable, Sendable {
    public struct Item: Codable, Equatable, Sendable {
        public let name: String
        public let brand: String?
        public let barcode: String?
        public init(name: String, brand: String? = nil, barcode: String? = nil) {
            self.name = String(name.prefix(200))
            self.brand = brand.map { String($0.prefix(200)) }
            self.barcode = barcode.flatMap { $0.range(of: #"^\d{8,14}$"#, options: .regularExpression) != nil ? $0 : nil }
        }
    }
    public let original: Item
    public let alternative: Item
    public init(original: Item, alternative: Item) { self.original = original; self.alternative = alternative }
}
public struct FoodVoiceLookupResponse: Codable, Sendable {
    public let success: Bool
    public let facts: ShoppingProductFacts?
    public let error: String?
}
