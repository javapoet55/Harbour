import Testing
@testable import NexdoCore

@Test func foodAlternativesExcludeNonFoodEvenWithIncorrectFoodCategories() {
    for name in ["Mouse", "Apple keyboard", "USB cable", "Car", "Engine oil", "Brake pads", "Mechanical bearings", "Computer accessories", "Apple Watch", "Water pump"] {
        #expect(!GroceryItem(name: name, category: "Other").supportsFoodAlternatives)
        #expect(!GroceryItem(name: name, category: "Produce").supportsFoodAlternatives)
    }
    #expect(!GroceryItem(name: "Dish soap", category: "Household").supportsFoodAlternatives)
    #expect(!GroceryItem(name: "Unknown item").supportsFoodAlternatives)
}

@Test func foodAlternativesIncludeCategorizedAndManuallyEnteredGroceries() {
    for name in ["Mango", "Potato", "Roma tomatoes", "Onion 2 kgs", "Snacks", "Tofu", "Avocado oil", "Apple juice"] {
        #expect(GroceryItem(name: name).supportsFoodAlternatives)
    }
    #expect(GroceryItem(name: "Dragon fruit", category: "Produce").supportsFoodAlternatives)
    #expect(GroceryItem(name: "Sourdough", category: "Bakery").supportsFoodAlternatives)
}
