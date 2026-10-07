import Foundation

public enum ShoppingOfferDates {
    /// The offer's last day as the store states it, whatever zone the phone is in.
    ///
    /// The server sends the end as an instant: 23:59:59 on the last day in the store's US zone (Costco), or the
    /// ad's own end (Flipp `valid_to`, often the next midnight). Formatting that in the phone's zone showed a
    /// Safeway ad ending 6 Oct in California as "7 Oct" in India. Every US zone is 4–11 hours behind UTC, so
    /// 12 hours before the end, read in UTC, is always on the store's last day. Same rule as RN's `offerEndDate`.
    public static func lastDay(_ value: String, locale: Locale = .current) -> String {
        guard let end = ISO8601DateFormatter().date(from: value) ?? MomentDates.parseInstant(value) else { return value }
        var style = Date.FormatStyle(date: .abbreviated, time: .omitted, locale: locale, calendar: Calendar(identifier: .gregorian))
        style.timeZone = TimeZone(identifier: "UTC")!
        return end.addingTimeInterval(-12 * 3600).formatted(style)
    }
}
