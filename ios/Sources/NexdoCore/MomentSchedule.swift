import Foundation

/// Read-only projections for Calendar and Tasks; these are never saved as duplicate tasks.
public enum MomentSchedule {
    private static let prefix = "moment:"
    public static func momentID(_ entryID: String) -> String? {
        guard entryID.hasPrefix(prefix), entryID.count > prefix.count + 11 else { return nil }
        return String(entryID.dropFirst(prefix.count).dropLast(11))
    }
    public static func occurs(_ moment: ImportantMoment, on day: String) -> Bool {
        guard moment.enabled, !moment.isArchived, day.count == 10, moment.occurrenceDate.count == 10 else { return false }
        guard moment.yearly else { return moment.occurrenceDate == day }
        guard let year = Int(day.prefix(4)) else { return false }
        let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
        let suffix = String(moment.occurrenceDate.suffix(5))
        return String(day.suffix(5)) == (suffix == "02-29" && !leap ? "02-28" : suffix)
    }
    public static func events(_ moments: [ImportantMoment], days: [String], timeZone: String) -> [CalendarEvent] {
        let calendar = CalendarDates(timeZone: timeZone).calendar
        let formatter = ISO8601DateFormatter()
        return moments.flatMap { moment in
            days.filter { occurs(moment, on: $0) }.map { day in
                let start = MomentDates.date(day, zone: timeZone)
                return CalendarEvent(id: prefix + moment.id + ":" + day, title: moment.title,
                    startAt: formatter.string(from: start),
                    endAt: formatter.string(from: calendar.date(byAdding: .day, value: 1, to: start)!),
                    allDay: true, notes: moment.typeLabel + " · Moment", location: nil,
                    timeZone: timeZone, source: "moment", connectionId: nil, completedAt: nil)
            }
        }
    }
    public static func tasks(_ moments: [ImportantMoment], timeZone: String, now: Date = Date()) -> [NexdoTask] {
        let calendar = CalendarDates(timeZone: timeZone).calendar
        let year = calendar.component(.year, from: now)
        let formatter = ISO8601DateFormatter()
        return moments.filter { $0.enabled && !$0.isArchived }.flatMap { moment in
            // Include this year's occasion and the next occurrence. Also retain last month's
            // occurrence at the year boundary for the Tasks history filter.
            var days = Set([moment.yearly ? MomentDates.next(moment.occurrenceDate, yearly: true, zone: timeZone, now: now) : moment.occurrenceDate])
            if moment.yearly {
                for y in (year - 1)...year {
                    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)
                    let suffix = String(moment.occurrenceDate.suffix(5))
                    days.insert(String(y) + "-" + (suffix == "02-29" && !leap ? "02-28" : suffix))
                }
            }
            return days.sorted().filter { occurs(moment, on: $0) }.map { day in
                NexdoTask(id: prefix + moment.id + ":" + day, title: moment.title, status: "PLANNED",
                    priority: "NORMAL", durationMin: 0, notes: moment.typeLabel + " · Moment",
                    startAt: formatter.string(from: MomentDates.date(day, zone: timeZone)), dueAt: nil)
            }
        }
    }
}
