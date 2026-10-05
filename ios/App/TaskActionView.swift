import SwiftUI
import MessageUI

struct TaskActionCard: View {
    @ObservedObject private var coordinator = TaskActionCoordinator.shared
    let task: NexdoTask
    @State private var showing = false
    @EnvironmentObject private var model: AppModel
    var body: some View {
        if let action = coordinator.action(for: task.id), !task.isDone, task.status != "CANCELLED" {
            Button { showing = true } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Nexdo Action", systemImage: "sparkles").font(.subheadline.bold()).foregroundStyle(Color.nexdoIndigo)
                    Text("Contact \(action.contactName)").font(.headline).foregroundStyle(Color.nexdoInk)
                    Text("Call • Message • Email").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    if action.status == .cancelled {
                        Text("Reminder dismissed. Tap to take action.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    } else if action.status == .completed || action.status == .executing {
                        Text("Review the outcome or mark your task complete.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    } else if let date = action.notificationDate, date > Date(), action.status == .scheduled || action.status == .pending {
                        Text("Reminder: \(date.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    } else {
                        Text("Set a schedule to receive an action reminder.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    }
                    if let notice = coordinator.notice { Text(notice).font(.caption).foregroundStyle(.orange) }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.nexdoIndigo.opacity(0.18)))
            }
            .buttonStyle(.plain).accessibilityLabel("Nexdo Action: contact \(action.contactName)")
            .accessibilityIdentifier("taskAction.card")
            .sheet(isPresented: $showing) {
                TaskActionView(actionID: action.id, preferred: action.preferredAction)
            }
        } else if !task.isDone && task.status != "CANCELLED" && (task.subtasks ?? []).isEmpty && TaskActionClarification.isCandidate(task.title) {
            ClarifyTaskActionCard(task: task)
        }
    }
}

private struct ClarifyTaskActionCard: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject private var coordinator = TaskActionCoordinator.shared
    let task: NexdoTask
    @State private var contact = ""
    @State private var nextStep = ""
    @State private var contactMode = false
    @State private var saving = false
    @State private var failure: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("What would you like to do about “\(task.title)”?").font(.headline)
            Picker("Next step type", selection: $contactMode) {
                Text("Work on it").tag(false)
                Text("Contact someone").tag(true)
            }.pickerStyle(.segmented)
            if contactMode {
                TextField("Person or business to contact", text: $contact).textFieldStyle(.roundedBorder)
                ViewThatFits(in: .horizontal) {
                    HStack { choices }
                    VStack(alignment: .leading) { choices }
                }
                Text("You’ll review the contact before calling or sending.").font(.caption).foregroundStyle(.secondary)
            } else {
                TextField("First step, e.g. Draft three presentation slides", text: $nextStep, axis: .vertical).textFieldStyle(.roundedBorder)
                Button("Save next step") {
                    guard let title = TaskActionClarification.nextStepTitle(nextStep) else { return }
                    saving = true; failure = nil
                    Task {
                        let saved = await model.saveClarifiedStep(task, title: title)
                        saving = false
                        if !saved { failure = "Couldn’t save your next step. Please try again." }
                    }
                }.buttonStyle(.borderedProminent).disabled(saving || TaskActionClarification.nextStepTitle(nextStep) == nil)
                Text("Describe one small action. Save it, then use Start Focus Session below when you’re ready.").font(.caption).foregroundStyle(.secondary)
            }
            if saving { ProgressView("Updating your next step…") }
            if let failure { Text(failure).font(.caption).foregroundStyle(.red) }
        }.padding(16).background(Color.nexdoIndigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
        .onAppear { contact = task.title }
    }
    @ViewBuilder private var choices: some View {
        ForEach(["Call", "Message", "Email"], id: \.self) { verb in
            Button(verb) {
                guard let title = TaskActionClarification.title(verb: verb, contact: contact) else { failure = "Enter a short person or business name to continue."; return }
                saving = true; failure = nil
                Task {
                    let saved = await model.saveTask(id: task.id, title: title, notes: task.notes ?? "", duration: task.durationMin)
                    saving = false
                    if saved, let owner = model.profile?.id {
                        coordinator.synchronize(tasks: model.tasks, userID: owner)
                        if let action = coordinator.action(for: task.id) { coordinator.open(action) }
                    } else { failure = "Couldn’t update this task. Please try again." }
                }
            }.buttonStyle(.bordered).disabled(saving || contact.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}

struct TaskActionView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var coordinator = TaskActionCoordinator.shared
    let actionID: String
    let preferred: TaskActionChannel?
    var startSelectedAction = false
    @State private var resumeAfterSelection = false
    @State private var checking = true
    @State private var businessFlow = false
    @State private var businessRun: TaskAgentRun?
    @State private var businessDraft: String?
    @State private var showingTask = false
    @State private var pickingContact = false
    @State private var enteringDetails = false
    @State private var manualName = ""
    @State private var manualPhone = ""
    @State private var manualEmail = ""
    @State private var checkFailed = false
    @State private var channel: TaskActionChannel?
    @State private var contacts: [ActionContact] = []
    @State private var contact: ActionContact?
    @State private var addresses: [ActionContact.Address] = []
    @State private var selectedAddress: ActionContact.Address?
    @State private var busy = false
    @State private var error: String?
    @State private var receipt: String?
    @State private var confirmCall = false
    @State private var composer: Composer?
    @State private var resolution: Task<Void, Never>?
    private let resolver: any TaskActionContactResolver = AppleTaskActionContacts()
    private let emailService: any TaskActionEmailService = NativeTaskActionEmailService()
    private struct Composer: Identifiable {
        let id = UUID()
        let channel: TaskActionChannel
        let recipient: String
        let name: String
        let context: String?
        let body: String?
    }
    private var action: TaskAction? { coordinator.actions.first { $0.id == actionID } }
    private var task: NexdoTask? { model.tasks.first { $0.id == action?.taskId } }
    private var usable: Bool { task.map { !$0.isDone && $0.status != "CANCELLED" } ?? false }
    private var isRoutedAction: Bool { coordinator.route?.id == actionID }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let action, usable {
                        Text("Contact \(contact?.name ?? action.contactName)").font(.title2.bold())
                        if checking { ProgressView("Checking next action…") }
                        else if checkFailed {
                            Text("Couldn’t check this task. Please retry.")
                            Button("Retry") { Task { await loadDestination() } }
                        } else if businessFlow && contact == nil {
                            Text("Choose a business before calling or sending a message.").foregroundStyle(Color.nexdoSecondary)
                            Button(businessRun?.candidates.isEmpty == false ? "Choose a business" : "Find businesses") { showingTask = true }
                                .buttonStyle(.borderedProminent)
                        } else {
                        Text(contact == nil ? "Choose a contact or enter a phone number or email address." : "Choose how to contact \(contact!.name).").foregroundStyle(Color.nexdoSecondary)
                        ForEach(availableChannels, id: \.self) { option in
                            Button { resolve(option) } label: {
                                HStack {
                                    Label(title(option), systemImage: icon(option))
                                    Spacer()
                                    if (channel ?? preferred) == option { Image(systemName: "checkmark") }
                                }.padding(14).frame(maxWidth: .infinity)
                                    .background(Color.nexdoIndigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                            }.buttonStyle(.plain).disabled(busy)
                                .accessibilityIdentifier("taskAction.\(option.rawValue)")
                                .accessibilityLabel("\(title(option)) \(action.contactName)")
                        }
                        }
                        if !checking && !checkFailed {
                            if businessFlow {
                                if contact != nil { Button("Change business") { showingTask = true } }
                                Button("Choose someone from Contacts") { pickingContact = true }
                            } else {
                                Button("Choose contact") { pickingContact = true }.buttonStyle(.borderedProminent)
                                Button("Enter contact details") {
                                    manualName = contact?.name ?? action.contactName
                                    manualPhone = contact?.phones.first?.value ?? ""
                                    manualEmail = contact?.emails.first?.value ?? ""
                                    enteringDetails = true
                                }
                            }
                        }
                        if busy { ProgressView("Finding contact…") }
                        if !contacts.isEmpty {
                            Text("Choose the correct contact").font(.headline)
                            ForEach(contacts) { candidate in
                                Button { choose(candidate) } label: {
                                    VStack(alignment: .leading) {
                                        Text(candidate.name)
                                        Text(candidate.phones.first?.value ?? candidate.emails.first?.value ?? "No contact details")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
                                }.accessibilityIdentifier("taskAction.contact.\(candidate.id)")
                            }
                        }
                        if !addresses.isEmpty {
                            Text("Choose \(channel == .email ? "an email address" : "a phone number")").font(.headline)
                            ForEach(addresses) { address in
                                Button("\(address.label): \(address.value)") { prepare(address) }
                                    .padding(.vertical, 8).accessibilityIdentifier("taskAction.address.\(address.id)")
                            }
                        }
                        if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("taskAction.error") }
                        if let receipt { Text(receipt).foregroundStyle(.secondary).accessibilityIdentifier("taskAction.receipt") }
                        if action.status == .executing || action.status == .completed {
                            Button("Mark task complete") {
                                guard let task else { return }
                                busy = true
                                Task {
                                    defer { busy = false }
                                    do { try await model.changeTaskStatus(task, status: "COMPLETED"); closeAction() }
                                    catch { self.error = error.localizedDescription }
                                }
                            }.disabled(busy).accessibilityIdentifier("taskAction.completeTask")
                        }
                        Divider()
                        Button("Remind me in 15 minutes") { coordinator.snooze(actionID); closeAction() }
                            .accessibilityIdentifier("taskAction.snooze").disabled(busy)
                        Button("Dismiss") { coordinator.dismiss(actionID); closeAction() }
                            .accessibilityIdentifier("taskAction.dismiss").disabled(busy)
                        if let notice = coordinator.notice {
                            Text(notice).font(.caption).foregroundStyle(.orange)
                            Button("Retry reminders") { coordinator.retryNotifications() }
                        }
                    } else {
                        ContentUnavailableView("Task unavailable", systemImage: "checkmark.circle", description: Text("This task may be completed, deleted, or rescheduled. Open your task list to check it."))
                        Button("Close") { closeAction() }
                    }
                }.padding(20)
            }
            .navigationTitle("Nexdo Action").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { closeAction() } } }
            .foregroundStyle(Color.nexdoInk).tint(Color.nexdoIndigo)
            .confirmationDialog("Call \(contact?.name ?? action?.contactName ?? "this contact")?", isPresented: $confirmCall, titleVisibility: .visible) {
                Button("Call") { placeCall() }
                Button("Cancel", role: .cancel) {}
            } message: { Text(selectedAddress?.value ?? "") }
            .sheet(item: $composer) { draft in
                if draft.channel == .message {
                    ActionMessageComposer(recipient: draft.recipient,
                        body: draft.body ?? ("Hi \(draft.name), " + (draft.context.map { "following up regarding \($0)." } ?? "just checking in.")), finished: finishCompose)
                        .ignoresSafeArea()
                        .interactiveDismissDisabled()
                } else {
                    ActionEmailComposer(draft: emailService.draft(recipient: draft.recipient, name: draft.name, context: draft.context), finished: finishCompose)
                        .ignoresSafeArea()
                        .interactiveDismissDisabled()
                }
            }
        }
        .sheet(isPresented: $showingTask, onDismiss: { Task { await loadDestination(); if startSelectedAction, let preferred, contact != nil { resolve(preferred) } } }) {
            if let task { TaskDetailsView(task: task) }
        }
        .sheet(isPresented: $pickingContact, onDismiss: resumeSelectedChannel) {
            ActionContactPicker(selected: { value in
                pickingContact = false
                error = nil; businessFlow = false; businessDraft = nil
                coordinator.update(actionID) { $0.manualRecipient = nil; $0.businessCandidateID = nil }
                // Let the picker dismiss before opening a composer.
                contact = value; contacts = []; addresses = []; resumeAfterSelection = true; coordinator.remember(value)
                coordinator.update(actionID) { $0.contactIdentifier = value.id }
            }, cancelled: { pickingContact = false })
        }
        .sheet(isPresented: $enteringDetails, onDismiss: resumeSelectedChannel) {
            NavigationStack {
                Form {
                    TextField("Name", text: $manualName)
                    TextField("Phone number", text: $manualPhone).keyboardType(.phonePad)
                    TextField("Email", text: $manualEmail).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if !validManualDetails { Text("Enter a name and a valid phone number or email address.").font(.caption) }
                }.navigationTitle("Contact details")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { enteringDetails = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Save") {
                                let recipient = TaskActionRecipient(name: manualName.trimmingCharacters(in: .whitespacesAndNewlines), phone: manualPhone.trimmingCharacters(in: .whitespacesAndNewlines), email: manualEmail.trimmingCharacters(in: .whitespacesAndNewlines))
                                coordinator.update(actionID) { $0.manualRecipient = recipient; $0.contactIdentifier = nil; $0.businessCandidateID = nil }
                                contact = .manual(recipient); contacts = []; addresses = []; resumeAfterSelection = true; error = nil; enteringDetails = false
                            }.disabled(!validManualDetails)
                        }
                    }
            }
        }
        .presentationDetents([.large]).presentationDragIndicator(.visible)
        .onAppear { coordinator.screenOpened(actionID) }
        .onDisappear {
            resolution?.cancel()
            if isRoutedAction { coordinator.route = nil }
            coordinator.screenClosed(actionID)
        }
        .task {
            await model.refreshTasks()
            // Closed while tasks were refreshing: leave the action on its schedule.
            guard usable, !Task.isCancelled else { return }
            coordinator.update(actionID) { $0.transition(to: .awaitingApproval) }
            await loadDestination()
            if startSelectedAction, let preferred, !Task.isCancelled, contact != nil { resolve(preferred) }
        }
    }

    private func resumeSelectedChannel() {
        guard resumeAfterSelection else { return }
        resumeAfterSelection = false
        if let option = channel ?? (startSelectedAction ? preferred : nil) { resolve(option) }
    }
    private var availableChannels: [TaskActionChannel] {
        ActionNeededState.channels(hasPhone: !(contact?.phones.isEmpty ?? true), hasEmail: !(contact?.emails.isEmpty ?? true))
    }
    private var validManualDetails: Bool {
        TaskActionRecipient.isValid(name: manualName, phone: manualPhone, email: manualEmail)
    }
    private func loadDestination() async {
        guard let action, usable else { checking = false; return }
        checking = true; checkFailed = false; error = nil; contact = nil; businessDraft = nil; contacts = []; addresses = []
        defer { checking = false }
        if let recipient = action.manualRecipient { businessFlow = false; contact = .manual(recipient); return }
        if action.contactIdentifier == nil {
            do {
                let response = try await model.loadTaskAgent(taskID: action.taskId)
                guard !Task.isCancelled, usable else { return }
                businessRun = response.run
                businessFlow = action.businessCandidateID != nil || response.intent?.eligible == true || response.run != nil
                if businessFlow {
                    if let selected = response.run?.candidates.first(where: { $0.id == action.businessCandidateID }) {
                        contact = .business(selected); businessDraft = selected.draft
                    }
                    return
                }
            } catch { checkFailed = true; return }
        }
        businessFlow = false
        if let id = action.contactIdentifier, let cached = coordinator.resolvedContacts[id] { contact = cached; return }
        do {
            let matches = try await resolver.resolve(name: DeterministicTaskActionDetector.contactSearchName(action.contactName), identifier: action.contactIdentifier)
            guard !Task.isCancelled, usable else { return }
            if matches.count == 1 {
                contact = matches[0]; coordinator.remember(matches[0])
                coordinator.update(actionID) { $0.contactIdentifier = matches[0].id }
            } else { contacts = matches }
        } catch { self.error = "No contact selected. Choose a contact or enter details below." }
    }

    private func title(_ channel: TaskActionChannel) -> String { switch channel { case .call: "Call"; case .message: "Message"; case .email: "Email" } }
    private func icon(_ channel: TaskActionChannel) -> String { switch channel { case .call: "phone"; case .message: "message"; case .email: "envelope" } }
    private func resolve(_ option: TaskActionChannel) {
        guard let action, usable, !busy else { return }
        channel = option; contacts = []; addresses = []; error = nil; receipt = nil
        if let contact { choose(contact); return }
        busy = true
        coordinator.update(actionID) { $0.transition(to: .awaitingApproval) }
        resolution?.cancel()
        resolution = Task {
            defer { busy = false }
            do {
                // "the plumber" is looked up as "plumber"; the card and notification keep the name as written.
                let matches = try await resolver.resolve(name: DeterministicTaskActionDetector.contactSearchName(action.contactName), identifier: action.contactIdentifier)
                guard !Task.isCancelled, usable, self.action?.id == action.id else { return }
                if matches.count == 1 { choose(matches[0]) } else { contacts = matches }
            } catch { self.error = error.localizedDescription }
        }
    }
    private func choose(_ value: ActionContact) {
        guard usable else { return }
        contact = value; contacts = []; error = nil; selectedAddress = nil
        if !businessFlow && action?.manualRecipient == nil {
            coordinator.remember(value)
            coordinator.update(actionID) { $0.contactIdentifier = value.id }
        }
        guard channel != nil else { return }
        addresses = channel == .email ? value.emails : value.phones
        if addresses.isEmpty { error = (channel == .email ? TaskActionServiceError.noEmail : .noPhone).localizedDescription }
        else if addresses.count == 1 { prepare(addresses[0]) }
    }
    private func prepare(_ address: ActionContact.Address) {
        guard usable, let channel, let action, let contact else { return }
        selectedAddress = address; addresses = []
        if channel == .call { confirmCall = true; return }
        guard channel == .message ? MFMessageComposeViewController.canSendText() : emailService.canCompose else {
            error = TaskActionServiceError.unavailable.localizedDescription; return
        }
        // Approval is to open an editable composer, never to send automatically.
        guard coordinator.approveExecution(actionID) else { return }
        composer = Composer(channel: channel, recipient: address.value, name: contact.name, context: action.context, body: businessDraft)
    }
    private func placeCall() {
        guard usable, let address = selectedAddress else { return }
        // Do not turn an extension, pause, or vanity number into a different number.
        guard address.value.allSatisfy({ "+0123456789 ()-.".contains($0) }) else {
            error = TaskActionServiceError.invalidPhone.localizedDescription; return
        }
        let number = address.value.filter { "+0123456789".contains($0) }
        guard !number.dropFirst().contains("+") else { error = TaskActionServiceError.invalidPhone.localizedDescription; return }
        guard number.filter(\.isNumber).count >= 3, let url = URL(string: "tel:" + number) else {
            error = TaskActionServiceError.invalidPhone.localizedDescription; return
        }
        guard coordinator.approveExecution(actionID) else { return }
        UIApplication.shared.open(url) { accepted in
            Task { @MainActor in
                if accepted { receipt = "Opened Phone. Nexdo can’t verify whether the call connected. Mark the task complete when you’re done." }
                else { coordinator.update(actionID) { $0.transition(to: .failed) }; error = "Phone couldn’t open this number." }
            }
        }
    }
    private func finishCompose(_ result: ActionComposeResult) {
        composer = nil
        switch result {
        case .submitted:
            coordinator.update(actionID) { $0.transition(to: .completed) }
            receipt = "Submitted to the messaging app. Delivery isn’t verified. You can mark the task complete when you’re done."
        case .cancelled, .saved:
            coordinator.update(actionID) { $0.transition(to: .awaitingApproval) }
            receipt = result == .saved ? "Draft saved. Nothing was sent." : "Cancelled. Nothing was sent."
        case .failed:
            coordinator.update(actionID) { $0.transition(to: .failed) }
            error = "The message couldn’t be submitted. Please try again."
        }
    }

    private func closeAction() {
        if isRoutedAction { coordinator.route = nil }
        dismiss()
    }
}
