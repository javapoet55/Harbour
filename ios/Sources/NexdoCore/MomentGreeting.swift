import Foundation

public enum MomentGreeting {
    public static func heading(type: String, firstName: String) -> String? {
        let name = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }
        switch type {
        case "birthday": return "Happy Birthday, \(name)!"
        case "anniversary": return "Happy Anniversary, \(name)!"
        case "getWellSoon": return "Get well soon, \(name)!"
        default: return nil
        }
    }

    public static func message(_ body: String, type: String, firstName: String) -> String {
        guard let greeting = heading(type: type, firstName: firstName) else { return body }
        let namePattern = "(?i)(?<![\\p{L}\\p{N}])" + NSRegularExpression.escapedPattern(for: firstName.trimmingCharacters(in: .whitespacesAndNewlines)) + "(?![\\p{L}\\p{N}])"
        if body.range(of: namePattern, options: .regularExpression) != nil { return body }
        let opening = type == "birthday" ? "Happy Birthday" : type == "anniversary" ? "Happy Anniversary" : "Get well soon"
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.lowercased().hasPrefix(opening.lowercased()) {
            let remainder = String(text.dropFirst(opening.count))
            if remainder.isEmpty || remainder.first.map({ "!. \n".contains($0) }) == true {
                let rest = String(remainder.drop(while: { "!. \n".contains($0) }))
                return greeting + (rest.isEmpty ? "" : " " + rest)
            }
        }
        return greeting + " " + text
    }
}
