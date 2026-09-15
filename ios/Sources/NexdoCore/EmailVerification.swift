import Foundation

public struct RegistrationResponse: Decodable, Sendable {
    public let email: String
    public let emailVerificationRequired: Bool?
    public let emailSent: Bool?
}

public struct CodeDeliveryResponse: Decodable, Sendable {
    public let message: String
    public let delivered: Bool
}

/// An account that must confirm its emailed code before the server starts a session.
public struct PendingEmailVerification: Identifiable, Hashable, Sendable {
    public enum Reason: Hashable, Sendable {
        case codeSent, codeNotSent, signInRequiresVerification
    }
    public let email: String
    public let reason: Reason
    public var id: String { email }
    public init(email: String, reason: Reason) {
        self.email = email
        self.reason = reason
    }
}

public enum VerificationCode {
    public static let length = 6
    public static func sanitized(_ value: String) -> String {
        String(value.filter { $0.isASCII && $0.isNumber }.prefix(length))
    }
    public static func isComplete(_ value: String) -> Bool {
        value.count == length && value.allSatisfy { $0.isASCII && $0.isNumber }
    }
}
