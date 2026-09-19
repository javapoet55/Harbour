import SwiftUI

/// Progressive disclosure keeps the Today page short without hiding actionable issues.
struct TodayAttentionSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var editing: NexdoTask?
    @State private var rescheduling = false
    @State private var start = Date().addingTimeInterval(3600)
    @State private var saving = false
    @State private var failure: String?

    private var tasks: [NexdoTask] { OverdueTasks.results(model.tasks) }
    private var checks: [ScheduleIntelligenceResponse.Today.AttentionItem] {
        model.scheduleIntelligence?.today.attention.filter { $0.id != "overdue" } ?? []
    }
    var body: some View {
        List {
            if tasks.isEmpty && checks.isEmpty {
                ContentUnavailableView("All caught up", systemImage: "checkmark.circle", description: Text("Nothing needs attention right now."))
            }
            if model.tasksLoadFailed {
                Text("Couldn’t refresh tasks. Pull down to retry.").foregroundStyle(.secondary)
            }
            if !tasks.isEmpty {
                Section("\(tasks.count) overdue task\(tasks.count == 1 ? "" : "s")") {
                    ForEach(tasks) { task in
                        HStack(spacing: 12) {
                            Button {
                                Task {
                                    do {
                                        try await model.changeTaskStatus(task, status: "COMPLETED")
                                        await model.refreshScheduleIntelligence()
                                    } catch { failure = error.localizedDescription }
                                }
                            } label: {
                                Image(systemName: "circle").font(.title2).frame(width: 44, height: 44)
                            }.buttonStyle(.borderless).disabled(model.busy || saving)
                                .accessibilityLabel("Complete \(task.title)")
                            Button { editing = task } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(task.title).font(.headline).foregroundStyle(Color.nexdoInk)
                                    if let due = (task.startAt ?? task.dueAt).flatMap(ServerDate.parse) {
                                        Text("Overdue · \(due.formatted(.dateTime.month(.abbreviated).day()))")
                                            .font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                                    }
                                }.frame(maxWidth: .infinity, alignment: .leading)
                            }.buttonStyle(.borderless)
                            Button { editing = task } label: {
                                Image(systemName: "calendar").frame(width: 44, height: 44)
                                    .background(Color.nexdoIndigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                            }.buttonStyle(.borderless).accessibilityLabel("Reschedule \(task.title)")
                        }.padding(.vertical, 4)
                    }
                }
                Section {
                    Button { start = Date().addingTimeInterval(3600); rescheduling = true } label: {
                        Label("Reschedule all", systemImage: "calendar").font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }.buttonStyle(.borderedProminent).disabled(model.busy || saving)
                } footer: { Text("Complete a task or choose a new date.") }
            }
            if !checks.isEmpty {
                Section("Schedule checks") {
                    ForEach(checks) { check in
                        NavigationLink {
                            List {
                                Text(check.explanation)
                                Text(check.recommendedAction).foregroundStyle(.secondary)
                                ForEach(model.tasks.filter { check.taskIds?.contains($0.id) == true }) { task in
                                    Button(task.title) { editing = task }
                                }
                            }.navigationTitle(check.title).navigationBarTitleDisplayMode(.inline)
                        } label: { Text(check.title).font(.headline) }
                    }
                }
            }
            if let failure { Text(failure).foregroundStyle(.red) }
        }
        .navigationTitle("Needs attention").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() }.disabled(saving) } }
        .interactiveDismissDisabled(saving)
        .refreshable { await model.refreshTasks(); await model.refreshScheduleIntelligence() }
        .sheet(item: $editing, onDismiss: { Task { await model.refreshTasks(); await model.refreshScheduleIntelligence() } }) { task in
            NavigationStack { TaskEditor(task: task) }
        }
        .sheet(isPresented: $rescheduling) {
            NavigationStack {
                Form {
                    DatePicker("Start at", selection: $start, in: Date()...)
                    Text("Schedule overdue tasks one after another, using each task’s duration. Existing calendar events are not moved.")
                    if let failure { Text(failure).foregroundStyle(.red) }
                    Button(saving ? "Rescheduling…" : "Reschedule \(tasks.count) tasks") { Task { await rescheduleAll() } }
                        .disabled(saving || model.busy || tasks.isEmpty || start <= Date())
                }.navigationTitle("Reschedule all").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { rescheduling = false }.disabled(saving) } }
                    .interactiveDismissDisabled(saving)
            }.presentationDetents([.medium, .large])
        }
    }

    private func rescheduleAll() async {
        guard !saving, start > Date() else { return }
        saving = true; failure = nil
        defer { saving = false }
        var next = start
        // Use the existing scheduling API, including its conflict validation.
        // Stop at the first failure; completed changes remain visible and are not retried.
        for task in tasks {
            let original = TaskDraft(task: task)
            var draft = original
            draft.schedule = next
            do {
                try await model.saveTaskDetails(task: task, draft: draft, original: original)
                next = next.addingTimeInterval(Double(max(1, task.durationMin)) * 60)
            } catch {
                failure = "Couldn’t reschedule \(task.title): \(error.localizedDescription). Earlier changes were saved."
                await model.refreshTasks()
                return
            }
        }
        rescheduling = false
        await model.refreshTasks()
        await model.refreshScheduleIntelligence()
    }
}
