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
    private let modules = ["shopping", "calories", "pomodoro", "moments"]

    private func openModule(_ module: String, in app: XCUIApplication) {
        let card = app.buttons["wellness.\(module)"]
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        if !card.isHittable { app.swipeUp() }
        card.tap()
    }

    private func assertModuleHome(_ module: String, in app: XCUIApplication) {
        let firstPage: XCUIElement
        switch module {
        case "calories": firstPage = app.buttons["Set Up Agent"]
        case "pomodoro": firstPage = app.buttons["Start Focus Session"]
        case "moments": firstPage = app.textFields["Search moments"]
        default: firstPage = app.navigationBars["My Lists"]
        }
        XCTAssertTrue(firstPage.waitForExistence(timeout: 5), "Missing first page for \(module)")
        XCTAssertFalse(app.navigationBars["How It Works"].exists)
    }

    private func closeModule(_ module: String, in app: XCUIApplication) {
        let label = module == "calories" ? "Close calorie tracker" : module == "pomodoro" ? "Close dashboard" : "Back"
        app.buttons[label].firstMatch.tap()
        XCTAssertTrue(app.buttons["wellness.\(module)"].waitForExistence(timeout: 5))
    }

    func testModuleGuidesAreIndependentAndSkippedAfterReturningHome() {
        let app = XCUIApplication()
        app.launchArguments = ["-wellness-design-preview"]
        app.launch()
        // Visit all modules in one session: seeing one must not skip another's guide.
        for module in modules {
            openModule(module, in: app)
            XCTAssertTrue(app.navigationBars["How It Works"].waitForExistence(timeout: 5))
            let home = app.buttons["module-guide-home"]
            for _ in 0..<6 { if home.isHittable { break }; app.swipeUp() }
            home.tap()
            openModule(module, in: app)
            assertModuleHome(module, in: app)
            closeModule(module, in: app)
        }
    }

    func testModuleGuidesAreSkippedAfterContinuing() {
        let app = XCUIApplication()
        app.launchArguments = ["-wellness-design-preview"]
        app.launch()
        for module in modules {
            openModule(module, in: app)
            continueFromGuide(app)
            assertModuleHome(module, in: app)
            closeModule(module, in: app)
            openModule(module, in: app)
            assertModuleHome(module, in: app)
            closeModule(module, in: app)
        }
    }
}
