import Foundation

public enum FocusClock {
    public static func remainingSeconds(until end: Date, now: Date) -> Int {
        max(0, Int(end.timeIntervalSince(now).rounded(.up)))
    }

    public static func label(seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
