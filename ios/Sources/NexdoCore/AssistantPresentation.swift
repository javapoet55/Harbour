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
    public static func taskTitleMatches(_ title: String, text: String) -> Bool {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "^\\d+[.)]\\s*", with: "", options: .regularExpression)
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return false }
        return value.caseInsensitiveCompare(name) == .orderedSame ||
            value.range(of: "^" + NSRegularExpression.escapedPattern(for: name) + "(?:\\s+[—–-]\\s+|[:,.]\\s+|\\s+is\\s+)", options: [.regularExpression, .caseInsensitive]) != nil
    }
}
