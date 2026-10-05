import Foundation

/// A card only offers communication after a recipient and address are available.
public enum ActionNeededState: Equatable, Sendable {
    case loading, retry, findBusiness, chooseBusiness, chooseContact
    case ready([TaskActionChannel])

    public static func resolve(loaded: Bool, failed: Bool, business: Bool, hasResults: Bool,
                               hasRecipient: Bool, hasPhone: Bool, hasEmail: Bool) -> Self {
        if hasRecipient {
            let channels = channels(hasPhone: hasPhone, hasEmail: hasEmail)
            if !channels.isEmpty { return .ready(channels) }
        }
        if !loaded { return failed ? .retry : .loading }
        if business { return hasResults ? .chooseBusiness : .findBusiness }
        return .chooseContact
    }
    public static func channels(hasPhone: Bool, hasEmail: Bool) -> [TaskActionChannel] {
        (hasPhone ? [.call, .message] : []) + (hasEmail ? [.email] : [])
    }
}

/// User-entered contact information. Google business details are fetched fresh by ID instead.
public struct TaskActionRecipient: Codable, Equatable, Sendable {
    public var name: String
    public var phone: String
    public var email: String
    public static func isValid(name: String, phone: String, email: String) -> Bool {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let phone = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let phoneValid = phone.isEmpty || (phone.filter(\.isNumber).count >= 3 && phone.allSatisfy { "+0123456789 ()-.".contains($0) })
        let emailValid = email.isEmpty || email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
        return !name.isEmpty && (!phone.isEmpty || !email.isEmpty) && phoneValid && emailValid
    }
    public init(name: String, phone: String, email: String) {
        self.name = name; self.phone = phone; self.email = email
    }
}
