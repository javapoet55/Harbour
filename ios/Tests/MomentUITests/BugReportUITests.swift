import XCTest

@MainActor final class BugReportUITests: XCTestCase {
    func testFiveScreensConsentRemovalAndRetry() {
        let app = XCUIApplication()
        app.launchArguments = ["-bug-report-preview", "-bug-failure"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Report a bug?"].waitForExistence(timeout: 10))
        capture(app, "01-introduction")
        app.buttons["bug.primary"].tap()
        XCTAssertFalse(app.buttons["bug.primary"].isEnabled)
        let description = app.textViews["bug.description"]
        description.tap(); description.typeText("Calendar does not open")
        app.swipeUp()
        capture(app, "02-form")
        let toggle = app.switches["bug.screenshot"]
        for _ in 0..<4 { if toggle.isHittable { break }; app.swipeUp() }
        toggle.tap()
        XCTAssertTrue(app.alerts["Include a screenshot?"].waitForExistence(timeout: 3))
        app.alerts.buttons["Cancel"].tap()
        XCTAssertFalse(app.buttons["Remove Screenshot"].exists)
        toggle.tap(); app.alerts.buttons["Include Screenshot"].tap()
        let remove = app.buttons["Remove Screenshot"]
        for _ in 0..<4 { if remove.isHittable && remove.frame.maxY < app.buttons["bug.primary"].frame.minY { break }; app.swipeUp() }
        XCTAssertTrue(remove.exists)
        capture(app, "03-screenshot")
        remove.tap()
        XCTAssertTrue(remove.waitForNonExistence(timeout: 3))
        XCTAssertEqual(description.value as? String, "Calendar does not open")
        app.buttons["bug.primary"].tap()
        XCTAssertTrue(app.staticTexts["Sending report..."].waitForExistence(timeout: 2))
        capture(app, "04-submitting")
        XCTAssertTrue(app.staticTexts["bug.error"].waitForExistence(timeout: 8))
        XCTAssertEqual(description.value as? String, "Calendar does not open")
        app.buttons["bug.primary"].tap()
        XCTAssertTrue(app.staticTexts["bug.reference"].waitForExistence(timeout: 8))
        capture(app, "05-success")
        XCTAssertTrue(app.staticTexts["Your bug report has been received."].exists)
        app.buttons["Copy reference"].tap()
        XCTAssertTrue(app.buttons["Reference copied"].exists)
        app.buttons["bug.primary"].tap()
        XCTAssertTrue(app.staticTexts["Report closed"].waitForExistence(timeout: 3))
    }
    func testOriginalScreenCaptureAndRetake() {
        let app = XCUIApplication(); app.launchArguments = ["-bug-capture-preview"]; app.launch()
        app.buttons["Open Report Bugs"].tap()
        XCTAssertTrue(app.staticTexts["Report a bug?"].waitForExistence(timeout: 5))
        app.buttons["bug.primary"].tap()
        let toggle = app.switches["bug.screenshot"]
        toggle.tap(); app.alerts.buttons["Include Screenshot"].tap()
        XCTAssertTrue(app.buttons["Retake"].waitForExistence(timeout: 5))
        capture(app, "original-screen-preview")
        app.buttons["Retake"].tap(); app.alerts.buttons["Include Screenshot"].tap()
        XCTAssertTrue(app.images["Screenshot preview of original app screen"].exists)
        capture(app, "retaken-original-screen-preview")
    }
    func testDarkModeAndAccessibilityText() {
        let app = XCUIApplication()
        app.launchArguments = ["-bug-report-preview", "-nexdo.appearance", "night", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        XCTAssertTrue(app.buttons["bug.primary"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["bug.primary"].isHittable)
        capture(app, "dark-accessibility-intro")
        app.buttons["bug.primary"].tap()
        XCTAssertTrue(app.buttons["bug.primary"].isHittable)
        for _ in 0..<8 { app.swipeUp() }
        XCTAssertTrue(app.buttons["bug.primary"].isHittable)
        capture(app, "dark-accessibility-form")
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
