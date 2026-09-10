import Contacts
import Foundation

struct ActionContact: Identifiable, Sendable {
    struct Address: Identifiable, Sendable {
        let id: String
        let label: String
        let value: String
    }
    let id: String
    let name: String
    let phones: [Address]
    let emails: [Address]
}
protocol TaskActionContactResolver: Sendable {
    func resolve(name: String, identifier: String?) async throws -> [ActionContact]
}
actor AppleTaskActionContacts: TaskActionContactResolver {
    private let store = CNContactStore()
    func resolve(name: String, identifier: String?) async throws -> [ActionContact] {
        if CNContactStore.authorizationStatus(for: .contacts) == .notDetermined {
            _ = try await store.requestAccess(for: .contacts)
        }
        let status = CNContactStore.authorizationStatus(for: .contacts)
        var permitted = status == .authorized
        if #available(iOS 18, *) { permitted = permitted || status == .limited }
        guard permitted else { throw TaskActionServiceError.contactsDenied }
        let keys: [CNKeyDescriptor] = [CNContactIdentifierKey as CNKeyDescriptor,
            CNContactFormatter.descriptorForRequiredKeys(for: .fullName), CNContactPhoneNumbersKey as CNKeyDescriptor,
            CNContactEmailAddressesKey as CNKeyDescriptor]
        var contacts: [CNContact] = []
        if let identifier, let saved = try? store.unifiedContact(withIdentifier: identifier, keysToFetch: keys) {
            contacts = [saved]
        } else {
            contacts = try store.unifiedContacts(matching: CNContact.predicateForContacts(matchingName: name), keysToFetch: keys)
        }
        guard !contacts.isEmpty else { throw TaskActionServiceError.noContact }
        return contacts.map { contact in
            ActionContact(id: contact.identifier, name: CNContactFormatter.string(from: contact, style: .fullName) ?? name,
                phones: contact.phoneNumbers.map {
                    ActionContact.Address(id: $0.identifier, label: $0.label.map(CNLabeledValue<NSString>.localizedString(forLabel:)) ?? "Phone", value: $0.value.stringValue)
                }, emails: contact.emailAddresses.map {
                    ActionContact.Address(id: $0.identifier, label: $0.label.map(CNLabeledValue<NSString>.localizedString(forLabel:)) ?? "Email", value: String($0.value))
                })
        }
    }
}
