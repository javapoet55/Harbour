import Foundation

public enum TaskCreationSpacing {
    /// Find the first opening at or after the default start, with a 15-minute
    /// gap on either side of existing tasks. Explicit user times bypass this.
    public static func start(at proposed: Date, durationMin: Int, tasks: [NexdoTask]) -> Date {
        let gap: TimeInterval = 15 * 60
        let duration = TimeInterval(max(1, durationMin)) * 60
        let intervals = tasks.compactMap { task -> (Date, Date)? in
            guard !task.isDone, task.status != "CANCELLED",
                  let value = task.startAt, let start = ServerDate.parse(value) else { return nil }
            return (start, start.addingTimeInterval(TimeInterval(max(1, task.durationMin)) * 60))
        }.sorted { $0.0 < $1.0 }
        var candidate = proposed
        for (start, end) in intervals {
            if candidate < end.addingTimeInterval(gap) && candidate.addingTimeInterval(duration + gap) > start {
                candidate = end.addingTimeInterval(gap)
            }
        }
        return candidate
    }
}
