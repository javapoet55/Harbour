import XCTest

@MainActor final class MomentUITests: XCTestCase {
    var app: XCUIApplication!
    override func setUp() {
        super.setUp(); continueAfterFailure = false
        app = XCUIApplication(); app.launchArguments = ["-moments-design-preview"]; app.launch()
        XCTAssertTrue(app.navigationBars["Important Moments"].waitForExistence(timeout: 15))
    }
    func openFestivalManager() {
        app.terminate(); app.launchArguments.append("-festival-manage-preview"); app.launch()
        let manage=app.buttons["Manage Moments"].firstMatch
        XCTAssertTrue(manage.waitForExistence(timeout:15));manage.tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
    }
    func testFestivalCardOpensItsFourTabManager() {
        app.terminate(); app.launchArguments.append("-festival-manage-preview"); app.launch()
        let manage = app.buttons["festival-manage-moment"]
        XCTAssertTrue(manage.waitForExistence(timeout: 15))
        for _ in 0..<5 { if manage.isHittable { break }; app.swipeUp() }
        XCTAssertEqual(manage.label, "Manage Moments")
        XCTAssertFalse(app.staticTexts["1 selected contacts"].exists)
        XCTAssertFalse(app.buttons["Manage recipients"].exists)
        manage.tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["festival-name"].value as? String, "Happy Diwali")
        for tab in ["Details", "Contacts", "Wish Message", "Schedule"] {
            XCTAssertTrue(app.buttons["festival-tab-" + tab].exists)
        }
        app.buttons["festival-tab-Contacts"].tap()
        XCTAssertTrue(app.staticTexts["Damien"].exists)
    }
    func testFestivalTabsPreserveEditsAndWarnOnExit() {
        openFestivalManager()
        let name=app.textFields["festival-name"];name.tap();name.typeText(" Edited")
        app.buttons["festival-tab-Contacts"].tap()
        XCTAssertTrue(app.staticTexts["Recipients"].exists)
        app.buttons["festival-tab-Wish Message"].tap()
        XCTAssertTrue(app.textViews["Festival wish message"].exists)
        app.buttons["festival-tab-Details"].tap()
        XCTAssertTrue((name.value as? String)?.contains("Edited") == true)
        app.navigationBars.buttons["Back"].tap()
        XCTAssertTrue(app.buttons["Discard changes"].waitForExistence(timeout:3))
        app.buttons["Keep editing"].tap()
    }
    func testFestivalImagePreviewAndSelection() {
        openFestivalManager();app.buttons["festival-tab-Wish Message"].tap()
        let create=app.buttons["Create AI Greeting Card"]
        for _ in 0..<6 { if create.isHittable {break};app.swipeUp() }
        create.tap()
        XCTAssertTrue(app.navigationBars["Greeting Card"].waitForExistence(timeout:5))
        let signature=app.textFields["card-signature"]
        for _ in 0..<5 {if signature.isHittable {break};app.swipeUp()}
        signature.tap();signature.typeText("With love, Sri & family")
        app.toolbars.buttons["Done"].tap()
        let generate=app.buttons["Generate AI Greeting Card"]
        for _ in 0..<5 {if generate.isHittable {break};app.swipeUp()}
        generate.tap()
        let use=app.buttons["Use This Card"]
        XCTAssertTrue(use.waitForExistence(timeout:10))
        for _ in 0..<6 {app.swipeDown()}
        let preview=XCTAttachment(screenshot:app.screenshot());preview.name="Full greeting card preview";preview.lifetime = .keepAlways;add(preview)
        for _ in 0..<8 {if use.isHittable {break};app.swipeUp()}
        let shot=XCTAttachment(screenshot:app.screenshot());shot.name="Greeting card editor";shot.lifetime = .keepAlways;add(shot)
        use.tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
        XCTAssertTrue(app.staticTexts["With love, Sri & family"].exists)
    }
    func testFestivalDeleteRequiresConfirmation() {
        openFestivalManager()
        app.buttons["Moment options"].tap();app.buttons["festival-delete-menu"].tap()
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout:3))
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].exists)
    }
    func testFestivalApprovalAndSchedule() {
        openFestivalManager();app.buttons["festival-tab-Wish Message"].tap()
        let save=app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@", "Save Message")).firstMatch
        for _ in 0..<5 {if save.isHittable{break};app.swipeUp()};save.tap()
        XCTAssertTrue(app.staticTexts["Message approved and saved. Nothing has been sent."].waitForExistence(timeout:8))
        for _ in 0..<5 {if app.buttons["festival-tab-Schedule"].isHittable{break};app.swipeDown()}
        app.buttons["festival-tab-Schedule"].tap()
        let schedule=app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@", "Schedule Wish")).firstMatch
        for _ in 0..<5 {if schedule.isHittable{break};app.swipeUp()};schedule.tap()
        XCTAssertTrue(app.navigationBars["Review schedule"].waitForExistence(timeout:5))
        XCTAssertTrue(app.staticTexts["We’ll remind you to confirm in Messages"].exists)
        app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@", "Confirm Schedule")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Wishes scheduled"].waitForExistence(timeout:8))
    }
    func testFestivalVisualTabs() {
        openFestivalManager()
        for tab in ["Details","Contacts","Wish Message","Schedule"] {
            let button=app.buttons["festival-tab-"+tab];button.tap()
            XCTAssertTrue(button.isSelected)
            let shot=XCTAttachment(screenshot:app.screenshot());shot.name="Manage Festival - "+tab;shot.lifetime = .keepAlways;add(shot)
        }
    }
    func openRoutedWish() {
        app.terminate()
        app.launchArguments.append("-moments-route-preview")
        app.launch()
        XCTAssertTrue(app.navigationBars["Wish details"].waitForExistence(timeout: 15))
    }
    func testRoutedWishDoneReturnsToList() {
        openRoutedWish()
        app.swipeUp()
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["Add Moment"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars["Wish details"].exists)
        app.buttons["Close"].tap()
        XCTAssertTrue(app.navigationBars["Important Moments"].waitForExistence(timeout: 5))
    }
    func testRoutedWishBackReturnsToList() {
        openRoutedWish()
        app.navigationBars["Wish details"].buttons.firstMatch.tap()
        XCTAssertTrue(app.buttons["Add Moment"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars["Wish details"].exists)
    }
    func testFestivalOffersMultipleContactPicker() {
        app.buttons["Add Moment"].tap()
        XCTAssertTrue(app.navigationBars["Add Moment"].waitForExistence(timeout: 5))
        app.buttons["moment-type"].tap()
        app.buttons["Festival"].tap()
        app.swipeUp()
        let choose = app.buttons["Choose multiple contacts"]
        XCTAssertTrue(choose.waitForExistence(timeout: 5))
        choose.tap()
        XCTAssertTrue(app.navigationBars["Contacts"].waitForExistence(timeout: 5))
        app.cells["John Appleseed"].tap()
        app.cells["Kate Bell"].tap()
        app.navigationBars["Contacts"].buttons["Done"].tap()
        XCTAssertTrue(app.staticTexts["2 contacts selected"].waitForExistence(timeout: 5))
        app.buttons["Remove John Appleseed"].tap()
        XCTAssertTrue(app.staticTexts["1 contacts selected"].exists)
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
