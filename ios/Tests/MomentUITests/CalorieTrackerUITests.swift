import XCTest

@MainActor final class CalorieTrackerUITests: XCTestCase {
    func testSetupDashboardAndLocalFoodLog() {
        let app = XCUIApplication()
        app.launchArguments = ["-calorie-design-preview"]
        app.launch()
        XCTAssertTrue(app.buttons["Set Up Agent"].waitForExistence(timeout: 10))
        capture(app, "Calorie intro")
        app.buttons["Set Up Agent"].tap()
        XCTAssertTrue(app.staticTexts["When should NexDo call you?"].exists)
        capture(app, "Calorie call time")
        tap(app, "Next")
        XCTAssertTrue(app.staticTexts["Your Nutrition Goals"].exists)
        capture(app, "Calorie goals")
        tap(app, "Next")
        XCTAssertTrue(app.staticTexts["Review & Confirm"].exists)
        capture(app, "Calorie confirmation")
        tap(app, "Preview Activation")
        XCTAssertTrue(app.staticTexts["All Set!"].exists)
        capture(app, "Calorie ready")
        tap(app, "View Nutrition Dashboard")
        XCTAssertTrue(app.staticTexts["Nutrition"].exists)
        capture(app, "Calorie dashboard")
        app.segmentedControls.buttons["Week"].tap()
        XCTAssertTrue(app.staticTexts["Calories · Last 7 days"].exists)
        app.segmentedControls.buttons["Month"].tap()
        XCTAssertTrue(app.staticTexts["Calories · Weekly averages"].exists)
        app.segmentedControls.buttons["Today"].tap()
        tap(app, "View Insights")
        XCTAssertTrue(app.staticTexts["Nutrition Insights"].exists)
        capture(app, "Calorie insights")
        tap(app, "Open Food Log")
        XCTAssertTrue(app.staticTexts["Today's Food Log"].exists)
        capture(app, "Calorie food log")
        tap(app, "Add Food")
        app.textFields["Food name"].tap()
        app.textFields["Food name"].typeText("Apple")
        app.textFields["Calories"].tap()
        app.textFields["Calories"].typeText("95")
        app.buttons["Add"].tap()
        app.swipeDown()
        app.swipeDown()
        XCTAssertTrue(app.staticTexts["Apple"].waitForExistence(timeout: 3))
    }
    private func tap(_ app: XCUIApplication, _ label: String) {
        let button = app.buttons[label].firstMatch
        for _ in 0..<7 {
            if button.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(button.isHittable, label)
        button.tap()
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name; image.lifetime = .keepAlways; add(image)
    }
}
