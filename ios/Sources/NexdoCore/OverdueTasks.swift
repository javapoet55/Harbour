import Foundation

public enum OverdueTasks {
    /// Match unfinished overdue tasks based on the effective task timestamp.
    /// Prefer a scheduled start when present; otherwise use the deadline timestamp.
    public static func results(_ tasks: [NexdoTask], now: Date = Date()) -> [NexdoTask] {
        tasks.compactMap { task -> (NexdoTask, Date)? in
            guard !task.isDone, task.status != "CANCELLED",
                  let value = task.startAt ?? task.dueAt, let deadline = ServerDate.parse(value), deadline < now else { return nil }
            return (task, deadline)
        }.sorted {
            $0.1 == $1.1 ? $0.0.id < $1.0.id : $0.1 < $1.1
        }.map { $0.0 }
    }
}
