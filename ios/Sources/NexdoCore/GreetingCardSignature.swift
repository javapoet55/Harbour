import Foundation

public enum GreetingCardSignature {
    public static func defaultValue(profileName: String) -> String {
        guard let first = profileName.split(whereSeparator: { $0.isWhitespace }).first else { return "With love, your family" }
        return String("With love, \(first) & family".prefix(80))
    }
}
