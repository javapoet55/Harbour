import XCTest

@MainActor final class WellnessMenuUITests: XCTestCase {
    func testFourModuleDestinations() {
        let app = XCUIApplication()
        app.launchArguments = ["-wellness-design-preview"]
        app.launch()
        XCTAssertTrue(app.buttons["wellness.calories"].waitForExistence(timeout: 10))
        for title in ["Today", "Tasks", "Ask AI", "Calendar"] {
            XCTAssertTrue(app.buttons[title].isHittable, "Missing navigation: \(title)")
        }
        app.buttons["wellness.calories"].tap()
        continueFromGuide(app)
        XCTAssertTrue(app.buttons["Set Up Agent"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        app.buttons["wellness.pomodoro"].tap()
        continueFromGuide(app)
        XCTAssertTrue(app.buttons["Start Focus Session"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        app.buttons["wellness.moments"].tap()
        continueFromGuide(app)
        XCTAssertTrue(app.textFields["Search moments"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()
        XCTAssertTrue(app.buttons["wellness.shopping"].waitForExistence(timeout: 5))
        let shopping = app.buttons["wellness.shopping"]
        if !shopping.isHittable { app.swipeUp() }
        shopping.tap()
        continueFromGuide(app)
        XCTAssertTrue(app.navigationBars["My Lists"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()
        XCTAssertTrue(app.buttons["wellness.calories"].waitForExistence(timeout: 5))
    }
    private func continueFromGuide(_ app:XCUIApplication) {
        XCTAssertTrue(app.navigationBars["How It Works"].waitForExistence(timeout:5))
        let button=app.buttons["module-guide-continue"]
        for _ in 0..<6 { if button.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(button.isHittable)
        button.tap()
    }
    func testShoppingGuideReturnsHomeAndIsSkippedOnNextVisit() {
        let app=XCUIApplication()
        app.launchArguments=["-wellness-design-preview"]
        app.launch()
        app.buttons["wellness.shopping"].tap()
        XCTAssertTrue(app.navigationBars["How It Works"].waitForExistence(timeout:5))
        let home=app.buttons["module-guide-home"]
        for _ in 0..<6 { if home.isHittable { break }; app.swipeUp() }
        home.tap()
        XCTAssertTrue(app.buttons["wellness.shopping"].waitForExistence(timeout:5))
        app.buttons["wellness.shopping"].tap()
        XCTAssertTrue(app.navigationBars["My Lists"].waitForExistence(timeout:5))
        XCTAssertFalse(app.navigationBars["How It Works"].exists)
        app.buttons["Back"].firstMatch.tap()
        XCTAssertTrue(app.buttons["wellness.shopping"].waitForExistence(timeout:5))
    }

    func testShoppingGuideIsSkippedAfterContinuing() {
        let app=XCUIApplication()
        app.launchArguments=["-wellness-design-preview"]
        app.launch()
        app.buttons["wellness.shopping"].tap()
        continueFromGuide(app)
        XCTAssertTrue(app.navigationBars["My Lists"].waitForExistence(timeout:5))
        app.buttons["Back"].firstMatch.tap()
        XCTAssertTrue(app.buttons["wellness.shopping"].waitForExistence(timeout:5))
        app.buttons["wellness.shopping"].tap()
        XCTAssertTrue(app.navigationBars["My Lists"].waitForExistence(timeout:5))
        XCTAssertFalse(app.navigationBars["How It Works"].exists)
    }

}
