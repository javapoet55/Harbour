import Foundation

/// An edit buffer for the existing task contract. Unchanged relationships are omitted:
/// the server replaces all step rows when `subtasks` is present.
public struct TaskDraft: Equatable, Sendable {
    public var projectId: String?
    public var title: String
    public var notes: String
    public var priority: String
    public var duration: Int
    public var energy: String
    public var splittable: Bool
    public var critical: Bool
    public var schedule: Date?
    public var recurrence: String
    public var steps: [TaskStep]

    public init(task: NexdoTask) {
        projectId = task.projectId
        title = task.title; notes = task.notes ?? ""; priority = task.priority
        duration = task.durationMin; energy = task.energyLevel ?? "MEDIUM"
        splittable = task.splittable ?? false; critical = task.critical ?? false
        schedule = task.startAt.flatMap(ServerDate.parse)
        recurrence = task.recurrence?.frequency ?? "NONE"
        steps = (task.subtasks ?? []).sorted { $0.sortOrder < $1.sortOrder }
    }

    public var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (1...1440).contains(duration)
            && steps.count <= 50 && steps.allSatisfy { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    public func detailsBody(comparedTo original: TaskDraft) throws -> Data {
        var fields: [String: Any] = [:]
        if projectId != original.projectId { fields["projectId"] = projectId.map { $0 as Any } ?? NSNull() }
        if title != original.title { fields["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines) }
        if notes != original.notes { fields["notes"] = notes }
        if priority != original.priority { fields["priority"] = priority }
        if duration != original.duration { fields["durationMin"] = duration }
        if energy != original.energy { fields["energyLevel"] = energy }
        if splittable != original.splittable { fields["splittable"] = splittable }
        if critical != original.critical { fields["critical"] = critical }
        if steps != original.steps { fields["subtasks"] = steps.map { $0.title.trimmingCharacters(in: .whitespacesAndNewlines) } }
        if recurrence != original.recurrence {
            fields["recurrence"] = recurrence == "NONE" ? NSNull() : ["frequency": recurrence, "interval": 1]
        }
        return try JSONSerialization.data(withJSONObject: fields)
    }

    public func scheduleBody(comparedTo original: TaskDraft) throws -> Data? {
        guard let schedule, schedule != original.schedule || duration != original.duration || critical != original.critical else { return nil }
        return try JSONSerialization.data(withJSONObject: ["startAt": ISO8601DateFormatter().string(from: schedule), "durationMin": duration])
    }
}
