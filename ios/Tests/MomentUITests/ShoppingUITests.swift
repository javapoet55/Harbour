import XCTest

@MainActor final class ShoppingUITests:XCTestCase {
    var app:XCUIApplication!
    override func setUp(){super.setUp();continueAfterFailure=false;app=XCUIApplication();app.launchArguments=["-shopping-design-preview"];app.launch();XCTAssertTrue(app.navigationBars["My Lists"].waitForExistence(timeout:15))}
    func openList(){app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "Weekly Shopping List")).firstMatch.tap();XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout:5))}
    func testTypedAddDoesNotOpenVoice() {
        openList()
        let field=app.textFields["Add an item"]
        field.tap();field.typeText("Tomatoes")
        app.buttons["Add typed items"].tap()
        XCTAssertTrue(app.navigationBars["Review Items"].waitForExistence(timeout:5))
        XCTAssertFalse(app.navigationBars["Add by Voice"].exists)
        XCTAssertFalse(app.textViews["Shopping transcript"].exists)
        app.buttons["Cancel"].tap()
        app.buttons["Add groceries by voice"].tap()
        XCTAssertTrue(app.navigationBars["Add by Voice"].waitForExistence(timeout:5))
    }
    func testCheckOffAndEditQuantity(){
        openList()
        app.buttons["Check Bananas"].tap()
        XCTAssertTrue(app.buttons["Uncheck Bananas"].waitForExistence(timeout:5))
        let edit=app.buttons["Edit Milk"]
        XCTAssertTrue(NSPredicate(format:"enabled == true").evaluate(with:edit) || XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"enabled == true"),object:edit)],timeout:5) == .completed)
        edit.tap()
        XCTAssertTrue(app.navigationBars["Item"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["Choose from Photos"].exists)
        XCTAssertTrue(app.buttons["Take a Picture"].exists)
        XCTAssertTrue(app.buttons["Generate with AI"].exists)
        let quantity=app.textFields["1"];quantity.tap();quantity.press(forDuration:1.2)
        if app.menuItems["Select All"].exists{app.menuItems["Select All"].tap()}
        else if app.buttons["Select All"].exists{app.buttons["Select All"].tap()}
        quantity.typeText("2")
        XCTAssertEqual(quantity.value as? String,"2")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout:5))
        let screenshot=XCTAttachment(screenshot:app.screenshot());screenshot.name="Shopping list in NexDo";screenshot.lifetime = .keepAlways;add(screenshot)
    }
    func testCreateFromScratch() {
        let home = XCTAttachment(screenshot: app.screenshot()); home.name = "My Lists"; home.lifetime = .keepAlways; add(home)
        app.buttons["shopping-create-list"].tap()
        XCTAssertTrue(app.navigationBars["New List"].waitForExistence(timeout: 5))
        let newList = XCTAttachment(screenshot: app.screenshot()); newList.name = "New List"; newList.lifetime = .keepAlways; add(newList)
        app.buttons["Create List"].tap()
        XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Check Bananas"].exists)
        XCTAssertTrue(app.buttons["Add groceries by voice"].exists)
    }
    func testCopyFromDetailOpensNewUncheckedList() {
        openList()
        app.buttons["Check Bananas"].tap()
        XCTAssertTrue(app.buttons["Uncheck Bananas"].waitForExistence(timeout: 5))
        app.buttons["List options"].tap()
        app.buttons["Copy list"].tap()
        XCTAssertTrue(app.navigationBars["New List"].waitForExistence(timeout: 5))
        app.buttons["Create List"].tap()
        XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Check Bananas"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Uncheck Bananas"].exists)
    }
    func testCreateFromLastList(){
        app.buttons["Create shopping list"].tap()
        XCTAssertTrue(app.navigationBars["New List"].waitForExistence(timeout:5))
        app.buttons["shopping-use-last"].tap()
        app.buttons["Create List"].tap()
        XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["Check Bananas"].exists)
    }
    func testVoiceDefaultsOnAndRemembersOff() {
        openList(); app.buttons["Add groceries by voice"].tap()
        let toggle = app.switches["Allow live voice transcription"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        XCTAssertEqual(toggle.value as? String, "1")
        XCTAssertTrue(app.buttons["Start listening"].isEnabled)
        toggle.tap()
        XCTAssertFalse(app.buttons["Start listening"].isEnabled)
        app.buttons["Close"].tap()
        app.buttons["Add groceries by voice"].tap()
        XCTAssertEqual(toggle.value as? String, "0")
        toggle.tap()
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
