import Foundation

public enum ShoppingStoreHoursDay {
    /// Hours descriptions are requested in English; match the weekday rather than
    /// assuming Google's rows begin on a particular day.
    public static func isToday(_ description: String, at date: Date = Date(), utcOffsetMinutes: Int?) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utcOffsetMinutes.flatMap { minutes in
            (-840...840).contains(minutes) ? TimeZone(secondsFromGMT: minutes * 60) : nil
        } ?? .current
        let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        let today = names[calendar.component(.weekday, from: date) - 1]
        return description.split(separator: ":", maxSplits: 1).first?
            .trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(today) == .orderedSame
    }
}
