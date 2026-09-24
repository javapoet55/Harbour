import SwiftUI

/// What the Recipients list asked for: pick from Contacts, type a new person, or edit one (by key).
enum RecipientAction: Equatable { case contacts, manual, edit(String) }

/// The Add / Edit Recipient sheet, shared by Create Moment and Manage Moment.
struct RecipientSheet: View {
    @State var draft: RecipientDraft
    let editing: Bool
    /// The moment's other recipients, for the duplicate check.
    let others: [ManagedFestivalRecipient]
    let save: (RecipientDraft) -> Void
    let cancel: () -> Void
    @State private var issue: String?
    private enum Field: Hashable { case name, phone, email }
    @FocusState private var focused: Field?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $draft.name).textContentType(.name).focused($focused, equals: .name).submitLabel(.next).onSubmit { focused = .phone }
                        .accessibilityIdentifier("recipient-name")
                    TextField("Phone", text: $draft.phone).keyboardType(.phonePad).textContentType(.telephoneNumber).focused($focused, equals: .phone)
                        .accessibilityIdentifier("recipient-phone")
                    if draft.phoneChoices.count > 1 { choices(draft.phoneChoices, selection: $draft.phone, label: "Use phone") }
                    TextField("Email", text: $draft.email).keyboardType(.emailAddress).textContentType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focused, equals: .email).submitLabel(.done).onSubmit { focused = nil }
                        .accessibilityIdentifier("recipient-email")
                    if draft.emailChoices.count > 1 { choices(draft.emailChoices, selection: $draft.email, label: "Use email") }
                } footer: {
                    Text("Add a phone number, an email, or both.")
                }
                if let issue { Text(issue).foregroundStyle(.red).accessibilityIdentifier("recipient-error") }
            }
            .navigationTitle(editing ? "Edit Recipient" : "Add Recipient").navigationBarTitleDisplayMode(.inline)
            .onChange(of: [draft.name, draft.phone, draft.email]) { _, _ in issue = nil }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: cancel) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing ? "Save" : "Add") {
                        if let problem = draft.issue(among: others) { issue = problem } else { save(draft) }
                    }.accessibilityIdentifier("recipient-confirm")
                }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focused = nil } }
            }
        }
    }
    /// The contact's numbers or addresses as quick choices; the field above stays editable.
    private func choices(_ values: [String], selection: Binding<String>, label: String) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(values, id: \.self) { value in
                    Button(value) { selection.wrappedValue = value }
                        .buttonStyle(.bordered).tint(selection.wrappedValue == value ? Color.nexdoIndigo : .secondary)
                        .accessibilityLabel("\(label) \(value)")
                        .accessibilityAddTraits(selection.wrappedValue == value ? .isSelected : [])
                }
            }
        }
    }
}

/// Presents Contacts and the recipient sheet for a Recipients list. `save` receives the new or edited recipient and,
/// when editing, the recipient before the edit.
private struct RecipientSheets: ViewModifier {
    @Binding var action: RecipientAction?
    let recipients: [ManagedFestivalRecipient]
    let save: (ManagedFestivalRecipient, ManagedFestivalRecipient?) -> Void
    private struct Item: Identifiable { let id = UUID(); let draft: RecipientDraft; let editing: ManagedFestivalRecipient? }
    @State private var picking = false
    @State private var queue: [FestivalContactChoice] = []
    @State private var item: Item?
    /// The picked contact's numbers and addresses, by recipient key, so Edit offers them again this session.
    @State private var contactChoices: [String: (phones: [String], emails: [String])] = [:]
    func body(content: Content) -> some View {
        content
            .onChange(of: action) { _, value in
                guard let value else { return }
                action = nil
                switch value {
                case .contacts: picking = true
                case .manual: item = Item(draft: RecipientDraft(), editing: nil)
                case .edit(let key):
                    guard let recipient = recipients.first(where: { $0.key == key }) else { return }
                    let known = contactChoices[key]
                    item = Item(draft: RecipientDraft(editing: recipient, phones: known?.phones ?? [], emails: known?.emails ?? []), editing: recipient)
                }
            }
            .sheet(isPresented: $picking, onDismiss: next) { ManagedFestivalContactsPicker { values in queue = values; picking = false } }
            .sheet(item: $item, onDismiss: next) { item in
                RecipientSheet(draft: item.draft, editing: item.editing != nil, others: recipients.filter { $0.key != item.editing?.key }, save: { draft in
                    ContactAddressLinkStore.update { $0.record(draft, previous: item.editing) }
                    let recipient = draft.recipient(updating: item.editing)
                    if !draft.phoneChoices.isEmpty || !draft.emailChoices.isEmpty { contactChoices[recipient.key] = (draft.phoneChoices, draft.emailChoices) }
                    save(recipient, item.editing)
                    self.item = nil
                }, cancel: { queue = []; self.item = nil })
            }
    }
    /// Opens the next contact picked from Contacts, one sheet each.
    private func next() {
        guard item == nil, !queue.isEmpty else { return }
        let choice = queue.removeFirst()
        item = Item(draft: RecipientDraft(contact: choice.id, name: choice.name, phones: choice.phones, emails: choice.emails), editing: nil)
    }
}
extension View {
    func recipientSheets(action: Binding<RecipientAction?>, recipients: [ManagedFestivalRecipient], save: @escaping (ManagedFestivalRecipient, ManagedFestivalRecipient?) -> Void) -> some View {
        modifier(RecipientSheets(action: action, recipients: recipients, save: save))
    }
}

/// This device's record of which saved addresses were taken from a contact card (see ContactAddressLinks).
@MainActor enum ContactAddressLinkStore {
    private static let key = "nexdo.moments.contactAddressLinks"
    static var links: ContactAddressLinks { ContactAddressLinks(entries: UserDefaults.standard.dictionary(forKey: key) as? [String: Bool] ?? [:]) }
    static func update(_ change: (inout ContactAddressLinks) -> Void) {
        var value = links
        change(&value)
        UserDefaults.standard.set(value.entries, forKey: key)
    }
}
