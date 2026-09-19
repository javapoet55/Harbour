import SwiftUI
import ContactsUI
import EventKit

struct MomentEditor: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    @Environment(\.dismiss) private var dismiss
    var moment: ImportantMoment? = nil
    var imported: MomentInput? = nil
    var onDone: (() -> Void)? = nil
    @State private var input = MomentInput()
    @State private var date = Date()
    @State private var initialized = false
    @State private var dateConfirmed = true
    @State private var choosingRecipient = false
    @State private var festivalRecipients: [FestivalRecipient] = []
    @State private var savedRecipientIDs: Set<String> = []
    @State private var createdID: String?
    @State private var completedSave = false
    @State private var savedGroup: MomentDisplayGroup?

    private enum Field: Hashable { case title, firstName, phone, email }
    @FocusState private var focusedField: Field?
    var body: some View {
        if completedSave, let createdID,
           let group = savedGroup ?? MomentDisplayGroup.editableGroups(store.moments).first(where: { $0.moments.contains(where: { $0.id == createdID }) }) {
            ManageFestivalView(group: group, store: store, onDone: {
                if let onDone { onDone() } else { dismiss() }
            })
        } else { editor }
    }
    private var editor: some View {
        Form {
            Section("Important moment") {
                Picker("Type", selection: Binding(get: { input.type }, set: { type in
                    let previousType = input.type
                    input.title = MomentTitles.updating(input.title, from: previousType, firstName: input.firstName, to: type, firstName: input.firstName)
                    input.type = type
                    if type == "getWellSoon" { input.yearly = false }
                })) { ForEach(["birthday","anniversary","festival","getWellSoon","custom"], id: \.self) { Text(ImportantMoment.label(for:$0)).tag($0) } }.accessibilityIdentifier("moment-type")
                TextField("Title", text: $input.title).focused($focusedField, equals: .title).submitLabel(.done)
                DatePicker("Date", selection: $date, displayedComponents: .date).environment(\.timeZone, TimeZone(identifier: input.timeZoneID) ?? .current)
                Picker("Time zone", selection: $input.timeZoneID) { ForEach(TimeZone.knownTimeZoneIdentifiers, id: \.self) { Text($0) } }
                if !dateConfirmed { Toggle("I have confirmed the event date", isOn: $dateConfirmed) }
                Toggle("Repeat yearly", isOn: $input.yearly)
                Text("February 29 is observed on February 28 in non-leap years. Dates for festivals with moving calendars must be confirmed each year.").font(.caption)
            }.disabled(completedSave || !savedRecipientIDs.isEmpty)
            Section(input.type == "festival" ? "Recipients" : "Recipient") {
                Button {
                    focusedField = nil
                    choosingRecipient = true
                } label: {
                    Label(input.type == "festival" ? "Choose multiple contacts" : "Choose from Contacts", systemImage: "person.crop.circle.badge.plus")
                }
                if input.type == "festival" && !festivalRecipients.isEmpty {
                    Text("\(festivalRecipients.count) contacts selected").font(.subheadline)
                    ForEach($festivalRecipients) { $recipient in
                        VStack(alignment: .leading) {
                            HStack {
                                Text(recipient.displayName).font(.headline)
                                Spacer()
                                Button(role: .destructive) {
                                    festivalRecipients.removeAll { $0.id == recipient.id }
                                } label: { Image(systemName: "minus.circle") }
                                .buttonStyle(.borderless)
                                .accessibilityLabel("Remove \(recipient.displayName)")
                            }
                            TextField("First name", text: $recipient.firstName).focused($focusedField, equals: .firstName).submitLabel(.done)
                            TextField("Phone (optional)", text: $recipient.phone).keyboardType(.phonePad).focused($focusedField, equals: .phone)
                            TextField("Email (optional)", text: $recipient.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().focused($focusedField, equals: .email)
                        }
                    }
                    Text("A separate festival moment is saved for each person. Review and approve each wish before sending.").font(.caption)
                } else {
                TextField("First name", text: $input.firstName).focused($focusedField, equals: .firstName).submitLabel(.done)
                TextField("Phone (optional)", text: $input.phone).keyboardType(.phonePad).focused($focusedField, equals: .phone)
                TextField("Email (optional)", text: $input.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().focused($focusedField, equals: .email).submitLabel(.done)
                }
                Text("Only the recipient and occasion you confirm here are saved to your Nexdo account. Your address book is never uploaded.").font(.caption)
            }.disabled(completedSave || !savedRecipientIDs.isEmpty)
            if completedSave {
                Text("Your moment is saved. Reload to open its details.").font(.caption)
            } else if !savedRecipientIDs.isEmpty {
                Text("\(savedRecipientIDs.count) recipients saved. Tap Save again to retry the remaining recipients.").font(.caption)
            }
            if let moment { Section { Toggle("Show reminders", isOn: Binding(get: { store.moments.first { $0.id == moment.id }?.enabled ?? moment.enabled }, set: { value in Task { await store.perform { try await store.visibility(moment, enabled: value) } } })) } }
            if let moment, moment.supportsGreetingCard {
                Section("Greeting Card") {MomentGreetingCardSection(moment:moment,store:store)}
            }
            if let error = store.error { Text(error).foregroundStyle(.red) }
            Button(completedSave ? "Open Saved Moment" : input.type == "festival" && !festivalRecipients.isEmpty ? "Save for \(festivalRecipients.count) contacts" : "Save Moment", action: save)
                .disabled(saveDisabled)

        }
        .disabled(store.busy)
        .navigationTitle(moment == nil ? "Create Moment" : "Edit Moment").navigationBarTitleDisplayMode(.inline)
        .onSubmit { focusedField = nil }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: input.firstName) { old, new in
            input.title = MomentTitles.updating(input.title, from: input.type, firstName: old, to: input.type, firstName: new)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save", action: save).disabled(saveDisabled).accessibilityIdentifier("moment-save-top")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
            }
        }
        .sheet(isPresented: $choosingRecipient) {
            if input.type == "festival" {
                FestivalContactsPicker { contacts in
                    for contact in contacts where !festivalRecipients.contains(where: { $0.id == contact.id }) {
                        festivalRecipients.append(contact)
                    }
                    choosingRecipient = false
                }
            } else {
            MomentContactPicker { contact in
                // Selecting a recipient must not change the occasion or its schedule.
                input.firstName = contact.firstName
                input.phone = contact.phone
                input.email = contact.email
                choosingRecipient = false
            }
            }
        }
        .onAppear {
            guard !initialized else { return }; initialized = true
            if let m = moment {
                input.type = m.type; input.title = m.title; input.firstName = m.firstName; input.phone = m.phone; input.email = m.email; input.yearly = m.yearly; input.timeZoneID = m.timeZoneID; input.source = m.source; input.sourceKey = m.sourceKey; input.occurrenceDate = m.occurrenceDate
            } else if let imported { input = imported; dateConfirmed = !imported.occurrenceDate.isEmpty }
            if moment == nil && input.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                input.title = MomentTitles.defaultTitle(for: input.type, firstName: input.firstName) ?? ""
            }
            if !input.occurrenceDate.isEmpty { date = MomentDates.date(input.occurrenceDate, zone: input.timeZoneID) }
        }
    }
    private var saveDisabled: Bool {
        store.busy || !dateConfirmed || input.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    private func save() {
        guard !saveDisabled else { return }
        focusedField = nil
        input.occurrenceDate = MomentDates.day(date, zone: input.timeZoneID)
        Task {
            await store.perform {
                if !completedSave {
                    if input.type == "festival" && !festivalRecipients.isEmpty {
                        for (index, recipient) in festivalRecipients.enumerated() where !savedRecipientIDs.contains(recipient.id) {
                            var value = input
                            value.firstName = recipient.firstName; value.phone = recipient.phone; value.email = recipient.email
                            value.source = "manual"
                            value.sourceKey = "festival:" + TaskActionCoordinator.ownerKey(input.sourceKey + ":" + recipient.id)
                            let id = try await store.save(value, id: index == 0 ? moment?.id : nil)
                            if createdID == nil { createdID = id }
                            savedRecipientIDs.insert(recipient.id)
                        }
                    } else { createdID = try await store.save(input, id: moment?.id) }
                    savedGroup = MomentDisplayGroup.editableGroups(store.moments).first {
                        $0.moments.contains { $0.id == createdID }
                    }
                    completedSave = true
                }
                if moment != nil || input.type == "custom" { dismiss() }
                // perform refreshes the snapshot; body then shows the saved moment's four-tab manager.
            }
        }
    }
}
struct FestivalRecipient: Identifiable {
    let id: String
    let displayName: String
    var firstName, phone, email: String
}
/// Implementing the plural delegate method enables Apple's multi-contact selection.
struct FestivalContactsPicker: UIViewControllerRepresentable {
    let selected: ([FestivalRecipient]) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(selected) }
    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let picker = CNContactPickerViewController()
        picker.delegate = context.coordinator
        picker.displayedPropertyKeys = [CNContactGivenNameKey, CNContactFamilyNameKey, CNContactPhoneNumbersKey, CNContactEmailAddressesKey]
        return picker
    }
    func updateUIViewController(_ controller: CNContactPickerViewController, context: Context) {}
    @MainActor final class Coordinator: NSObject, @preconcurrency CNContactPickerDelegate {
        let selected: ([FestivalRecipient]) -> Void
        init(_ selected: @escaping ([FestivalRecipient]) -> Void) { self.selected = selected }
        func contactPicker(_ picker: CNContactPickerViewController, didSelect contacts: [CNContact]) {
            selected(contacts.map { contact in
                let name = CNContactFormatter.string(from: contact, style: .fullName) ?? "Contact"
                return FestivalRecipient(
                    id: TaskActionCoordinator.ownerKey(contact.identifier),
                    displayName: name,
                    firstName: contact.givenName.isEmpty ? name : contact.givenName,
                    phone: contact.isKeyAvailable(CNContactPhoneNumbersKey) ? contact.phoneNumbers.first?.value.stringValue ?? "" : "",
                    email: contact.isKeyAvailable(CNContactEmailAddressesKey) ? contact.emailAddresses.first.map { String($0.value) } ?? "" : ""
                )
            })
        }
    }
}
struct MomentSettingsView: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    @StateObject private var oauth = MomentEmailOAuth()
    @State private var contacts = false
    @State private var explainContacts = false
    @State private var delete = false
    @State private var selectedContact: MomentImport?
    var body: some View {
        Form {
            Section("Import only what you choose") {
                Button("Choose a contact birthday") { explainContacts = true }
                NavigationLink("Choose calendars and anniversary candidates") { MomentCalendarImportView() }
                NavigationLink("Choose festivals") { MomentFestivalView() }
                Text("No religion or festival preferences are inferred. Imported items require your confirmation before saving.").font(.caption)
            }
            Section("Connected email") {
                if let account = store.snapshot?.emailAccount { Text(account.email); Text(account.status); Button("Disconnect email", role: .destructive) { Task { await store.perform { let _: MomentOK = try await store.request("disconnectEmail", [String:String]()) } } } }
                Button("Connect / Reconnect Gmail") { Task { await store.perform { try await oauth.connect(store) } } }.disabled(store.snapshot?.emailConfigured != true)
                Text("Authorize sending from your own Gmail account. Scheduled email also requires Nexdo’s backend worker.").font(.caption)
            }
            Section("Notifications") {
                Label(store.reminderStatusText, systemImage: store.reminderAuthorization == .denied ? "bell.slash" : "bell.badge")
                if store.enablingReminders {
                    ProgressView("Enabling reminders…")
                } else if store.reminderAuthorization == .notDetermined {
                    Button("Enable wish reminders") { Task { await store.enableWishReminders() } }
                }
                Text("Reminders are on by default once you allow iOS notifications. They apply to wishes you schedule; enabling them does not send messages.").font(.caption)
                Button("Open iOS Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
                Text("Reminders require notifications. Denied or limited Contacts and Calendar access can be changed in iOS Settings.").font(.caption)
            }
            Section("Privacy") { Button("Delete all Important Moments data", role: .destructive) { delete = true }; Text("Deletes moments, drafts, delivery history and the connected email credentials. An email already submitted cannot be recalled.").font(.caption) }
            if let error = store.error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("Moments Settings").navigationBarTitleDisplayMode(.inline)
        .task { await store.prepareDefaultReminders() }
        .alert("Select one contact", isPresented: $explainContacts) { Button("Choose contact") { contacts = true }; Button("Cancel", role: .cancel) {} } message: { Text("Nexdo will show the selected birthday, first name, phone and email for you to review. Only the details you save will be sent to your Nexdo account.") }
        .sheet(isPresented: $contacts) { MomentContactPicker { input in contacts = false; selectedContact = MomentImport(input: input) } }
        .sheet(item: $selectedContact) { item in NavigationStack { MomentEditor(imported: item.input).toolbar { Button("Close") { selectedContact = nil } } }.environmentObject(store) }
        .confirmationDialog("Delete all moments and cancel pending wishes?", isPresented: $delete, titleVisibility: .visible) { Button("Delete all", role: .destructive) { Task { await store.perform { try await store.deleteData() } } } }
    }
}
struct MomentImport: Identifiable { let id = UUID(); let input: MomentInput }
struct MomentContactPicker: UIViewControllerRepresentable {
    let selected: (MomentInput) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(selected) }
    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let controller = CNContactPickerViewController(); controller.delegate = context.coordinator
        controller.displayedPropertyKeys = [CNContactBirthdayKey, CNContactPhoneNumbersKey, CNContactEmailAddressesKey]; return controller
    }
    func updateUIViewController(_ uiViewController: CNContactPickerViewController, context: Context) {}
    @MainActor final class Coordinator: NSObject, @preconcurrency CNContactPickerDelegate {
        let selected: (MomentInput) -> Void
        init(_ selected: @escaping (MomentInput) -> Void) { self.selected = selected }
        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            var input = MomentInput(); input.firstName = contact.givenName; input.title = "\(contact.givenName.isEmpty ? "Contact" : contact.givenName)’s Birthday"
            input.phone = contact.isKeyAvailable(CNContactPhoneNumbersKey) ? contact.phoneNumbers.first?.value.stringValue ?? "" : ""; input.email = contact.isKeyAvailable(CNContactEmailAddressesKey) ? contact.emailAddresses.first.map { String($0.value) } ?? "" : ""
            input.source = "contacts"; input.sourceKey = "contact:" + TaskActionCoordinator.ownerKey(contact.identifier) + ":birthday"
            if contact.isKeyAvailable(CNContactBirthdayKey), let birthday = contact.birthday, let month = birthday.month, let day = birthday.day { input.occurrenceDate = String(format: "2000-%02d-%02d", month, day) }
            let snapshot = input
            let identifier = contact.identifier
            Task { @MainActor in
                // CNContactPicker supplies a user-selected snapshot without bulk permission.
                // If Contacts access is already granted, refresh only that selected identifier.
                let refreshed = try? await SelectedMomentContacts().read(identifier: identifier)
                selected(refreshed ?? snapshot)
            }
        }
    }
}
struct CalendarMomentCandidate: Identifiable, Sendable { let id, title: String; let date: Date }
struct MomentCalendarChoice: Identifiable, Sendable { let id, title: String }
actor MomentCalendarService {
    private let store = EKEventStore()
    func calendars() async throws -> [MomentCalendarChoice] {
        guard try await store.requestFullAccessToEvents() else { throw TaskActionServiceError.contactsDenied }
        return store.calendars(for: .event).map { MomentCalendarChoice(id: $0.calendarIdentifier, title: $0.title) }
    }
    func candidates(calendarID: String) -> [CalendarMomentCandidate] {
        guard let calendar = store.calendar(withIdentifier: calendarID) else { return [] }
        let start = Calendar.current.startOfDay(for: Date()), end = Calendar.current.date(byAdding: .year, value: 1, to: Date())!
        return store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: [calendar])).filter { event in let title = event.title ?? ""; return event.hasRecurrenceRules && (title.localizedCaseInsensitiveContains("anniversary") || title.localizedCaseInsensitiveContains("birthday")) }.prefix(100).map { CalendarMomentCandidate(id: $0.eventIdentifier ?? UUID().uuidString, title: $0.title ?? "Calendar moment", date: $0.startDate) }
    }
}
struct MomentCalendarImportView: View {
    private let service = MomentCalendarService()
    @State private var calendars: [MomentCalendarChoice] = []
    @State private var candidates: [CalendarMomentCandidate] = []
    @State private var error: String?
    @State private var loading = false
    var body: some View {
        List {
            Text("Nexdo reads only the calendar you choose to suggest recurring birthday or anniversary candidates. You review each candidate before saving. Calendar access stays on this device.")
            Button("Allow calendar access") { Task {
                loading = true; defer { loading = false }
                do { calendars = try await service.calendars() } catch { self.error = "Calendar access is unavailable. Enable Calendar access for Nexdo in iOS Settings." }
            } }
            ForEach(calendars) { calendar in Button(calendar.title) { Task { candidates = await service.candidates(calendarID: calendar.id) } } }
            if loading { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
            Section("Review candidates") { ForEach(candidates) { item in NavigationLink(item.title) { MomentEditor(imported: input(item)) } }; if candidates.isEmpty { Text("No candidates loaded. Select a calendar, or add a moment manually.").foregroundStyle(.secondary) } }
        }.navigationTitle("Calendar Moments")
    }
    private func input(_ c: CalendarMomentCandidate) -> MomentInput {
        var input = MomentInput(); input.type = c.title.localizedCaseInsensitiveContains("birthday") ? "birthday" : "anniversary"; input.title = c.title; input.source = "calendar"; input.sourceKey = "calendar:" + TaskActionCoordinator.ownerKey(c.id); input.occurrenceDate = MomentDates.day(c.date, zone: input.timeZoneID); return input
    }
}
struct MomentFestivalView: View {
    @State private var region = "Choose region"
    private let festivals = ["Global": ["New Year", "International Friendship Day"], "India": ["Diwali", "Holi", "Eid", "Pongal"], "United States": ["Thanksgiving", "Christmas"], "East Asia": ["Lunar New Year", "Mid-Autumn Festival"]]
    var body: some View {
        List {
            Text("Choose the region and celebrations you observe. Confirm the festival date and recipient yourself. Moving festival dates are not automatically guessed.")
            Picker("Region", selection: $region) { Text("Choose region"); ForEach(festivals.keys.sorted(), id: \.self) { Text($0) } }
            ForEach(festivals[region] ?? [], id: \.self) { name in NavigationLink(name) { MomentEditor(imported: input(name)) } }
        }.navigationTitle("Choose Festivals")
    }
    private func input(_ name: String) -> MomentInput { var input = MomentInput(); input.type = "festival"; input.title = name + " Wishes"; input.yearly = false; input.source = "festivalCatalog"; return input }
}

actor SelectedMomentContacts {
    private let store = CNContactStore()
    func read(identifier: String) throws -> MomentInput {
        let status = CNContactStore.authorizationStatus(for: .contacts)
        var allowed = status == .authorized
        if #available(iOS 18, *) { allowed = allowed || status == .limited }
        guard allowed else { throw TaskActionServiceError.contactsDenied }
        let contact = try store.unifiedContact(withIdentifier: identifier, keysToFetch: [CNContactGivenNameKey as CNKeyDescriptor, CNContactBirthdayKey as CNKeyDescriptor, CNContactPhoneNumbersKey as CNKeyDescriptor, CNContactEmailAddressesKey as CNKeyDescriptor])
        var input = MomentInput()
        input.firstName = contact.givenName; input.title = "\(contact.givenName.isEmpty ? "Contact" : contact.givenName)’s Birthday"
        input.phone = contact.phoneNumbers.first?.value.stringValue ?? ""; input.email = contact.emailAddresses.first.map { String($0.value) } ?? ""
        input.source = "contacts"; input.sourceKey = "contact:" + TaskActionCoordinator.ownerKey(identifier) + ":birthday"
        if let month = contact.birthday?.month, let day = contact.birthday?.day { input.occurrenceDate = String(format: "2000-%02d-%02d", month, day) }
        return input
    }
}
