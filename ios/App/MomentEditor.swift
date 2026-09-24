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
    @State private var date = Calendar.current.date(byAdding:.day,value:1,to:Date()) ?? Date().addingTimeInterval(86_400)
    @State private var initialized = false
    @State private var dateConfirmed = true
    /// Create Moment's recipients, all saved with the new moment.
    @State private var recipients: [ManagedFestivalRecipient] = []
    @State private var recipientAction: RecipientAction?
    /// The new moment's group settings, kept so Save can be retried onto the same group.
    @State private var groupSettings = FestivalSettings()
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
                Picker("Type", selection: Binding(get: { input.type }, set: { input.choose(type: $0) })) { ForEach(["birthday","anniversary","festival","getWellSoon","custom"], id: \.self) { Text(ImportantMoment.label(for:$0)).tag($0) } }.accessibilityIdentifier("moment-type")
                TextField("Title", text: $input.title).focused($focusedField, equals: .title).submitLabel(.done)
                DatePicker("Date", selection: $date, displayedComponents: .date).environment(\.timeZone, TimeZone(identifier: input.timeZoneID) ?? .current)
                if MomentDates.day(date,zone:input.timeZoneID) < MomentDates.day(Date(),zone:input.timeZoneID) {
                    Text(input.yearly ? "The original date is kept; the next yearly occurrence appears in Moments." : "This date is in the past. You can save it, but choose a future time before scheduling delivery.").font(.caption).foregroundStyle(.secondary)
                }
                Picker("Time zone", selection: $input.timeZoneID) { ForEach(TimeZone.knownTimeZoneIdentifiers, id: \.self) { Text($0) } }
                if !dateConfirmed { Toggle("I have confirmed the event date", isOn: $dateConfirmed) }
                Toggle("Repeat yearly", isOn: $input.yearly)
                Text("February 29 is observed on February 28 in non-leap years. Dates for festivals with moving calendars must be confirmed each year.").font(.caption)
            }.disabled(completedSave || createdID != nil)
            if moment == nil {
                Section("Recipients") {
                    ForEach(recipients) { recipient in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(recipient.name).font(.headline)
                                Text(recipient.maskedAddresses).font(.subheadline).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("Edit") { focusedField = nil; recipientAction = .edit(recipient.key) }
                                .accessibilityLabel("Edit \(recipient.name)")
                            Button("Remove", role: .destructive) { recipients.removeAll { $0.key == recipient.key } }
                                .accessibilityLabel("Remove \(recipient.name)")
                        }.buttonStyle(.borderless)
                    }
                    Button {
                        focusedField = nil; recipientAction = .contacts
                    } label: {
                        Label("Choose from Contacts", systemImage: "person.crop.circle.badge.plus")
                    }
                    Button {
                        focusedField = nil; recipientAction = .manual
                    } label: {
                        Label("Enter recipient manually", systemImage: "square.and.pencil")
                    }
                    if recipients.isEmpty { Text("Add at least one recipient.").font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("moment-recipients-required") }
                    Text("Only the recipients and occasion you confirm here are saved to your Nexdo account. Your address book is never uploaded.").font(.caption)
                }.disabled(createdID != nil)
            } else {
                Section("Recipient") {
                    TextField("First name", text: $input.firstName).focused($focusedField, equals: .firstName).submitLabel(.done)
                    TextField("Phone (optional)", text: $input.phone).keyboardType(.phonePad).focused($focusedField, equals: .phone)
                    TextField("Email (optional)", text: $input.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().focused($focusedField, equals: .email).submitLabel(.done)
                    Text("Only the recipient and occasion you confirm here are saved to your Nexdo account. Your address book is never uploaded.").font(.caption)
                }
            }
            if completedSave {
                Text("Your moment is saved. Reload to open its details.").font(.caption)
            } else if createdID != nil {
                Text("Your moment is saved, but not all of its recipients are. Tap Save again to finish.").font(.caption).accessibilityIdentifier("moment-recipients-retry")
            }
            if let moment { Section { Toggle("Show reminders", isOn: Binding(get: { store.moments.first { $0.id == moment.id }?.enabled ?? moment.enabled }, set: { value in Task { await store.perform { try await store.visibility(moment, enabled: value) } } })) } }
            if let moment, moment.supportsGreetingCard {
                Section("Greeting Card") {MomentGreetingCardSection(moment:moment,store:store)}
            }
            if let error = store.error { Text(error).foregroundStyle(.red) }
            MomentPrimary(title:moment == nil ? "Save Moment & Continue":"Save Changes",action:save)
                .disabled(saveDisabled)
                .listRowInsets(EdgeInsets(top:12,leading:20,bottom:16,trailing:20))
                .listRowBackground(Color.clear)
                .accessibilityIdentifier("moment-save-continue")

        }
        .disabled(store.busy)
        .navigationTitle(moment == nil ? "Create Moment" : "Edit Moment").navigationBarTitleDisplayMode(.inline)
        .onSubmit { focusedField = nil }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: input.firstName) { old, new in
            input.title = MomentTitles.updating(input.title, from: input.type, firstName: old, to: input.type, firstName: new)
        }
        // A new moment's name and automatic title follow its first recipient.
        .onChange(of: recipients.first?.name) { _, name in if moment == nil { input.firstName = name ?? "" } }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save", action: save).disabled(saveDisabled).accessibilityIdentifier("moment-save-top")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
            }
        }
        .recipientSheets(action: $recipientAction, recipients: recipients) { recipient, previous in
            if let previous, let index = recipients.firstIndex(where: { $0.key == previous.key }) { recipients[index] = recipient } else { recipients.append(recipient) }
        }
        .onAppear {
            guard !initialized else { return }; initialized = true
            if let m = moment {
                input.type = m.type; input.title = m.title; input.firstName = m.firstName; input.phone = m.phone; input.email = m.email; input.yearly = m.yearly; input.timeZoneID = m.timeZoneID; input.source = m.source; input.sourceKey = m.sourceKey; input.occurrenceDate = m.occurrenceDate
            } else if let imported {
                input = imported; dateConfirmed = !imported.occurrenceDate.isEmpty
                // A contact imported with its birthday starts as the moment's first recipient.
                let draft = RecipientDraft(name: imported.firstName, phone: imported.phone, email: imported.email)
                if draft.issue(among: []) == nil { recipients = [draft.recipient()] }
            }
            if moment == nil && input.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                input.title = MomentTitles.defaultTitle(for: input.type, firstName: input.firstName) ?? ""
            }
            if !input.occurrenceDate.isEmpty { date = MomentDates.date(input.occurrenceDate, zone: input.timeZoneID) }
        }
    }
    private var saveDisabled: Bool {
        store.busy || !dateConfirmed || input.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || moment == nil && recipients.isEmpty
    }
    private func save() {
        guard !saveDisabled else { return }
        focusedField = nil
        // The toolbar Save and "Save Moment & Continue" both land here and send the chosen type.
        input = input.forSave(day: MomentDates.day(date, zone: input.timeZoneID))
        Task {
            await store.perform {
                if !completedSave {
                    if moment != nil { createdID = try await store.save(input, id: moment?.id) }
                    else { try await saveNewMoment() }
                    savedGroup = MomentDisplayGroup.editableGroups(store.moments).first {
                        $0.moments.contains { $0.id == createdID }
                    } ?? savedGroup
                    completedSave = true
                }
                if moment != nil || input.type == "custom" { dismiss() }
                // perform refreshes the snapshot; body then shows the saved moment's four-tab manager.
            }
        }
    }
    /// Creates the moment with its first recipient, then saves every recipient onto it together (festivalSave), each
    /// with its own phone, email and default channel. A retry after a failure reuses the created moment and its group.
    /// Custom moments have no recipient group, so each other recipient is saved as its own custom moment.
    private func saveNewMoment() async throws {
        guard let first = recipients.first else { return }
        if createdID == nil {
            var anchor = input
            anchor.firstName = first.name; anchor.phone = FestivalValidation.phone(first.phone); anchor.email = first.email
            createdID = try await store.save(anchor)
        }
        guard let createdID else { return }
        if input.type == "custom" {
            for recipient in recipients.dropFirst() where !savedRecipientIDs.contains(recipient.key) {
                var value = input
                value.firstName = recipient.name; value.phone = FestivalValidation.phone(recipient.phone); value.email = recipient.email
                value.sourceKey = UUID().uuidString
                try await store.save(value)
                savedRecipientIDs.insert(recipient.key)
            }
            return
        }
        let request = FestivalSaveRequest.creating(anchorID: createdID, title: input.title, date: input.occurrenceDate, timeZoneID: input.timeZoneID, yearly: input.yearly, recipients: recipients, settings: groupSettings)
        let _: MomentOK = try await store.request("festivalSave", request)
        // If the refreshed list doesn't include the new moment yet, Manage Moment still opens on the saved moment.
        if var anchor = store.moments.first(where: { $0.id == createdID }), let settings = try? JSONEncoder().encode(request.settings) {
            anchor.festivalSettings = String(data: settings, encoding: .utf8)
            savedGroup = MomentDisplayGroup.groups([anchor]).first
        }
        await store.refresh()
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
                Text("Reminders are on by default once you allow notifications. They apply to wishes you schedule; enabling them does not send messages.").font(.caption)
                Button("Open Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
                Text("Reminders require notifications. Denied or limited Contacts and Calendar access can be changed in your phone’s Settings.").font(.caption)
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
                do { calendars = try await service.calendars() } catch { self.error = "Calendar access is unavailable. Enable Calendar access for Nexdo in your phone’s Settings." }
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
