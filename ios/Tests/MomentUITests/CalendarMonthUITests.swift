import XCTest

@MainActor final class CalendarMonthUITests: XCTestCase {
    func testMonthDateSelectionWithTwoThousandEvents() {
        let app = XCUIApplication()
        app.launchArguments = ["-calendar-design-preview", "-calendar-month", "-calendar-stress-preview"]
        app.launch()
        let first = app.buttons["calendar-day-2026-09-07"]
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        // Wait for indexing, then exercise successive dates without a network request.
        let loaded = NSPredicate(format: "NOT label CONTAINS 'loading'")
        expectation(for: loaded, evaluatedWith: first)
        waitForExpectations(timeout: 15)
        for day in ["2026-09-08", "2026-09-16", "2026-09-23", "2026-09-07"] {
            let button = app.buttons["calendar-day-\(day)"]
            button.tap()
            expectation(for: NSPredicate(format: "selected == true"), evaluatedWith: button)
            waitForExpectations(timeout: 3)
        }
    }
}
