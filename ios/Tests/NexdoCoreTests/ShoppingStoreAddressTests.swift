import XCTest
@testable import NexdoCore
final class ShoppingStoreAddressTests: XCTestCase {
    func testUSAddressLines() {
        let value = ShoppingStoreAddress(address: "3150 Fostoria Way #21b, Danville, CA 94526, USA", zip: "94526")
        XCTAssertEqual(value.street, "3150 Fostoria Way #21b")
        XCTAssertEqual(value.locality, "Danville, CA 94526")
        XCTAssertEqual(value.zip, "94526")
    }
    func testKeepsSuiteAndLegacyCity() {
        let value = ShoppingStoreAddress(address: "123 Main St, Suite 4, San Ramon, CA 94582, USA", zip: "94582")
        XCTAssertEqual(value.street, "123 Main St, Suite 4")
        XCTAssertEqual(ShoppingStoreAddress(address: "Danville, CA", zip: "94526").locality, "Danville, CA 94526")
    }
    func testPartialManualAddressSurvivesReopening() {
        let value = ShoppingStoreAddress(address: "123 Main St, 94582", zip: "94582")
        XCTAssertEqual(value.street, "123 Main St")
        XCTAssertEqual(value.locality, "94582")
    }
    func testMapDestinationIncludesBranchAndEscapesNames() {
        let url = ShoppingStoreAddress.mapsURL(name: "A & B", address: "1 Main St", placeID: "abc", directions: true)!
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!
        XCTAssertEqual(items.first(where: {$0.name == "destination"})?.value, "A & B, 1 Main St")
        XCTAssertEqual(items.first(where: {$0.name == "destination_place_id"})?.value, "abc")
    }
}
