import Foundation

public struct NexdoProject: Decodable, Identifiable, Sendable, Equatable {
    public let id: String
    public var name: String
    public var color: String
    public var createdAt: String
    public var updatedAt: String
    public var completedTaskCount: Int
    public var totalTaskCount: Int
    public var progress: Double { totalTaskCount > 0 ? min(1, Double(completedTaskCount) / Double(totalTaskCount)) : 0 }
}
public struct ProjectsResponse: Decodable, Sendable {
    public let projects: [NexdoProject]
    public let unassignedTaskCount: Int
}
public struct ProjectResponse: Decodable, Sendable { public let project: NexdoProject }
public struct ProjectInput: Encodable, Sendable { public let name: String; public let color: String }
public enum ProjectSort: String, CaseIterable, Identifiable, Sendable {
    case updated = "Recently updated", name = "Name", tasks = "Most tasks", completion = "Highest completion"
    public var id: String { rawValue }
}
public enum ProjectQuery {
    public static let palette = ["#8875ff", "#35bce6", "#ed4b9a", "#67be66", "#367de8", "#5b6abf"]
    public static func validName(_ name: String) -> Bool { let value = name.trimmingCharacters(in: .whitespacesAndNewlines); return !value.isEmpty && value.utf16.count <= 80 }
    public static func results(_ projects: [NexdoProject], search: String, sort: ProjectSort) -> [NexdoProject] {
        projects.filter { CalendarSearch.matches($0.name, query: search) }.sorted { a, b in
            switch sort {
            case .updated: if a.updatedAt != b.updatedAt { return a.updatedAt > b.updatedAt }
            case .name:
                let left = a.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
                let right = b.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
                if left != right { return left < right }
            case .tasks: if a.totalTaskCount != b.totalTaskCount { return a.totalTaskCount > b.totalTaskCount }
            case .completion: if a.progress != b.progress { return a.progress > b.progress }
            }
            return a.id < b.id
        }
    }
}
