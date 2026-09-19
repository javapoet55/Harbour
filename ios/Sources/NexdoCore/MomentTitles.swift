import Foundation

public enum MomentTitles {
    public static func defaultTitle(for type: String, firstName: String) -> String? {
        let name = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        switch type {
        case "birthday": return name.isEmpty ? "Happy Birthday" : "\(name)’s Birthday"
        case "anniversary": return name.isEmpty ? "Happy Anniversary" : "\(name)’s Anniversary"
        case "getWellSoon": return "Get Well Soon"
        default: return nil
        }
    }

    public static func updating(_ title: String, from oldType: String, firstName oldName: String, to newType: String, firstName newName: String) -> String {
        let current = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let automatic = current.isEmpty || current == defaultTitle(for: oldType, firstName: oldName)
            || current == defaultTitle(for: oldType, firstName: "")
        return automatic ? (defaultTitle(for: newType, firstName: newName) ?? "") : title
    }
}
