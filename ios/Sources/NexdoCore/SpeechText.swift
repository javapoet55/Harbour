import Foundation

public enum SpeechText {
    /// Keep every request below the server's 4,000 UTF-16-unit limit,
    /// preserving the full answer and preferring word boundaries.
    public static func chunks(_ text: String) -> [String] {
        var result: [String] = []
        var remaining = text[...]
        while !remaining.isEmpty {
            var end = remaining.startIndex
            var boundary: String.Index?
            var length = 0
            while end < remaining.endIndex {
                let next = remaining.index(after: end)
                let size = remaining[end..<next].utf16.count
                if length + size > 3500 { break }
                length += size
                if remaining[end].isWhitespace { boundary = next }
                end = next
            }
            // A pathological extended grapheme may exceed the limit by itself.
            if end == remaining.startIndex { end = remaining.unicodeScalars.index(after: end) }
            else if end != remaining.endIndex, let boundary { end = boundary }
            let chunk = String(remaining[..<end])
            if !chunk.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { result.append(chunk) }
            remaining = remaining[end...]
        }
        return result
    }
}
