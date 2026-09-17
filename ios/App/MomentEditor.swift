import SwiftUI
import ContactsUI
import EventKit

struct MomentEditor: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    @Environment(\.dismiss) private var dismiss
    var moment: ImportantMoment? = nil
    var imported: MomentInput? = nil
    @State private var input = MomentInput()
    @State private var date = Date()
    @State private var initialized = false
    @State private var dateConfirmed = true
    var body: some View {
        Form {
            Section("Important moment") {
                Picker("Type", selection: $input.type) { ForEach(["birthday","anniversary","festival","custom"], id: \.self) { Text($0.capitalized).tag($0) } }
                TextField("Title", text: $input.title)
                DatePicker("Date", selection: $date, displayedComponents: .date).environment(\.timeZone, TimeZone(identifier: input.timeZoneID) ?? .current)
                Picker("Time zone", selection: $input.timeZoneID) { ForEach(TimeZone.knownTimeZoneIdentifiers, id: \.self) { Text($0) } }
                if !dateConfirmed { Toggle("I have confirmed the event date", isOn: $dateConfirmed) }
                Toggle("Repeat yearly", isOn: $input.yearly)
                Text("February 29 is observed on February 28 in non-leap years. Dates for festivals with moving calendars must be confirmed each year.").font(.caption)
            }
            Section("Recipient") {
                TextField("First name", text: $input.firstName)
                TextField("Phone (optional)", text: $input.phone).keyboardType(.phonePad)
                TextField("Email (optional)", text: $input.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                Text("Only the recipient and occasion you confirm here are saved to your Nexdo account. Your address book is never uploaded.").font(.caption)
            }
            if let moment { Section { Toggle("Show reminders", isOn: Binding(get: { store.moments.first { $0.id == moment.id }?.enabled ?? moment.enabled }, set: { value in Task { await store.perform { try await store.visibility(moment, enabled: value) } } })) } }
            if let error = store.error { Text(error).foregroundStyle(.red) }
            Button("Save Moment") {
                input.occurrenceDate = MomentDates.day(date, zone: input.timeZoneID)
                Task { await store.perform { try await store.save(input, id: moment?.id); dismiss() } }
            }.disabled(store.busy || !dateConfirmed || input.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .navigationTitle(moment == nil ? "Add Moment" : "Edit Moment").navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard !initialized else { return }; initialized = true
            if let m = moment {
                input.type = m.type; input.title = m.title; input.firstName = m.firstName; input.phone = m.phone; input.email = m.email; input.yearly = m.yearly; input.timeZoneID = m.timeZoneID; input.source = m.source; input.sourceKey = m.sourceKey; input.occurrenceDate = m.occurrenceDate
            } else if let imported { input = imported; dateConfirmed = !imported.occurrenceDate.isEmpty }
            if !input.occurrenceDate.isEmpty { date = MomentDates.date(input.occurrenceDate, zone: input.timeZoneID) }
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
                Button("Enable wish reminders") { Task { await store.perform { try await store.authorizeNotifications() } } }
                Button("Open iOS Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
                Text("Reminders require notifications. Denied or limited Contacts and Calendar access can be changed in iOS Settings.").font(.caption)
            }
            Section("Privacy") { Button("Delete all Important Moments data", role: .destructive) { delete = true }; Text("Deletes moments, drafts, delivery history and the connected email credentials. An email already submitted cannot be recalled.").font(.caption) }
            if let error = store.error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("Moments Settings").navigationBarTitleDisplayMode(.inline)
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
