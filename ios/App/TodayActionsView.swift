import SwiftUI
import Contacts

struct TodayActionSelection: Identifiable {
    let id = UUID()
    let action: TaskAction
    var channel: TaskActionChannel? = nil
}

struct TodayActionsView: View {
    @ObservedObject private var coordinator = TaskActionCoordinator.shared
    let queue: TodayActionQueue
    let now: Date
    let onTask: (String) -> Void
    @State private var selection: TodayActionSelection?
    @State private var showingAll = false
    @State private var refresh = UUID()
    @State private var selectedActionID: String?
    private var selectedIndex: Int {
        queue.dueActions.firstIndex { $0.id == selectedActionID } ?? 0
    }
    private func moveAction(by offset: Int) {
        let index = selectedIndex + offset
        guard queue.dueActions.indices.contains(index) else { return }
        selectedActionID = queue.dueActions[index].id
    }
    var body: some View {
        VStack(spacing: 16) {
            if !queue.dueActions.isEmpty {
                if queue.dueActions.count > 1 {
                    VStack(spacing: 10) {
                        HStack {
                            Text("\(queue.dueActions.count) actions need attention").font(.headline)
                            Spacer()
                            Button("View all") { showingAll = true }
                                .accessibilityIdentifier("today.actions.viewAllDue")
                        }
                        HStack {
                            Button { moveAction(by: -1) } label: {
                                Label("Previous", systemImage: "chevron.left")
                            }.disabled(selectedIndex == 0)
                                .accessibilityIdentifier("today.actions.previous")
                            Spacer()
                            Text("\(selectedIndex + 1) of \(queue.dueActions.count)")
                                .monospacedDigit().accessibilityAddTraits(.updatesFrequently)
                            Spacer()
                            Button { moveAction(by: 1) } label: {
                                HStack { Text("Next"); Image(systemName: "chevron.right") }
                            }.disabled(selectedIndex == queue.dueActions.count - 1)
                                .accessibilityIdentifier("today.actions.next")
                        }.font(.subheadline).buttonStyle(.bordered)
                    }.padding(14).modifier(ActionGlass())
                }
                let action = queue.dueActions[selectedIndex]
                ActionNeededCard(action: action, now: now, overdueCount: queue.overdueCount,
                    onChoose: { selection = TodayActionSelection(action: action) }, onExecute: { selection = TodayActionSelection(action: action, channel: $0) }, onTask: { onTask(action.taskId) })
                    .id(action.id + refresh.uuidString)
            }
            if !queue.upcomingActions.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("Next up", systemImage: "clock").font(.headline)
                        Text("\(queue.upcomingActions.count) actions").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button("View all") { showingAll = true }.font(.subheadline)
                            .accessibilityIdentifier("today.actions.viewAll")
                    }
                    ForEach(queue.upcomingActions.prefix(3)) { action in
                        Divider()
                        Button { selection = TodayActionSelection(action: action) } label: {
                            NextActionRow(action: action, now: now)
                        }.buttonStyle(.plain)
                    }
                }.padding(16).modifier(ActionGlass())
            }
        }
        .onChange(of: queue.dueActions.map(\.id)) { _, ids in
            if let selectedActionID, !ids.contains(selectedActionID) { self.selectedActionID = nil }
        }
        .sheet(item: $selection, onDismiss: { refresh = UUID() }) { value in
            TaskActionView(actionID: value.action.id, preferred: value.channel ?? value.action.preferredAction,
                           startSelectedAction: value.channel != nil)
        }
        .sheet(isPresented: $showingAll) { ActionQueueSheet() }
    }
}

private struct ActionGlass: ViewModifier {
    func body(content: Content) -> some View {
        content.foregroundStyle(Color.nexdoInk)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.nexdoIndigo.opacity(0.22)))
    }
}

struct ActionNeededCard: View {
    @EnvironmentObject private var model: AppModel
    @State private var envelope: TaskAgentEnvelope?
    @State private var loaded = false
    @State private var failed = false
    @State private var refreshID = 0
    @ObservedObject private var coordinator = TaskActionCoordinator.shared
    @Environment(\.dynamicTypeSize) private var typeSize
    let action: TaskAction
    let now: Date
    let overdueCount: Int
    let onChoose: () -> Void
    let onExecute: (TaskActionChannel) -> Void
    let onTask: () -> Void
    private var canReadContacts: Bool {
        let status = CNContactStore.authorizationStatus(for: .contacts)
        if #available(iOS 18, *), status == .limited { return true }
        return status == .authorized
    }
    private var business: TaskAgentRun.Candidate? {
        envelope?.run?.candidates.first { $0.id == action.businessCandidateID }
    }
    private var contact: ActionContact? {
        if let business { return .business(business) }
        if let manual = action.manualRecipient { return .manual(manual) }
        return action.contactIdentifier.flatMap { coordinator.resolvedContacts[$0] }
    }
    private var isBusiness: Bool { if action.manualRecipient != nil || action.contactIdentifier != nil { return false }; return action.businessCandidateID != nil || envelope?.intent?.eligible == true || envelope?.run != nil }
    private var state: ActionNeededState {
        .resolve(loaded: loaded, failed: failed, business: isBusiness, hasResults: !(envelope?.run?.candidates.isEmpty ?? true), hasRecipient: contact != nil, hasPhone: !(contact?.phones.isEmpty ?? true), hasEmail: !(contact?.emails.isEmpty ?? true))
    }
    private var channels: [TaskActionChannel] { if case .ready(let value) = state { return value }; return [] }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                Label("Action Needed", systemImage: "bell.fill").font(.headline).foregroundStyle(.pink)
                Spacer()
                VStack(alignment: .trailing) {
                    Text(action.notificationDate ?? now, style: .time)
                    Text(actionTimeLabel(action, now: now)).font(.caption).foregroundStyle(.pink)
                }.font(.subheadline)
            }
            if overdueCount > 1 {
                Text("\(overdueCount) actions need your attention").font(.caption).foregroundStyle(.orange)
            }
            Text(isBusiness && contact == nil ? "Find a business to contact" : "Time to contact \(contact?.name ?? action.contactName)").font(.title2.bold())
            if let context = action.context { Text(context).foregroundStyle(Color.nexdoSecondary) }
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle.fill").font(.largeTitle).foregroundStyle(Color.nexdoBlue)
                VStack(alignment: .leading, spacing: 3) {
                    Text(contact?.name ?? action.contactName).font(.headline)
                    Text(contact.map { $0.phones.first?.value ?? $0.emails.first?.value ?? "No contact details" } ?? (isBusiness ? "Choose a nearby business for this task" : "Choose a contact or enter their details"))
                        .font(.caption).foregroundStyle(Color.nexdoSecondary)
                }
            }
            Button(action: onTask) {
                HStack {
                    Image(systemName: "doc.text")
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Task context").font(.caption)
                        Text(action.context ?? action.sourceTitle).font(.subheadline)
                    }
                    Spacer(); Image(systemName: "chevron.right")
                }.padding(12).background(Color.nexdoIndigo.opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
            }.buttonStyle(.plain).accessibilityIdentifier("today.actions.context")
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
            layout {
                ForEach(channels, id: \.self) { channel in
                    Button { onExecute(channel) } label: {
                        VStack(spacing: 8) {
                            Image(systemName: actionIcon(channel)).font(.title2)
                            Text(channel.rawValue.capitalized).font(.subheadline.weight(.semibold))
                        }.frame(maxWidth: .infinity, minHeight: 76)
                            .foregroundStyle(channel == .call ? Color.green : channel == .message ? Color.nexdoBlue : Color.purple)
                            .background((channel == .call ? Color.green : channel == .message ? Color.nexdoBlue : Color.purple).opacity(0.13), in: RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain).accessibilityLabel("\(channel.rawValue.capitalized) \(action.contactName)")
                        .accessibilityIdentifier("today.actions.\(channel.rawValue)")
                }
            }
            switch state {
            case .loading: ProgressView("Checking next action…")
            case .retry:
                Text("Couldn’t check this task. Retry or open task details.").font(.caption)
                Button("Retry") { refreshID += 1 }
            case .findBusiness, .chooseBusiness:
                Button { onTask() } label: {
                    Label(state == .chooseBusiness ? "Choose a business" : "Find businesses", systemImage: "magnifyingglass")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }.buttonStyle(NexdoGradientButtonStyle())
            case .chooseContact:
                Button("Choose contact or enter details") { onChoose() }
                    .buttonStyle(.borderedProminent)
            case .ready:
                if isBusiness { Button("Change business", action: onTask).font(.subheadline) }
            }

            layout {
                SnoozeMenu(action: action)
                Button { coordinator.dismiss(action.id) } label: {
                    Label("Dismiss", systemImage: "xmark").frame(maxWidth: .infinity, minHeight: 44)
                }.buttonStyle(.bordered).accessibilityLabel("Dismiss \(action.contactName) action")
                    .accessibilityIdentifier("today.actions.dismiss")
            }
        }.padding(18).modifier(ActionGlass())
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(NexdoTheme.gradient, lineWidth: 1.5))
            .accessibilityIdentifier("today.actions.primary")
            .onReceive(NotificationCenter.default.publisher(for: .taskAgentChanged)) { note in
                if note.object as? String == action.taskId { refreshID += 1 }
            }
            .task(id: action.id + (action.businessCandidateID ?? "") + String(refreshID)) {
                loaded = false; failed = false; envelope = nil
                do {
                    let response = try await model.loadTaskAgent(taskID: action.taskId)
                    guard !Task.isCancelled else { return }
                    envelope = response; loaded = true
                    // Today never prompts for Contacts permission. The picker handles missing access.
                    if !isBusiness, action.manualRecipient == nil, canReadContacts {
                        let matches = try? await AppleTaskActionContacts().resolve(name: DeterministicTaskActionDetector.contactSearchName(action.contactName), identifier: action.contactIdentifier)
                        guard !Task.isCancelled else { return }
                        if let matches, matches.count == 1 {
                            coordinator.remember(matches[0])
                            coordinator.update(action.id) { $0.contactIdentifier = matches[0].id }
                        }
                    }
                } catch { if !Task.isCancelled { failed = true } }
            }
    }
}

struct SnoozeMenu: View {
    let action: TaskAction
    @State private var choosing = false
    @State private var date = Date().addingTimeInterval(900)
    var body: some View {
        Menu {
            ForEach([5, 10, 15, 30, 60], id: \.self) { minutes in
                Button(minutes == 60 ? "1 hour" : "\(minutes) minutes") {
                    TaskActionCoordinator.shared.snooze(action.id, until: Date().addingTimeInterval(Double(minutes) * 60))
                }
            }
            Button("Choose time…") { date = Date().addingTimeInterval(900); choosing = true }
        } label: {
            Label("Remind later", systemImage: "clock").frame(maxWidth: .infinity, minHeight: 44)
        }.buttonStyle(.bordered).accessibilityLabel("Remind \(action.contactName) task later")
            .accessibilityIdentifier("today.actions.snooze")
            .sheet(isPresented: $choosing) {
                NavigationStack {
                    DatePicker("Remind me at", selection: $date, in: Date()...).padding()
                        .navigationTitle("Remind later")
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeSnoozePicker() } }
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Save") { TaskActionCoordinator.shared.snooze(action.id, until: date); choosing = false }.disabled(date <= Date())
                            }
                        }
                }.presentationDetents([.medium])
            }
    }

    private func closeSnoozePicker() {
        choosing = false
    }
}

struct NextActionRow: View {
    let action: TaskAction
    let now: Date
    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(action.notificationDate ?? now, style: .time).font(.caption.bold()).foregroundStyle(Color.nexdoScheduleBlue)
                Text(actionTimeLabel(action, now: now)).font(.caption2).foregroundStyle(.secondary)
            }.frame(width: 78, alignment: .leading)
            RoundedRectangle(cornerRadius: 3).fill(Color.nexdoIndigo).frame(width: 4)
            VStack(alignment: .leading, spacing: 3) {
                Text(action.sourceTitle).font(.subheadline.weight(.semibold)).lineLimit(2)
                if let context = action.context { Text(context).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
            }
            Spacer(minLength: 0)
            Image(systemName: action.preferredAction.map(actionIcon) ?? "sparkles")
            Image(systemName: "chevron.right").font(.caption)
        }.fixedSize(horizontal: false, vertical: true).frame(minHeight: 54)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Next action: \(action.sourceTitle) at \((action.notificationDate ?? now).formatted(date: .omitted, time: .shortened)), \(actionTimeLabel(action, now: now))")
    }
}

struct ActionQueueSheet: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject private var coordinator = TaskActionCoordinator.shared
    @Environment(\.dismiss) private var dismiss
    @State private var selectedTask: NexdoTask?
    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 60)) { context in
                let queue = TodayActionQueue(actions: coordinator.actions, tasks: model.tasks, now: context.date, timeZone: .current)
                let all = [queue.primaryAction].compactMap { $0 } + queue.nextActions + queue.laterActions
                List {
                    ForEach([true, false], id: \.self) { due in
                        let actions = all.filter { (($0.notificationDate ?? .distantFuture) <= context.date) == due }
                        if !actions.isEmpty {
                            Section(due ? "Due now" : "Upcoming") {
                                ForEach(actions) { action in
                                    Button { selectedTask = model.tasks.first { $0.id == action.taskId } } label: {
                                        NextActionRow(action: action, now: context.date)
                                            .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                                    }.buttonStyle(.plain)
                                        .accessibilityHint("Open task details")
                                }
                            }
                        }
                    }
                }.overlay { if all.isEmpty { ContentUnavailableView("No actions today", systemImage: "checkmark.circle") } }
            }.navigationTitle("Nexdo Actions").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { closeActionQueue() } } }
        }.sheet(item: $selectedTask) { task in
            TaskDetailsView(task: task)
        }
    }

    private func closeActionQueue() {
        dismiss()
    }
}

private func actionIcon(_ channel: TaskActionChannel) -> String {
    switch channel { case .call: "phone.fill"; case .message: "message.fill"; case .email: "envelope.fill" }
}
private func actionTimeLabel(_ action: TaskAction, now: Date) -> String {
    let seconds = (action.notificationDate ?? now).timeIntervalSince(now)
    if seconds > 0 { return "in \(actionDurationLabel(minutes: max(1, Int(ceil(seconds / 60)))))" }
    if seconds > -60 { return "Due now" }
    return "\(actionDurationLabel(minutes: Int(-seconds / 60))) overdue"
}

private func actionDurationLabel(minutes: Int) -> String {
    let hours = minutes / 60
    let remainder = minutes % 60
    guard hours > 0 else { return "\(minutes) min" }
    return remainder == 0 ? "\(hours) hr" : "\(hours) hr \(remainder) min"
}
