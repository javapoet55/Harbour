import XCTest

@MainActor final class ShoppingUITests:XCTestCase {
    var app:XCUIApplication!
    override func setUp(){super.setUp();continueAfterFailure=false;app=XCUIApplication();app.launchArguments=["-shopping-design-preview"];app.launch();XCTAssertTrue(app.navigationBars["My Lists"].waitForExistence(timeout:15))}
    func openList(){app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "Weekly Shopping List")).firstMatch.tap();XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout:5))}
    func testCheckOffAndEditQuantity(){
        openList()
        app.buttons["Check Bananas"].tap()
        XCTAssertTrue(app.buttons["Uncheck Bananas"].waitForExistence(timeout:5))
        let edit=app.buttons["Edit Milk"]
        XCTAssertTrue(NSPredicate(format:"enabled == true").evaluate(with:edit) || XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"enabled == true"),object:edit)],timeout:5) == .completed)
        edit.tap()
        XCTAssertTrue(app.navigationBars["Item"].waitForExistence(timeout:5))
        let quantity=app.textFields["1"];quantity.tap();quantity.press(forDuration:1.2)
        if app.menuItems["Select All"].exists{app.menuItems["Select All"].tap()}
        else if app.buttons["Select All"].exists{app.buttons["Select All"].tap()}
        quantity.typeText("2")
        XCTAssertEqual(quantity.value as? String,"2")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout:5))
        let screenshot=XCTAttachment(screenshot:app.screenshot());screenshot.name="Shopping list in NexDo";screenshot.lifetime = .keepAlways;add(screenshot)
    }
    func testCreateFromLastList(){
        app.buttons["Create shopping list"].tap()
        XCTAssertTrue(app.navigationBars["New List"].waitForExistence(timeout:5))
        app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "Use Last List")).firstMatch.tap()
        app.buttons["Create List"].tap()
        XCTAssertTrue(app.navigationBars["My Lists"].waitForExistence(timeout:5))
        XCTAssertGreaterThanOrEqual(app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "Weekly Shopping List")).count,2)
    }
    func testVoiceReviewUsesEditableTranscriptWithoutOpeningMicrophone(){
        openList();app.buttons["Add groceries by voice"].tap()
        XCTAssertTrue(app.navigationBars["Add by Voice"].waitForExistence(timeout:5))
        let transcript=app.textViews["Shopping transcript"];transcript.tap();transcript.typeText("three apples")
        app.swipeUp()
        app.buttons["Review Items"].tap()
        XCTAssertTrue(app.buttons["Add 1 Items"].waitForExistence(timeout:8))
        app.buttons["Add 1 Items"].tap()
        XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout:5))
        app.swipeUp()
        XCTAssertTrue(app.buttons["Check Apples"].waitForExistence(timeout:5))
    }
}
