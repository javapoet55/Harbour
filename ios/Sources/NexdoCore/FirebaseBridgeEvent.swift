import Foundation

/// Validates the narrow JavaScript -> native logEvent contract before calling Firebase.
public struct FirebaseBridgeEvent {
    public let name: String
    public let parameters: [String: Any]
    private static func validName(_ value: String) -> Bool {
        value.range(of: "^[A-Za-z][A-Za-z0-9_]{0,39}$", options: .regularExpression) != nil
        && !["firebase_", "google_", "ga_"].contains(where: value.hasPrefix)
    }
    public init?(body: Any) {
        guard let body = body as? [String: Any], body["command"] as? String == "logEvent",
              let name = body["name"] as? String, Self.validName(name) else { return nil }
        let parameters: [String: Any]
        if let supplied = body["parameters"] {
            guard let dictionary = supplied as? [String: Any] else { return nil }
            parameters = dictionary
        } else { parameters = [:] }
        guard parameters.count <= 25 else { return nil }
        for (key, value) in parameters {
            guard Self.validName(key) else { return nil }
            if let string = value as? String { guard string.count <= 100 else { return nil } }
            else if let number = value as? NSNumber { guard number.doubleValue.isFinite else { return nil } }
            else { return nil }
        }
        self.name = name; self.parameters = parameters
    }
}
