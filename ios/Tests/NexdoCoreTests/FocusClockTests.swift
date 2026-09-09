import XCTest
@testable import NexdoCore

final class FocusClockTests: XCTestCase {
    func testTwentyFiveMinuteCountdownTicksAndStopsAtZero() {
        let start = Date(timeIntervalSince1970: 1_000)
        let end = start.addingTimeInterval(25 * 60)
        XCTAssertEqual(FocusClock.remainingSeconds(until: end, now: start), 1_500)
        XCTAssertEqual(FocusClock.remainingSeconds(until: end, now: start.addingTimeInterval(1)), 1_499)
        XCTAssertEqual(FocusClock.remainingSeconds(until: end, now: end.addingTimeInterval(30)), 0)
        XCTAssertEqual(FocusClock.label(seconds: 1_499), "24:59")
    }
}
