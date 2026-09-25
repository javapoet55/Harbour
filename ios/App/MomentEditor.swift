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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.colorScheme) private var colorScheme
    @State private var region: String?

    private let regions = ["Global", "India", "United States", "East Asia"]
    private let festivals = [
        "Global": ["New Year", "International Friendship Day"],
        "India": ["Diwali", "Holi", "Eid", "Pongal"],
        "United States": ["Thanksgiving", "Christmas"],
        "East Asia": ["Lunar New Year", "Mid-Autumn Festival"]
    ]
    private var visibleFestivals: [String] {
        if let region { return festivals[region] ?? [] }
        return regions.flatMap { festivals[$0] ?? [] }
    }
    private var columns: [GridItem] {
        dynamicTypeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.flexible()), GridItem(.flexible())]
    }
    private var surface: Color { Color(uiColor: .secondarySystemGroupedBackground) }
    private var accent: Color { colorScheme == .dark ? Color(red: 0.73, green: 0.67, blue: 1) : .nexdoIndigo }

    var body: some View {
        ZStack {
            TodayBackdrop(subtle: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    hero
                    regionPicker
                    celebrationList
                    Label("You’ll review the date and recipients before saving. Festival dates can vary each year.", systemImage: "calendar.badge.clock")
                        .font(.footnote)
                        .foregroundStyle(Color.nexdoSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(accent.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 28)
                .frame(maxWidth: 680)
                .frame(maxWidth: .infinity)
            }
        }
        .foregroundStyle(Color.nexdoInk)
        .navigationTitle("Choose Festivals")
        .navigationBarTitleDisplayMode(.inline)
        .tint(accent)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("MOMENTS THAT MATTER", systemImage: "sparkles")
                    .font(.caption2.weight(.bold))
                    .tracking(1.5)
                Spacer(minLength: 0)
                Image(systemName: "gift.fill")
                    .font(.title2)
                    .padding(12)
                    .background(.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 16))
                    .accessibilityHidden(true)
            }
            Text("Make every\ncelebration count.")
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .fixedSize(horizontal: false, vertical: true)
            Text("A thoughtful wish. A closer connection.\nFind the festivals you love to celebrate.")
                .font(.subheadline)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(.white.opacity(0.92))
        }
        .foregroundStyle(.white)
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 28)
                .fill(LinearGradient(colors: [Color(red: 0.15, green: 0.12, blue: 0.60), .nexdoIndigo, Color(red: 0.52, green: 0.08, blue: 0.70)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(alignment: .bottomTrailing) {
                    Circle().stroke(.white.opacity(0.10), lineWidth: 30)
                        .frame(width: 190, height: 190)
                        .offset(x: 65, y: 85)
                }
                .clipShape(RoundedRectangle(cornerRadius: 28))
        }
        .shadow(color: Color.nexdoIndigo.opacity(colorScheme == .dark ? 0.10 : 0.18), radius: 18, x: 0, y: 8)
    }

    private var regionPicker: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Explore by region").font(.title3.bold())
                Text("Discover celebrations close to home and around the world.")
                    .font(.subheadline).foregroundStyle(Color.nexdoSecondary)
            }
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(regions, id: \.self) { name in
                    Button { region = region == name ? nil : name } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: regionSymbol(name))
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(accent)
                                .frame(width: 30, height: 32)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(name).font(.subheadline.weight(.semibold))
                                Text("\(festivals[name]?.count ?? 0) celebrations")
                                    .font(.caption).foregroundStyle(Color.nexdoSecondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                            Image(systemName: region == name ? "checkmark.circle.fill" : "circle")
                                .font(.caption)
                                .foregroundStyle(region == name ? accent : Color.nexdoSecondary.opacity(0.5))
                                .accessibilityHidden(true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, minHeight: 84, alignment: .leading)
                        .background(region == name ? accent.opacity(0.10) : surface, in: RoundedRectangle(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(region == name ? accent : accent.opacity(0.12), lineWidth: region == name ? 1.5 : 1))
                        .contentShape(RoundedRectangle(cornerRadius: 20))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(name), \(festivals[name]?.count ?? 0) celebrations")
                    .accessibilityAddTraits(region == name ? [.isSelected] : [])
                    .accessibilityHint("Filters the festival list. Tap again to show all regions.")
                    .accessibilityIdentifier("festival-region-\(name)")
                }
            }
        }
    }

    private var celebrationList: some View {
        VStack(alignment: .leading, spacing: 14) {
            ViewThatFits(in: .horizontal) {
                HStack {
                    festivalHeading
                    Spacer()
                    if region != nil { allRegionsButton }
                }
                VStack(alignment: .leading, spacing: 8) {
                    festivalHeading
                    if region != nil { allRegionsButton }
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(visibleFestivals.enumerated()), id: \.element) { index, name in
                    NavigationLink { MomentEditor(imported: input(name)) } label: {
                        HStack(spacing: 14) {
                            Image(systemName: festivalSymbol(name))
                                .font(.title3.weight(.medium))
                                .foregroundStyle(accent)
                                .frame(width: 48, height: 48)
                                .background(LinearGradient(colors: [Color.nexdoBlue.opacity(0.12), Color.nexdoMagenta.opacity(0.10)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 15))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(name).font(.body.weight(.semibold))
                                Text("Create a thoughtful wish")
                                    .font(.caption).foregroundStyle(Color.nexdoSecondary)
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold)).foregroundStyle(accent.opacity(0.65))
                                .accessibilityHidden(true)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("festival-choice-\(name)")
                    if index < visibleFestivals.count - 1 {
                        Divider().padding(.leading, 78).padding(.trailing, 16)
                    }
                }
            }
            .background(surface, in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(accent.opacity(0.10)))
        }
    }

    private var festivalHeading: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(region.map { "Celebrate in \($0)" } ?? "Find your next celebration")
                .font(.title3.bold())
            Text("\(visibleFestivals.count) festivals to make your own")
                .font(.caption).foregroundStyle(Color.nexdoSecondary)
        }
    }
    private var allRegionsButton: some View {
        Button("All regions") { region = nil }
            .font(.subheadline.weight(.semibold))
            .padding(.vertical, 12)
            .accessibilityIdentifier("festival-all-regions")
    }
    private func regionSymbol(_ name: String) -> String {
        switch name {
        case "India": "sun.max"
        case "United States": "star"
        case "East Asia": "moon.stars"
        default: "globe"
        }
    }
    private func festivalSymbol(_ name: String) -> String {
        switch name {
        case "New Year", "Lunar New Year": "sparkles"
        case "International Friendship Day": "heart"
        case "Diwali": "flame"
        case "Holi": "paintpalette"
        case "Eid", "Mid-Autumn Festival": "moon.stars"
        case "Pongal", "Thanksgiving": "leaf"
        default: "gift"
        }
    }
    private func input(_ name: String) -> MomentInput {
        var input = MomentInput()
        input.type = "festival"
        input.title = name + " Wishes"
        input.yearly = false
        input.source = "festivalCatalog"
        return input
    }
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
