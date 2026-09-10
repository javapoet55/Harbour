import SwiftUI

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
    var body: some View {
        VStack(spacing: 16) {
            if let action = queue.primaryAction {
                ActionNeededCard(action: action, now: now, overdueCount: queue.overdueCount,
                    onExecute: { selection = TodayActionSelection(action: action, channel: $0) }, onTask: { onTask(action.taskId) })
            }
            if !queue.nextActions.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("Next up", systemImage: "clock").font(.headline)
                        Text("\(queue.nextActions.count) actions").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button("View all") { showingAll = true }.font(.subheadline)
                            .accessibilityIdentifier("today.actions.viewAll")
                    }
                    ForEach(queue.nextActions.prefix(3)) { action in
                        Divider()
                        Button { selection = TodayActionSelection(action: action) } label: {
                            NextActionRow(action: action, now: now)
                        }.buttonStyle(.plain)
                    }
                }.padding(16).modifier(ActionGlass())
            }
        }
        .sheet(item: $selection) { value in
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
    @ObservedObject private var coordinator = TaskActionCoordinator.shared
    @Environment(\.dynamicTypeSize) private var typeSize
    let action: TaskAction
    let now: Date
    let overdueCount: Int
    let onExecute: (TaskActionChannel) -> Void
    let onTask: () -> Void
    private var contact: ActionContact? { action.contactIdentifier.flatMap { coordinator.resolvedContacts[$0] } }
    private var channels: [TaskActionChannel] {
        guard let contact else { return TaskActionChannel.allCases }
        return TaskActionChannel.allCases.filter { $0 == .email ? !contact.emails.isEmpty : !contact.phones.isEmpty }
    }
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
            Text("Time to contact \(action.contactName)").font(.title2.bold())
            if let context = action.context { Text(context).foregroundStyle(Color.nexdoSecondary) }
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle.fill").font(.largeTitle).foregroundStyle(Color.nexdoBlue)
                VStack(alignment: .leading, spacing: 3) {
                    Text(contact?.name ?? action.contactName).font(.headline)
                    Text(contact.map { $0.phones.first?.value ?? $0.emails.first?.value ?? "No contact details" } ?? "Choose an action to find this contact")
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
                            Text(channel == .message ? "iMessage" : channel.rawValue.capitalized).font(.subheadline.weight(.semibold))
                        }.frame(maxWidth: .infinity, minHeight: 76)
                            .foregroundStyle(channel == .call ? Color.green : channel == .message ? Color.nexdoBlue : Color.purple)
                            .background((channel == .call ? Color.green : channel == .message ? Color.nexdoBlue : Color.purple).opacity(0.13), in: RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain).accessibilityLabel("\(channel.rawValue.capitalized) \(action.contactName)")
                        .accessibilityIdentifier("today.actions.\(channel.rawValue)")
                }
            }
            if channels.isEmpty { Button("Choose contact") { onExecute(action.preferredAction ?? .call) } }
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
            Label("Remind me later", systemImage: "clock").frame(maxWidth: .infinity, minHeight: 44)
        }.buttonStyle(.bordered).accessibilityLabel("Remind \(action.contactName) task later")
            .accessibilityIdentifier("today.actions.snooze")
            .sheet(isPresented: $choosing) {
                NavigationStack {
                    DatePicker("Remind me at", selection: $date, in: Date()...).padding()
                        .navigationTitle("Remind me later")
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
    @State private var selection: TodayActionSelection?
    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 60)) { context in
                let queue = TodayActionQueue(actions: coordinator.actions, tasks: model.tasks, now: context.date, timeZone: .current)
                let all = [queue.primaryAction].compactMap { $0 } + queue.nextActions + queue.laterActions
                List {
                    ForEach([true, false], id: \.self) { due in
                        Section(due ? "Due now" : "Upcoming") {
                            ForEach(all.filter { (($0.notificationDate ?? .distantFuture) <= context.date) == due }) { action in
                                Button { selection = TodayActionSelection(action: action) } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        NextActionRow(action: action, now: context.date)
                                        Text(action.preferredAction?.rawValue.capitalized ?? "Call • Message • Email").font(.caption).foregroundStyle(Color.nexdoSecondary)
                                    }
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                }.overlay { if all.isEmpty { ContentUnavailableView("No actions today", systemImage: "checkmark.circle") } }
            }.navigationTitle("Nexdo Actions").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { closeActionQueue() } } }
        }.sheet(item: $selection) { value in
            TaskActionView(actionID: value.action.id, preferred: value.action.preferredAction)
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
    if seconds > 0 { return "in \(max(1, Int(ceil(seconds / 60)))) min" }
    if seconds > -60 { return "Due now" }
    return "\(Int(-seconds / 60)) min overdue"
}
