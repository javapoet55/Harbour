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
        XCTAssertTrue(app.buttons["Set Up Agent"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        app.buttons["wellness.pomodoro"].tap()
        XCTAssertTrue(app.buttons["Start Focus Session"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        app.buttons["wellness.moments"].tap()
        XCTAssertTrue(app.textFields["Search moments"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()
        XCTAssertTrue(app.buttons["wellness.shopping"].waitForExistence(timeout: 5))
        let shopping = app.buttons["wellness.shopping"]
        if !shopping.isHittable { app.swipeUp() }
        shopping.tap()
        XCTAssertTrue(app.navigationBars["My Lists"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()
        XCTAssertTrue(app.buttons["wellness.calories"].waitForExistence(timeout: 5))
    }
}
