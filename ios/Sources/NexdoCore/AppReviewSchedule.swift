import Foundation

/// Five consecutive Friday opportunities after the first seven calendar days.
/// Missed Fridays expire; never catch up with multiple requests on a later day.
public struct AppReviewSchedule: Codable, Sendable {
    public let firstLaunch: Date
    public private(set) var lastRequestedWeek: Int?

    public init(firstLaunch: Date) { self.firstLaunch = firstLaunch }

    public func eligibleWeek(at now: Date, timeZone: TimeZone) -> Int? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        guard let threshold = calendar.date(byAdding: .day, value: 7, to: firstLaunch),
              now >= threshold, calendar.component(.weekday, from: now) == 6,
              calendar.component(.hour, from: now) >= 17 else { return nil }
        let thresholdDay = calendar.startOfDay(for: threshold)
        let daysUntilFriday = (6 - calendar.component(.weekday, from: thresholdDay) + 7) % 7
        guard let firstFriday = calendar.date(byAdding: .day, value: daysUntilFriday, to: thresholdDay),
              let days = calendar.dateComponents([.day], from: firstFriday, to: calendar.startOfDay(for: now)).day,
              days >= 0 else { return nil }
        let week = days / 7
        guard (week < 5), (week > (lastRequestedWeek ?? -1)) else { return nil }
        return week
    }

    /// Persist this state before invoking StoreKit, which does not report whether it showed a prompt.
    public mutating func consumeOpportunity(at now: Date, timeZone: TimeZone) -> Bool {
        guard let week = eligibleWeek(at: now, timeZone: timeZone) else { return false }
        lastRequestedWeek = week
        return true
    }
}
