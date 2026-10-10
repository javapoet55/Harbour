import Foundation

/// Display order only: task dates, deadlines and reminder times are never changed.
public enum TaskDisplayOrder {
    public static func sorted(_ ids: [String], saved: [String]) -> [String] {
        let present = Set(ids)
        let ordered = saved.filter { present.contains($0) }
        let known = Set(ordered)
        return ordered + ids.filter { !known.contains($0) }
    }
    public static func moving(_ source: String, to target: String, in ids: [String]) -> [String]? {
        guard source != target, let from = ids.firstIndex(of: source), let to = ids.firstIndex(of: target) else { return nil }
        var result = ids
        result.remove(at: from)
        result.insert(source, at: to)
        return result
    }
}
