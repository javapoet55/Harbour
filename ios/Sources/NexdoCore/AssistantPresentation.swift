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
