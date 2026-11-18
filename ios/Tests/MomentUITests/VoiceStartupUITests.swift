import XCTest

@MainActor final class VoiceStartupUITests: XCTestCase {
    func testFirstMicrophonePermissionThenReopeningVoiceStaysOnScreen() {
        let app = XCUIApplication()
        app.launchArguments = ["-task-design-preview", "-voice-startup-test"]
        continueAfterFailure = false
        app.resetAuthorizationStatus(for: .microphone)
        app.launch()

        let addVoice = app.buttons["Add by Voice"]
        XCTAssertTrue(addVoice.waitForExistence(timeout: 10))
        addVoice.tap()

        let allowAndStart = app.buttons["Allow and start"]
        XCTAssertTrue(allowAndStart.waitForExistence(timeout: 5))
        allowAndStart.tap()

        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allowMicrophone = springboard.buttons["Allow"].firstMatch
        XCTAssertTrue(allowMicrophone.waitForExistence(timeout: 10), "Expected the first-time microphone prompt")
        allowMicrophone.tap()

        let fixtureError = app.staticTexts["Voice service unavailable in the simulator test."]
        XCTAssertTrue(fixtureError.waitForExistence(timeout: 10))
        XCTAssertEqual(app.state, .runningForeground)

        app.buttons["Close"].tap()
        XCTAssertTrue(addVoice.waitForExistence(timeout: 5))
        addVoice.tap()
        XCTAssertTrue(fixtureError.waitForExistence(timeout: 10))
        XCTAssertFalse(allowAndStart.exists)
        XCTAssertEqual(app.state, .runningForeground)
    }
}
