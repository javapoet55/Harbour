import XCTest

@MainActor final class MomentUITests: XCTestCase {
    var app: XCUIApplication!
    override func setUp() {
        super.setUp(); continueAfterFailure = false
        app = XCUIApplication(); app.launchArguments = ["-moments-design-preview"]; app.launch()
        XCTAssertTrue(app.navigationBars["Important Moments"].waitForExistence(timeout: 15))
    }
    func testTodayCompactAttentionOpensOnDemand() {
        app.terminate()
        app.launchArguments = ["-today-design-preview"]
        app.launch()
        let summary = app.buttons["today-attention-summary"]
        for _ in 0..<8 {
            if summary.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(summary.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Focus next"].exists)
        XCTAssertFalse(app.staticTexts["What should I do now?"].exists)
        summary.tap()
        XCTAssertTrue(app.navigationBars["Needs attention"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Complete Gym"].exists)
        app.buttons["Reschedule all"].tap()
        XCTAssertTrue(app.navigationBars["Reschedule all"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
        app.buttons["Close"].tap()
        XCTAssertTrue(summary.waitForExistence(timeout: 5))
    }

    func openFestivalManager() {
        app.terminate(); app.launchArguments.append("-festival-manage-preview"); app.launch()
        let manage=app.buttons["moments-manage"].firstMatch
        XCTAssertTrue(manage.waitForExistence(timeout:15));manage.tap()
        app.buttons["manage-moment-moment"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
    }
    func testCreateMomentOpensEvenWhenListRefreshIsStale() {
        app.terminate()
        app.launchArguments = ["-moments-design-preview", "-stale-moment-list-preview"]
        app.launch()
        XCTAssertTrue(app.buttons["moments-create-new"].waitForExistence(timeout: 15))
        app.buttons["moments-create-new"].tap()
        let firstName = app.textFields["First name"]
        for _ in 0..<4 { if firstName.isHittable { break }; app.swipeUp() }
        firstName.tap(); firstName.typeText("Rahul")
        app.buttons["moment-save-top"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout: 10))
        app.buttons["Contacts"].tap()
        XCTAssertTrue(app.staticTexts["Rahul"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Save Moment"].exists)
    }

    func testNewMomentHasNoDefaultContacts() {
        app.buttons["moments-create-new"].tap()
        app.buttons["moment-save-top"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout: 10))
        app.buttons["Contacts"].tap()
        XCTAssertTrue(app.staticTexts["0 selected"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["moment-no-recipients"].exists)
        XCTAssertFalse(app.buttons["Select Damien"].exists)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Mobile ·")).firstMatch.exists)
        app.buttons["Wish Message"].tap()
        XCTAssertTrue(app.buttons["Schedule"].exists)
    }

    func testCreateBirthdayOpensPersonalizedManager() {
        app.buttons["moments-create-new"].tap()
        XCTAssertTrue(app.navigationBars["Create Moment"].waitForExistence(timeout: 5))
        let firstName = app.textFields["First name"]
        for _ in 0..<4 { if firstName.isHittable { break }; app.swipeUp() }
        firstName.tap(); firstName.typeText("Rahul")
        app.buttons["moment-save-top"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Rahul’s Birthday"].firstMatch.exists)
        for tab in ["Details", "Contacts", "Wish Message", "Schedule"] {
            XCTAssertTrue(app.buttons[tab].exists)
        }
    }
    func testSummaryManageAndCreateNew() {
        let manage=app.buttons["moments-manage"]
        let create=app.buttons["moments-create-new"]
        XCTAssertEqual(manage.label,"Manage")
        XCTAssertEqual(create.label,"Create New")
        XCTAssertEqual(manage.frame.midY,create.frame.midY,accuracy:2)
        create.tap()
        XCTAssertTrue(app.navigationBars["Create Moment"].waitForExistence(timeout:5))
        XCTAssertTrue(app.textFields["Title"].exists)
        app.navigationBars["Create Moment"].buttons.firstMatch.tap()
        manage.tap()
        XCTAssertTrue(app.navigationBars["Manage Moments"].waitForExistence(timeout:5))
    }
    func testManageMomentsListsEveryCategory() {
        app.terminate();app.launchArguments.append("-all-moment-categories");app.launch()
        app.buttons["moments-manage"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Manage Moments"].waitForExistence(timeout:5))
        for id in ["moment","anniversary","festival","custom"] {
            XCTAssertTrue(app.buttons["manage-moment-"+id].exists)
        }
        app.buttons["manage-moment-moment"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["manage-moment-festival"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["festival-tab-Schedule"].exists)
    }
    func testFestivalContactsExpandAndCollapse() {
        app.launchArguments.append("-festival-five-recipients")
        openFestivalManager();app.buttons["festival-tab-Contacts"].tap()
        XCTAssertTrue(app.staticTexts["5 selected"].exists)
        XCTAssertTrue(app.buttons["Select Contact 3"].exists)
        XCTAssertFalse(app.buttons["Select Contact 4"].exists)
        let more=app.buttons["festival-show-contacts"]
        for _ in 0..<5 {if more.isHittable{break};app.swipeUp()}
        more.tap()
        XCTAssertTrue(app.buttons["Select Contact 4"].exists)
        XCTAssertTrue(app.buttons["Select Contact 5"].exists)
        for _ in 0..<5 {if more.isHittable{break};app.swipeUp()}
        more.tap()
        XCTAssertFalse(app.buttons["Select Contact 4"].exists)
    }
    func testFestivalCardOpensItsFourTabManager() {
        app.terminate(); app.launchArguments.append("-festival-manage-preview"); app.launch()
        let manage = app.buttons["festival-manage-moment"]
        XCTAssertTrue(manage.waitForExistence(timeout: 15))
        for _ in 0..<5 { if manage.isHittable { break }; app.swipeUp() }
        XCTAssertEqual(manage.label, "Manage Happy Diwali")
        let formatter=DateFormatter()
        formatter.locale=Locale(identifier:"en_US_POSIX")
        formatter.timeZone=TimeZone(identifier:"America/Los_Angeles")
        formatter.dateFormat="EEE, MMM d, yyyy"
        let fullDate=formatter.string(from:Date().addingTimeInterval(30*86400))
        XCTAssertEqual(app.staticTexts["festival-date-moment"].label,fullDate)
        XCTAssertGreaterThan(app.staticTexts["festival-date-moment"].frame.minY,app.staticTexts["Festival · In 30 days"].frame.minY)
        XCTAssertEqual(app.buttons.matching(NSPredicate(format:"label == %@","Manage")).count,1)
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
    func testFestivalCardBodyOpensManager() {
        app.terminate();app.launchArguments.append("-festival-manage-preview");app.launch()
        let date=app.staticTexts["festival-date-moment"]
        for _ in 0..<5 {if date.isHittable{break};app.swipeUp()}
        date.tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["festival-tab-Schedule"].exists)
    }
    func testFestivalSettingsOpensAndPreservesEdits() {
        openFestivalManager()
        let name=app.textFields["festival-name"]
        name.tap();name.typeText(" Edited")
        let editedName=name.value as? String
        app.buttons["festival-keyboard-done"].tap()
        for tab in ["Details","Contacts"] {
            app.buttons["festival-tab-"+tab].tap()
            app.buttons["Moment options"].tap()
            app.buttons["Festival settings"].tap()
            XCTAssertTrue(app.navigationBars["Moments Settings"].waitForExistence(timeout:5))
            XCTAssertTrue(app.buttons["Connect / Reconnect Gmail"].exists)
            app.navigationBars["Moments Settings"].buttons.firstMatch.tap()
            XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
            XCTAssertTrue(app.buttons["festival-tab-"+tab].isSelected)
        }
        app.buttons["festival-tab-Details"].tap()
        XCTAssertEqual(name.value as? String,editedName)
    }
    func testFestivalTabsAutosaveEdits() {
        openFestivalManager()
        let name=app.textFields["festival-name"];name.tap();name.typeText(" Edited")
        app.buttons["festival-tab-Contacts"].tap()
        XCTAssertTrue(app.staticTexts["Recipients"].exists)
        app.buttons["festival-tab-Wish Message"].tap()
        XCTAssertTrue(app.textViews["Festival wish message"].exists)
        app.buttons["festival-tab-Details"].tap()
        XCTAssertTrue((name.value as? String)?.contains("Edited") == true)
        app.navigationBars.buttons["Back"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moments"].waitForExistence(timeout:5))
        app.buttons["manage-moment-moment"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
        XCTAssertTrue((app.textFields["festival-name"].value as? String)?.contains("Edited") == true)
    }
    func testFestivalImagePreviewAndSelection() {
        openFestivalManager();app.buttons["festival-tab-Wish Message"].tap()
        let create=app.buttons["Create AI Greeting Card"]
        for _ in 0..<6 { if create.isHittable {break};app.swipeUp() }
        create.tap()
        XCTAssertTrue(app.navigationBars["Greeting Card"].waitForExistence(timeout:5))
        let signature=app.textFields["card-signature"]
        for _ in 0..<5 {if signature.isHittable {break};app.swipeUp()}
        XCTAssertTrue((signature.value as? String ?? "").hasPrefix("With love,"))
        signature.tap(withNumberOfTaps:3,numberOfTouches:1);signature.typeText("With love, Sri & family")
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
    func testBirthdayGreetingCard() {verifyOccasionCard(id:"moment")}
    func testAnniversaryGreetingCard() {verifyOccasionCard(id:"anniversary")}
    func testGetWellSoonGreetingCard() {verifyOccasionCard(id:"getWellSoon")}
    private func verifyOccasionCard(id:String) {
        app.terminate();app.launchArguments.append("-all-moment-categories");app.launch()
        app.buttons["moments-manage"].firstMatch.tap()
        let moment=app.buttons["manage-moment-"+id]
        for _ in 0..<5 {if moment.isHittable{break};app.swipeUp()};moment.tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
        for tab in ["Details","Contacts","Wish Message","Schedule"] {XCTAssertTrue(app.buttons["festival-tab-"+tab].exists)}
        app.buttons["festival-tab-Wish Message"].tap()
        let create=app.buttons["Create AI Greeting Card"]
        for _ in 0..<7 {if create.isHittable{break};app.swipeUp()};create.tap()
        XCTAssertTrue(app.navigationBars["Greeting Card"].waitForExistence(timeout:5))
        let greeting=app.textFields["card-greeting"]
        let savedGreeting=greeting.value as? String
        let signature=app.textFields["card-signature"]
        for _ in 0..<5 {if signature.isHittable{break};app.swipeUp()}
        signature.tap(withNumberOfTaps:3,numberOfTouches:1);signature.typeText("With love, Sam")
        app.toolbars.buttons["Done"].tap()
        let generate=app.buttons["Generate AI Greeting Card"]
        for _ in 0..<5 {if generate.isHittable{break};app.swipeUp()};generate.tap()
        let use=app.buttons["Use This Card"]
        XCTAssertTrue(use.waitForExistence(timeout:10))
        for _ in 0..<6 {if use.isHittable{break};app.swipeUp()};use.tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:8))
        let save=app.buttons["Save Message"]
        for _ in 0..<7 {if save.isHittable{break};app.swipeUp()};save.tap()
        XCTAssertTrue(app.staticTexts["Message approved and saved. Nothing has been sent."].waitForExistence(timeout:8))
        app.navigationBars["Manage Moment"].buttons.firstMatch.tap()
        for _ in 0..<5 {if moment.isHittable{break};app.swipeUp()};moment.tap()
        app.buttons["festival-tab-Wish Message"].tap()
        let edit=app.buttons["Edit Greeting Card"]
        for _ in 0..<7 {if edit.isHittable{break};app.swipeUp()};edit.tap()
        for _ in 0..<5 {if signature.isHittable{break};app.swipeUp()}
        XCTAssertEqual(signature.value as? String,"With love, Sam")
        XCTAssertEqual(greeting.value as? String,savedGreeting)
    }
    func testGetWellSoonCategoryDefaults() {
        let add=app.buttons["Add Moment"]
        for _ in 0..<6 {if add.isHittable{break};app.swipeUp()};add.tap()
        app.buttons["moment-type"].tap()
        app.buttons["Get Well Soon"].tap()
        XCTAssertEqual(app.textFields["Title"].value as? String,"Get Well Soon")
        XCTAssertEqual(app.switches["Repeat yearly"].value as? String,"0")
    }
    func testFestivalDeleteRequiresConfirmation() {
        openFestivalManager()
        app.buttons["Moment options"].tap();app.buttons["festival-delete-menu"].tap()
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout:3))
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].exists)
    }
    func testFestivalDetailsDateUpdatesSendDate() {
        openFestivalManager()
        let picker=app.datePickers["festival-details-date"]
        for _ in 0..<4 {if picker.isHittable{break};app.swipeUp()}
        picker.tap()
        var calendar=Calendar(identifier:.gregorian)
        calendar.timeZone=TimeZone(identifier:"America/Los_Angeles")!
        let original=Date().addingTimeInterval(30*86400)
        let changed=calendar.date(byAdding:.day,value:calendar.component(.day,from:original)==1 ? 1 : -1,to:original)!
        let formatter=DateFormatter()
        formatter.locale=Locale(identifier:"en_US_POSIX");formatter.timeZone=calendar.timeZone
        formatter.dateFormat="EEEE, MMMM d"
        app.buttons[formatter.string(from:changed)].tap()
        app.buttons["PopoverDismissRegion"].tap()
        formatter.dateFormat="EEE, MMM d, yyyy"
        let expected="Send date · " + formatter.string(from:changed)
        for _ in 0..<4 {if app.staticTexts["festival-send-date"].isHittable{break};app.swipeDown()}
        XCTAssertEqual(app.staticTexts["festival-send-date"].label,expected)
        let save=app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@","Save Changes")).firstMatch
        for _ in 0..<7 {if save.isHittable{break};app.swipeUp()}
        save.tap()
        XCTAssertTrue(app.staticTexts["Moment changes saved."].waitForExistence(timeout:8))
        app.navigationBars["Manage Moment"].buttons["Back"].tap()
        app.buttons["manage-moment-moment"].tap()
        XCTAssertEqual(app.staticTexts["festival-send-date"].label,expected)
        app.buttons["festival-tab-Schedule"].tap()
        XCTAssertTrue(app.staticTexts[formatter.string(from:changed)].exists)
    }
    func testFestivalNameKeyboardDone() {
        openFestivalManager()
        let name=app.textFields["festival-name"]
        name.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout:5))
        name.typeText(" A")
        let editedName=name.value as? String
        XCTAssertTrue(editedName?.contains(" A") == true)
        app.buttons["festival-keyboard-done"].tap()
        let keyboardHidden=NSPredicate(format:"exists == false")
        expectation(for:keyboardHidden,evaluatedWith:app.keyboards.firstMatch)
        waitForExpectations(timeout:5)
        XCTAssertEqual(name.value as? String,editedName)
        name.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout:5))
        name.typeText("\n")
        expectation(for:keyboardHidden,evaluatedWith:app.keyboards.firstMatch)
        waitForExpectations(timeout:5)
        XCTAssertEqual(name.value as? String,editedName)
    }
    func testFestivalDoneReturnsToImportantMomentsFromManagement() {
        verifyFestivalDoneReturnsToImportantMoments(direct:false)
    }
    func testFestivalDoneReturnsToImportantMomentsFromCard() {
        verifyFestivalDoneReturnsToImportantMoments(direct:true)
    }
    private func verifyFestivalDoneReturnsToImportantMoments(direct:Bool) {
        openFestivalManager()
        if direct {
            app.navigationBars["Manage Moment"].buttons["Back"].tap()
            app.navigationBars["Manage Moments"].buttons.firstMatch.tap()
            let card=app.buttons["festival-manage-moment"]
            for _ in 0..<5 {if card.isHittable{break};app.swipeUp()}
            card.tap()
        }
        app.buttons["festival-tab-Wish Message"].tap()
        let save=app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@","Save Message")).firstMatch
        for _ in 0..<6 {if save.isHittable{break};app.swipeUp()};save.tap()
        XCTAssertTrue(app.staticTexts["Message approved and saved. Nothing has been sent."].waitForExistence(timeout:8))
        for _ in 0..<6 {if app.buttons["festival-tab-Schedule"].isHittable{break};app.swipeDown()}
        app.buttons["festival-tab-Schedule"].tap()
        let schedule=app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@","Schedule Wish")).firstMatch
        for _ in 0..<6 {if schedule.isHittable{break};app.swipeUp()};schedule.tap()
        app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@","Confirm Schedule")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Wishes scheduled"].waitForExistence(timeout:8))
        let done=app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@","Done")).firstMatch
        for _ in 0..<4 {if done.isHittable{break};app.swipeUp()};done.tap()
        XCTAssertTrue(app.navigationBars["Important Moments"].waitForExistence(timeout:5))
        XCTAssertFalse(app.navigationBars["Manage Moment"].exists)
        XCTAssertFalse(app.navigationBars["Schedule confirmed"].exists)
        XCTAssertTrue(app.buttons["moments-manage"].firstMatch.exists)
    }
    func testFestivalApprovalAndSchedule() {
        app.launchArguments.append("-festival-two-recipients")
        openFestivalManager();app.buttons["festival-tab-Wish Message"].tap()
        let save=app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@", "Save Message")).firstMatch
        for _ in 0..<5 {if save.isHittable{break};app.swipeUp()};save.tap()
        XCTAssertTrue(app.staticTexts["Message approved and saved. Nothing has been sent."].waitForExistence(timeout:8))
        for _ in 0..<5 {if app.buttons["festival-tab-Schedule"].isHittable{break};app.swipeDown()}
        app.buttons["festival-tab-Schedule"].tap()
        let schedule=app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@", "Schedule Wish")).firstMatch
        for _ in 0..<5 {if schedule.isHittable{break};app.swipeUp()};schedule.tap()
        XCTAssertTrue(app.navigationBars["Review schedule"].waitForExistence(timeout:5))
        XCTAssertTrue(app.staticTexts["You are confirming this schedule for all selected contacts. Recipients do not need to confirm."].exists)
        XCTAssertEqual(app.staticTexts.matching(identifier:"Messages · Sent by you").count,2)
        XCTAssertFalse(app.staticTexts["We’ll remind you to confirm in Messages"].exists)
        app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@", "Confirm Schedule")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Wishes scheduled"].waitForExistence(timeout:8))
        XCTAssertEqual(app.staticTexts.matching(identifier:"We’ll remind you, the sender, to tap Send in Messages").count,1)
        XCTAssertTrue(app.staticTexts["For all 2 selected contacts"].exists)
        XCTAssertEqual(app.buttons.matching(identifier:"festival-manage-schedule").count,1)
        app.buttons["festival-manage-schedule"].tap()
        XCTAssertTrue(app.navigationBars["Manage Moment"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["festival-tab-Schedule"].isSelected)
        app.buttons["festival-tab-Details"].tap()
        app.switches["Repeat every year"].tap()
        let saveDetails=app.buttons.matching(identifier:"wish-primary").matching(NSPredicate(format:"label == %@","Save Changes")).firstMatch
        for _ in 0..<7 {if saveDetails.isHittable{break};app.swipeUp()}
        saveDetails.tap()
        XCTAssertTrue(app.alerts["Save changes to scheduled wishes?"].waitForExistence(timeout:5))
        app.alerts.buttons["Cancel schedules and save"].tap()
        XCTAssertTrue(app.staticTexts["Changes saved. Review and schedule your updated wish again."].waitForExistence(timeout:8))
        for _ in 0..<6 {if app.buttons["festival-tab-Schedule"].isHittable{break};app.swipeDown()}
        app.buttons["festival-tab-Schedule"].tap()
        XCTAssertFalse(app.buttons["Cancelled · Messages"].exists)
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
        XCTAssertTrue(app.navigationBars["Create Moment"].waitForExistence(timeout: 5))
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
        // Custom moments retain this delivery flow; birthdays use the four-tab manager.
        app.terminate(); app.launchArguments.append("-legacy-moment-preview"); app.launch()
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
