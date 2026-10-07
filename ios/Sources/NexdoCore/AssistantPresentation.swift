import Foundation

extension AssistantTurn {
    /// Prefer the server's ordered response sections. Older/non-briefing responses
    /// retain their actual data in cards rather than disappearing or showing invented zeros.
    public var displaySections: [Section] {
        if let sections = visual.sections, !sections.isEmpty {
            return sections.map { section in
                Section(title: section.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "next step" ? "AI Response" : section.title, items: section.items)
            }
        }
        var sections: [Section] = []
        if let items = visual.appointments, !items.isEmpty { sections.append(Section(title: "Calendar appointments", items: items)) }
        if let items = visual.tasks, !items.isEmpty { sections.append(Section(title: "Tasks", items: items)) }
        if let items = visual.overdue, !items.isEmpty { sections.append(Section(title: "Overdue", items: items)) }
        if let next = visual.next, !next.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { sections.append(Section(title: "AI Response", items: [next])) }
        // The summary is no longer a separate introduction. Preserve answers
        // from servers that supply only a summary or spoken text.
        if sections.isEmpty {
            let answer = visual.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? spoken : visual.summary
            if !answer.isEmpty { sections.append(Section(title: "AI Response", items: [answer])) }
        }
        return sections
    }
}

/// Legacy prose is not evidence of an actionable task or a schedule conflict.
public enum BriefContent {
    public static func isUseful(_ text: String) -> Bool {
        let value = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "’", with: "'")
        if value.isEmpty { return false }
        return !["none detected", "nothing to report", "no tasks", "no open focus", "no matching actionable", "no calendar appointment", "no hard,", "no conflicts", "no schedule conflicts", "there's no overloaded", "the main risk is drift", "the main live planning focus", "past contact and admin tasks", "task calendar link(s) changed outside", "their current calendar blocks are protected"].contains { value.contains($0) }
    }
    /// A bullet that says there is nothing ("No deadlines appear to fall today."): shown, but not an item to count.
    public static func isEmptyStatement(_ text: String) -> Bool {
        let value = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: "^\\d+[.)]\\s*", with: "", options: .regularExpression)
        return ["no ", "none ", "none.", "nothing ", "there are no ", "there is no ", "there's no ", "there aren't any ", "there isn't any ",
                "you have no ", "you don't have any ", "you do not have any "].contains { value.hasPrefix($0) }
    }
    /// What a section's badge and its page count: its items, leaving out bullets that only say there is nothing.
    /// Counting every bullet put "Upcoming Deadlines 2" over "No deadlines appear to fall today".
    public static func itemCount(_ items: [String]) -> Int { items.filter { !isEmptyStatement($0) }.count }
    public static func taskTitleMatches(_ title: String, text: String) -> Bool {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "^\\d+[.)]\\s*", with: "", options: .regularExpression)
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return false }
        return value.caseInsensitiveCompare(name) == .orderedSame ||
            value.range(of: "^" + NSRegularExpression.escapedPattern(for: name) + "(?:\\s+[—–-]\\s+|[:,.]\\s+|\\s+is\\s+)", options: [.regularExpression, .caseInsensitive]) != nil
    }
}
