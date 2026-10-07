import Foundation

/// Presentation only: inferred categories never change persisted task data.
public struct TaskCategoryAppearance: Equatable, Sendable {
    public enum Kind: String, CaseIterable, Sendable {
        case fitness, dental, health, school, work, shopping, food, travel, finance, home, social, general
    }
    public let kind: Kind
    public let label: String
    public static func resolve(title: String, categoryName: String? = nil) -> Self {
        let explicit = categoryName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let kind = infer(title) ?? explicit.flatMap(infer) ?? .general
        return Self(kind: kind, label: explicit.flatMap { $0.isEmpty ? nil : $0 } ?? kind.defaultLabel)
    }
    private static func infer(_ text: String) -> Kind? {
        let words = text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
        let tokens = Set(words)
        let normalized = " " + words.joined(separator: " ") + " "
        let rules: [(Kind, [String])] = [
            (.dental, ["dentist", "dental", "tooth", "teeth", "orthodontist", "orthodontic"]),
            (.school, ["school", "homework", "study", "studying", "exam", "assignment", "class", "lecture", "tuition", "course"]),
            (.finance, ["payroll", "invoice", "invoices", "tax", "taxes", "budget", "bank", "banking", "mortgage", "rent", "expense", "expenses", "bills"]),
            (.fitness, ["fitness", "gym", "workout", "workouts", "weightlifting", "exercise", "yoga", "pilates", "running", "jogging", "swimming", "cycling", "go for a run", "lift weights"]),
            (.health, ["health", "doctor", "hospital", "medical", "medicine", "medication", "pharmacy", "therapy", "checkup", "check up", "vaccination"]),
            (.shopping, ["groceries", "grocery", "shopping", "supermarket", "buy", "purchase"]),
            (.food, ["breakfast", "lunch", "dinner", "cook", "cooking", "restaurant", "meal", "baking"]),
            (.travel, ["travel", "flight", "airport", "hotel", "vacation", "trip", "train", "passport"]),
            (.work, ["work", "meeting", "sync", "presentation", "report", "project", "client", "office", "email", "call", "deadline", "interview"]),
            (.home, ["home", "house", "laundry", "clean", "cleaning", "garden", "gardening", "repair", "plumber"]),
            (.social, ["birthday", "party", "friends", "family", "wedding", "anniversary", "visit"]),
        ]
        return rules.first { _, keywords in
            keywords.contains { $0.contains(" ") ? normalized.contains(" " + $0 + " ") : tokens.contains($0) }
        }?.0
    }
}
private extension TaskCategoryAppearance.Kind {
    var defaultLabel: String {
        switch self {
        case .fitness, .health: "Health"
        case .dental: "Personal"
        case .school: "School"
        case .work: "Work"
        case .shopping: "Shopping"
        case .food: "Food"
        case .travel: "Travel"
        case .finance: "Finance"
        case .home: "Home"
        case .social: "Personal"
        case .general: "Tasks"
        }
    }
}

/// The Tasks row icon for a title. A keyword matches a whole word, or the word with a common ending ("calls",
/// "calling", "plumber", "meetings"); a plain substring test gave "recall" the phone. Same rule as Android (81d70f5).
public enum TaskRowIcon {
    public static func symbol(for title: String) -> String {
        let words = title.lowercased().split(whereSeparator: { !($0.isLetter || $0.isNumber) }).map(String.init)
        func has(_ stems: String...) -> Bool {
            stems.contains { stem in words.contains { $0 == stem || ($0.hasPrefix(stem) && ["s", "es", "ed", "ing", "er", "ers"].contains(String($0.dropFirst(stem.count)))) } }
        }
        if has("email", "message") { return "envelope" }
        if has("plumb", "repair", "handyman", "electrician") { return "wrench" }
        if has("call", "contact") { return "phone" }
        if has("laptop", "computer") { return "laptopcomputer" }
        if has("meeting", "appointment") { return "calendar" }
        return "doc.text"
    }
}
