import Contacts
import ContactsUI
import SwiftUI
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
        var access: PermissionAccess.Status = status == .authorized ? .authorized : .denied
        if #available(iOS 18, *), status == .limited { access = .limited }
        guard PermissionAccess.decision(for: .contacts, status: access) == .allow else { throw TaskActionServiceError.contactsDenied }
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
        return contacts.map { ActionContact.from($0, fallbackName: name) }
    }
}


extension ActionContact {
    /// A contact with each number's and address's own label ("mobile", "work"), as Contacts shows them. Picked
    /// contacts used to be labeled "Phone" and "Email" whatever they were, so two numbers could not be told apart.
    static func from(_ contact: CNContact, fallbackName: String) -> ActionContact {
        ActionContact(id: contact.identifier, name: CNContactFormatter.string(from: contact, style: .fullName) ?? fallbackName,
            phones: contact.phoneNumbers.map {
                .init(id: $0.identifier, label: $0.label.map(CNLabeledValue<NSString>.localizedString(forLabel:)) ?? "Phone", value: $0.value.stringValue)
            }, emails: contact.emailAddresses.map {
                .init(id: $0.identifier, label: $0.label.map(CNLabeledValue<NSString>.localizedString(forLabel:)) ?? "Email", value: String($0.value))
            })
    }
    static func selected(_ contact: CNContact) -> ActionContact { from(contact, fallbackName: "Selected contact") }
    static func manual(_ value: TaskActionRecipient) -> ActionContact {
        ActionContact(id: "manual", name: value.name,
            phones: value.phone.isEmpty ? [] : [.init(id: "phone", label: "Phone", value: value.phone)],
            emails: value.email.isEmpty ? [] : [.init(id: "email", label: "Email", value: value.email)])
    }
    static func business(_ value: TaskAgentRun.Candidate) -> ActionContact {
        ActionContact(id: value.id, name: value.name,
            phones: value.phone.isEmpty ? [] : [.init(id: "phone", label: "Phone", value: value.phone)], emails: [])
    }
}

struct ActionContactPicker: UIViewControllerRepresentable {
    let selected: (ActionContact) -> Void
    let cancelled: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let controller = CNContactPickerViewController()
        controller.delegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: CNContactPickerViewController, context: Context) {}
    @MainActor final class Coordinator: NSObject, @preconcurrency CNContactPickerDelegate {
        let parent: ActionContactPicker
        init(parent: ActionContactPicker) { self.parent = parent }
        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) { parent.selected(.selected(contact)) }
        func contactPickerDidCancel(_ picker: CNContactPickerViewController) { parent.cancelled() }
    }
}
