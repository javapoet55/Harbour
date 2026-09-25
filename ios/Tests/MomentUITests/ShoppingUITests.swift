import XCTest

@MainActor final class ShoppingUITests:XCTestCase {
    var app:XCUIApplication!
    override func setUp(){super.setUp();continueAfterFailure=false;app=XCUIApplication();app.launchArguments=["-shopping-design-preview"];app.launch();XCTAssertTrue(app.navigationBars["My Lists"].waitForExistence(timeout:15))}
    func openList(){app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "Weekly Shopping List")).firstMatch.tap();XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout:5))}
    func testAlternativesKeepAndReplaceOnlyOriginal() {
        openList()
        app.buttons["Show alternatives for Milk"].tap()
        XCTAssertTrue(app.staticTexts["Original Item"].waitForExistence(timeout: 8))
        app.buttons["Close alternatives"].tap()
        XCTAssertTrue(app.buttons["Edit Milk"].waitForExistence(timeout: 5))
        app.buttons["Show alternatives for Milk"].tap()
        let choice = app.buttons["alternatives.select.2% Milk"]
        XCTAssertTrue(choice.waitForExistence(timeout: 8))
        for _ in 0..<5 { if choice.isHittable { break }; app.swipeUp() }
        choice.tap()
        let replace = app.buttons["alternatives.confirm"]
        XCTAssertTrue(replace.waitForExistence(timeout: 8))
        replace.tap()
        XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Edit Milk"].exists)
        XCTAssertTrue(app.buttons["Edit Bananas"].exists)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "Replacement preserves other items"; shot.lifetime = .keepAlways; add(shot)
    }
    func testAlternativeDetailsAndPersistedReplacement() {
        openList()
        app.buttons["Show alternatives for Milk"].tap()
        let goal = app.buttons["alternatives.goal.Lower fat"]
        XCTAssertTrue(goal.waitForExistence(timeout: 8)); goal.tap()
        let nutrition = app.buttons["alternatives.Nutrition.2% Milk"]
        for _ in 0..<5 { if nutrition.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(nutrition.isHittable); nutrition.tap()
        XCTAssertTrue(app.staticTexts["Nutrition Comparison"].waitForExistence(timeout: 5))
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "Alternative nutrition comparison"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.buttons["alternative.tab.Allergens"].tap()
        XCTAssertTrue(app.staticTexts["Contains Milk"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["No Nuts"].exists)
        app.buttons["alternative.tab.Why this?"].tap()
        XCTAssertTrue(app.staticTexts["Why NexDo suggested this"].waitForExistence(timeout: 5))
        let best = app.buttons["alternative.tab.Best For"]
        if !best.isHittable { app.scrollViews.firstMatch.swipeLeft() }
        best.tap()
        XCTAssertTrue(app.staticTexts["Cereal"].waitForExistence(timeout: 5))
        app.buttons["alternative.detail.replace"].tap()
        XCTAssertTrue(app.buttons["Edit 2% Milk"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["Edit Milk"].exists)
    }
    func testAlternativeFavoriteSurvivesReopening() {
        openList(); app.buttons["Show alternatives for Milk"].tap()
        let favorite = app.buttons["alternatives.favorite.original"]
        XCTAssertTrue(favorite.waitForExistence(timeout: 8)); favorite.tap()
        let saved = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Remove favorite"), object: favorite)
        XCTAssertEqual(XCTWaiter.wait(for: [saved], timeout: 8), .completed)
        app.buttons["Close alternatives"].tap()
        app.buttons["Show alternatives for Milk"].tap()
        XCTAssertTrue(favorite.waitForExistence(timeout: 8))
        XCTAssertEqual(favorite.label, "Remove favorite")
    }
    func testAlternativeAddInsteadKeepsOriginal() {
        openList(); app.buttons["Show alternatives for Milk"].tap()
        let choice = app.buttons["alternatives.select.2% Milk"]
        XCTAssertTrue(choice.waitForExistence(timeout: 8))
        for _ in 0..<5 { if choice.isHittable { break }; app.swipeUp() }
        choice.tap(); app.buttons["alternatives.add"].tap()
        XCTAssertTrue(app.buttons["Edit Milk"].waitForExistence(timeout: 8))
        for _ in 0..<5 { if app.buttons["Edit 2% Milk"].exists { break }; app.swipeUp() }
        XCTAssertTrue(app.buttons["Edit 2% Milk"].exists)
    }
    func testShareLinkCreateRevokeAndDismiss() {
        openList()
        app.buttons["Share list"].tap()
        XCTAssertTrue(app.navigationBars["Share List"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Share list as text"].exists)
        app.buttons["Create Share Link"].tap()
        XCTAssertTrue(app.buttons["Revoke Link"].waitForExistence(timeout: 5))
        app.buttons["Revoke Link"].tap()
        XCTAssertTrue(app.buttons["Create Share Link"].waitForExistence(timeout: 5))
        app.swipeDown()
        XCTAssertTrue(app.buttons["Edit Milk"].waitForExistence(timeout: 5))
    }
    func testTypedAddDoesNotOpenVoice() {
        openList()
        let field=app.textFields["shopping-quick-add"]
        field.tap();field.typeText("Tomatoes")
        app.buttons["Add typed items"].tap()
        XCTAssertTrue(app.buttons["Check Apples"].waitForExistence(timeout:5))
        XCTAssertFalse(app.navigationBars["Add by Voice"].exists)
        XCTAssertFalse(app.textViews["Shopping transcript"].exists)
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
        XCTAssertTrue(app.navigationBars["Edit Item"].waitForExistence(timeout:5))
        app.buttons["Item Image"].tap()
        XCTAssertTrue(app.buttons["Choose from Photos"].exists)
        XCTAssertTrue(app.buttons["Take a Picture"].exists)
        app.buttons["Item Image"].tap()
        let quantity=app.textFields["1"]
        quantity.tap();quantity.press(forDuration:1.2)
        if app.menuItems["Select All"].exists { app.menuItems["Select All"].tap() }
        else if app.buttons["Select All"].exists { app.buttons["Select All"].tap() }
        else { quantity.doubleTap() }
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
    func testVoiceAddsEditableTranscriptWithoutOpeningMicrophone(){
        openList();app.buttons["Add groceries by voice"].tap()
        XCTAssertTrue(app.navigationBars["Add by Voice"].waitForExistence(timeout:5))
        let transcript=app.textViews["Shopping transcript"];transcript.tap();transcript.typeText("three apples")
        app.swipeUp()
        app.buttons["Add to List"].tap()
        XCTAssertTrue(app.navigationBars["Shopping List"].waitForExistence(timeout:5))
        app.swipeUp()
        XCTAssertTrue(app.buttons["Check Apples"].waitForExistence(timeout:5))
    }
}

@MainActor final class AskLandingUITests: XCTestCase {
    func testDashboardCardsAndInlineComposer() {
        let app = XCUIApplication()
        app.launchArguments = ["-ask-design-preview"]
        app.launch()
        XCTAssertTrue(app.buttons["ask-card-0"].waitForExistence(timeout: 15))
        for index in 0..<8 { XCTAssertTrue(app.buttons["ask-card-\(index)"].exists) }
        app.swipeUp()
        let field = app.textFields["Type your request"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Send request"].isEnabled)
        field.tap()
        field.typeText("Plan tomorrow")
        let done = app.buttons["ask-keyboard-done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        done.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertEqual(field.value as? String, "Plan tomorrow")
        XCTAssertFalse(app.staticTexts["Before using Ask AI"].exists)
        XCTAssertTrue(app.buttons["Send request"].isEnabled)
        app.buttons["Send request"].tap()
        XCTAssertTrue(app.staticTexts["Before using Ask AI"].waitForExistence(timeout: 5))
    }
}
