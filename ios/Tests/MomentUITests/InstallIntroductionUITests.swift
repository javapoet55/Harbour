import XCTest

@MainActor final class InstallIntroductionUITests: XCTestCase {
    private func freshApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-reset-install-introduction"]
        app.launch()
        XCTAssertTrue(app.buttons["intro.skip"].waitForExistence(timeout: 10))
        return app
    }

    func testFourPagesAndSignup() {
        let app = freshApp()
        for index in 1...4 {
            XCTAssertTrue(app.scrollViews["intro.page.\(index)"].waitForExistence(timeout: 5))
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "Onboarding page \(index)"; attachment.lifetime = .keepAlways; add(attachment)
            if index < 4 { app.buttons["intro.next"].tap() }
        }
        app.buttons["intro.getStarted"].tap()
        XCTAssertTrue(app.staticTexts["Create your account"].waitForExistence(timeout: 5))
        app.terminate()
        app.launchArguments = []
        app.launch()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["intro.skip"].exists)
    }

    func testSkipPersistsAndFreshInstallResets() {
        let app = freshApp()
        app.buttons["intro.skip"].tap()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 5))
        app.terminate(); app.launchArguments = []; app.launch()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["intro.skip"].exists)
        app.terminate()
        app.launchArguments = ["-reset-install-introduction"]; app.launch()
        XCTAssertTrue(app.buttons["intro.next"].waitForExistence(timeout: 10))
    }

    func testSwipePaginationAndSignIn() {
        let app = freshApp()
        app.scrollViews["intro.page.1"].swipeLeft()
        XCTAssertTrue(app.scrollViews["intro.page.2"].waitForExistence(timeout: 5))
        app.buttons["Page 4 of 4"].tap()
        app.buttons["intro.signIn"].tap()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Create your account"].exists)
    }
}
