import XCTest

@MainActor final class CalendarConnectionUITests: XCTestCase {
    func testProviderGuidesAndBackNavigationDoNotStartAuthentication() {
        let app = XCUIApplication()
        app.launchArguments = ["-calendar-connect-preview"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Connect Your Calendar"].waitForExistence(timeout: 5))
        for provider in ["google", "apple", "microsoft"] {
            let card = app.buttons["calendar-provider-\(provider)"]
            for _ in 0..<5 { if card.isHittable { break }; app.swipeUp() }
            card.tap()
            let connect = app.buttons["calendar-connect-\(provider)"]
            XCTAssertTrue(connect.waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["Need help?"].exists)
            XCTAssertFalse(app.buttons["Cancel"].exists, "Opening instructions must not start authentication")
            for _ in 0..<6 { if connect.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(connect.isHittable, "The connection action must remain reachable by scrolling")
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "Calendar connection – \(provider)"
            screenshot.lifetime = .keepAlways
            add(screenshot)
            app.navigationBars.buttons.firstMatch.tap()
            XCTAssertTrue(app.buttons["calendar-provider-\(provider)"].waitForExistence(timeout: 5))
        }
    }

    func testHelpReturnsToProviderInstructions() {
        let app = XCUIApplication()
        app.launchArguments = ["-calendar-connect-preview"]
        app.launch()
        let google = app.buttons["calendar-provider-google"]
        XCTAssertTrue(google.waitForExistence(timeout: 5))
        google.tap()
        app.buttons["Need help?"].tap()
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.buttons["calendar-connect-google"].waitForExistence(timeout: 5))
    }
}
