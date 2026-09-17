import XCTest

@MainActor final class MomentUITests: XCTestCase {
    var app: XCUIApplication!
    override func setUp() {
        super.setUp(); continueAfterFailure = false
        app = XCUIApplication(); app.launchArguments = ["-moments-design-preview"]; app.launch()
        XCTAssertTrue(app.navigationBars["Important Moments"].waitForExistence(timeout: 15))
    }
    func openReview() {
        let review = app.buttons["Review wish"].firstMatch
        XCTAssertTrue(review.waitForExistence(timeout: 10)); review.tap()
        XCTAssertTrue(app.navigationBars["Review Wish"].waitForExistence(timeout: 5))
    }
    func continueToDelivery() {
        openReview(); app.swipeUp()
        let button = app.buttons["Approve & Continue"]; XCTAssertTrue(button.waitForExistence(timeout: 5)); button.tap()
        XCTAssertTrue(app.navigationBars["Choose Delivery"].waitForExistence(timeout: 5))
    }
    func testMessagesReminderScheduleAndEdit() {
        continueToDelivery(); app.swipeUp(); app.buttons["Remind me later"].tap(); app.buttons["Choose date & time"].tap(); app.swipeUp(); app.swipeUp()
        app.buttons["Schedule Reminder"].tap()
        XCTAssertTrue(app.staticTexts["Wish scheduled"].waitForExistence(timeout: 8)); app.swipeUp()
        app.buttons["Edit Schedule"].tap(); XCTAssertTrue(app.navigationBars["Edit Schedule"].waitForExistence(timeout: 5))
        app.buttons["Save schedule"].tap(); XCTAssertTrue(app.buttons["Review & Open Messages"].waitForExistence(timeout: 8))
    }
    func testNotificationDenialDoesNotCreatePlan() {
        app.terminate(); app.launchArguments.append("-moments-denied"); app.launch(); continueToDelivery(); app.swipeUp(); app.buttons["Remind me later"].tap(); app.buttons["Choose date & time"].tap(); app.swipeUp(); app.swipeUp()
        app.buttons["Schedule Reminder"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Notifications are off")).firstMatch.waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["Wish scheduled"].exists)
    }
    func testMessagesUnavailableHasRecovery() {
        continueToDelivery(); app.swipeUp(); app.buttons["Open Messages"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "isn’t available on this device")).firstMatch.waitForExistence(timeout: 8))
    }
    func testSettingsExplainsImportAndPrivacy() {
        app.buttons["Important Moments settings"].tap()
        XCTAssertTrue(app.buttons["Choose a contact birthday"].waitForExistence(timeout: 5)); app.buttons["Choose a contact birthday"].tap()
        XCTAssertTrue(app.alerts["Select one contact"].waitForExistence(timeout: 5)); app.alerts.buttons["Cancel"].tap()
        app.swipeUp(); XCTAssertTrue(app.buttons["Open iOS Settings"].exists)
    }
    func testReviewIsEditableAndRequiresApproval() {
        openReview()
        XCTAssertTrue(app.textViews["Wish message"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "Review Wish"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.swipeUp(); XCTAssertTrue(app.buttons["Approve & Continue"].isEnabled)
    }
    func testCopyIsSeparateFromSent() {
        continueToDelivery(); app.buttons["Copy"].firstMatch.tap(); app.swipeUp()
        app.buttons["wish-primary"].tap()
        let status = app.buttons["View delivery status"]; XCTAssertTrue(status.waitForExistence(timeout: 8)); status.tap()
        XCTAssertTrue(app.staticTexts["Copied — delivery not confirmed"].waitForExistence(timeout: 5))
    }
    func testEmailShowsFinalConfirmation() {
        continueToDelivery(); app.buttons["Email"].firstMatch.tap(); app.swipeUp()
        app.buttons["Review email & send"].tap()
        XCTAssertTrue(app.buttons["Send email"].waitForExistence(timeout: 5)); app.buttons["Cancel"].tap()
    }
    func testAutomaticScheduleAndCancel() {
        continueToDelivery(); app.buttons["Email"].firstMatch.tap(); app.swipeUp(); app.buttons["Schedule"].tap()
        app.buttons["Choose date & time"].tap()
        XCTAssertTrue(app.navigationBars["Schedule Wish"].waitForExistence(timeout: 5))
        app.swipeUp(); app.switches["Send automatically"].tap(); app.switches["Notify me 1 hour before"].tap(); app.swipeUp()
        app.buttons["Schedule Automatic Send"].tap()
        XCTAssertTrue(app.staticTexts["Wish scheduled"].waitForExistence(timeout: 8)); app.swipeUp()
        app.buttons["Cancel scheduled wish"].tap(); app.buttons["Cancel wish"].tap()
        XCTAssertTrue(app.staticTexts["Cancelled"].waitForExistence(timeout: 8))
    }
}
