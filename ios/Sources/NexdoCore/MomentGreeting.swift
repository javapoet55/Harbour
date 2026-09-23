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

    static let separators = Array("!. \n".utf16)
    /// Every opening the product writes, longest first so one never shadows another. Same list and order as
    /// the server (src/server/moments/wish-message.ts `openings`).
    static let openings = ["Happy Anniversary", "Happy Birthday", "Get well soon", "Best wishes"]

    /// The opening `text` starts with, in its canonical spelling, or nil. Case is ignored and the opening has
    /// to end the word: "Happy Birthdays all round" is prose, not a greeting.
    static func opening(of text: String) -> String? {
        let lower = text.lowercased(), units = Array(text.utf16)
        return openings.first { opening in
            let length = opening.utf16.count
            return lower.hasPrefix(opening.lowercased()) && (units.count == length || (units.count > length && separators.contains(units[length])))
        }
    }

    /// Leads with the recipient's greeting unless the wish already names them. A wish that already opens with
    /// a greeting keeps it and gets the name put into it ("Happy anniversary! …" on a birthday moment becomes
    /// "Happy Anniversary, Name! …"), never a second greeting. Port of the server's `greetingMessage`.
    public static func message(_ body: String, type: String, firstName: String) -> String {
        guard let greeting = heading(type: type, firstName: firstName) else { return body }
        let name = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let namePattern = "(?i)(?<![\\p{L}\\p{N}])" + NSRegularExpression.escapedPattern(for: name) + "(?![\\p{L}\\p{N}])"
        if body.range(of: namePattern, options: .regularExpression) != nil { return body }
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if let opening = opening(of: text) {
            let units = Array(text.utf16)
            var at = opening.utf16.count
            while at < units.count && separators.contains(units[at]) { at += 1 }
            let rest = String(decoding: units[at...], as: UTF16.self)
            return "\(opening), \(name)!" + (rest.isEmpty ? "" : " " + rest)
        }
        return greeting + " " + text
    }
}
