import Foundation

/// Conservative English V1 parser. Missing/ambiguous times remain unscheduled.
public struct DeterministicTaskActionDetector: TaskActionDetector {
    public init() {}
    public func detect(title: String, now: Date = Date(), timeZone: TimeZone = .current) -> DetectedTaskAction? {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let regex = try? NSRegularExpression(pattern: #"^(contact|call|email|message|text|follow\s+up\s+with)\s+(.+)$"#, options: .caseInsensitive),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let verbRange = Range(match.range(at: 1), in: text), let tailRange = Range(match.range(at: 2), in: text) else { return nil }
        let verb = text[verbRange].lowercased()
        let tail = String(text[tailRange])
        guard tail.range(of: #"^(?:at|about|regarding|today|tomorrow|tonight|on)\b"#, options: [.regularExpression, .caseInsensitive]) == nil else { return nil }
        let separators = #"\s+(?:to\s+(?:confirm|discuss|arrange|review)\b|at\b|about\b|regarding\b|on\b|today\b|tomorrow\b|tonight\b|this\b|next\b|monday\b|tuesday\b|wednesday\b|thursday\b|friday\b|saturday\b|sunday\b)"#
        let nameEnd = tail.range(of: separators, options: [.regularExpression, .caseInsensitive])?.lowerBound ?? tail.endIndex
        let name = String(tail[..<nameEnd]).trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
        guard !name.isEmpty, name.count <= 100, name.split(separator: " ").count <= 5,
              name.rangeOfCharacter(from: .letters) != nil else { return nil }
        let intent: TaskActionIntent = verb == "call" ? .call : verb == "email" ? .email : ["message", "text"].contains(verb) ? .message : verb.hasPrefix("follow") ? .followUp : .contact
        let channel: TaskActionChannel? = intent == .call ? .call : intent == .email ? .email : intent == .message ? .message : nil
        let suffix = String(tail[nameEnd...])
        var context: String?
        if let about = suffix.range(of: #"\b(?:about|regarding|to(?=\s+(?:confirm|discuss|arrange|review)\b))\s+"#, options: [.regularExpression, .caseInsensitive]) {
            var value = String(suffix[about.upperBound...])
            if let time = value.range(of: #"\s+(?:at\s+\d|tomorrow\b|tonight\b|on\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))"#, options: [.regularExpression, .caseInsensitive]) {
                value = String(value[..<time.lowerBound])
            }
            value = value.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
            if !value.isEmpty { context = value }
        }
        return DetectedTaskAction(intent: intent, contactName: name, preferredAction: channel,
                                  scheduledAt: parseTime(suffix, now: now, timeZone: timeZone), context: context)
    }

    private func parseTime(_ value: String, now: Date, timeZone: TimeZone) -> Date? {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timeZone
        let lower = value.lowercased()
        var hour: Int?; var minute = 0
        let pattern = #"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b"#
        if let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
           let match = re.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)),
           let h = Range(match.range(at: 1), in: value), let meridian = Range(match.range(at: 3), in: value),
           let number = Int(value[h]), (1...12).contains(number) {
            if let m = Range(match.range(at: 2), in: value) { minute = Int(value[m]) ?? 0 }
            guard minute < 60 else { return nil }
            hour = number % 12 + (value[meridian].lowercased().hasPrefix("p") ? 12 : 0)
        } else if lower.contains("morning") { hour = 9 }
        else if lower.contains("afternoon") { hour = 14 }
        else if lower.contains("tonight") || lower.contains("evening") { hour = 19 }
        let weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        var day = calendar.startOfDay(for: now)
        var explicitDay = false
        if lower.contains("tomorrow") { day = calendar.date(byAdding: .day, value: 1, to: day)!; explicitDay = true }
        else if let index = weekdays.firstIndex(where: { lower.range(of: "\\b" + $0 + "\\b", options: .regularExpression) != nil }) {
            var delta = (index + 1 - calendar.component(.weekday, from: now) + 7) % 7
            if lower.contains("next ") && delta == 0 { delta = 7 }
            day = calendar.date(byAdding: .day, value: delta, to: day)!; explicitDay = true
            if hour == nil { hour = 9 }
        } else if lower.contains("today") || lower.contains("tonight") { explicitDay = true }
        guard let hour else { return nil }
        guard var result = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) else { return nil }
        if !explicitDay && result <= now { result = calendar.date(byAdding: .day, value: 1, to: result)! }
        return result
    }
}
