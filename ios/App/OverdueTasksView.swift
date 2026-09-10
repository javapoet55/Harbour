import SwiftUI

struct OverdueTasksView: View {
    @EnvironmentObject private var model: AppModel
    @State private var editing: NexdoTask?

    private func deadlineLabel(_ due: Date, task: NexdoTask) -> String {
        let formatter = DateFormatter()
        let zone = model.profile?.timeZone ?? task.timeZone ?? TimeZone.current.identifier
        formatter.timeZone = TimeZone(identifier: zone) ?? .current
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: due)
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let tasks = OverdueTasks.results(model.tasks, now: context.date)
            List {
                if model.tasksLoadFailed {
                    Section {
                        Text("Couldn’t refresh overdue tasks. Showing the available tasks.")
                        Button("Retry") { Task { await model.refreshTasks() } }
                    }
                }
                if tasks.isEmpty {
                    if model.tasksLoading {
                        ProgressView("Loading overdue tasks…")
                    } else if !model.tasksLoadFailed {
                        ContentUnavailableView("No unfinished deadlines", systemImage: "checkmark.circle", description: Text("You have no overdue tasks."))
                    }
                } else {
                    Section("\(tasks.count) unfinished \(tasks.count == 1 ? "deadline" : "deadlines")") {
                        ForEach(tasks) { task in
                            Button { editing = task } label: {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(task.title).font(.headline).foregroundStyle(Color.nexdoInk)
                                        let value = (task.startAt ?? task.dueAt).flatMap(ServerDate.parse)
                                        if let due = value {
                                            Text("Due \(deadlineLabel(due, task: task))")
                                                .font(.subheadline).foregroundStyle(.red)
                                        }
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").foregroundStyle(Color.nexdoSecondary)
                                }
                                .padding(.vertical, 6)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Opens task details to complete or reschedule")
                        }
                    }
                }
            }
        }
        .navigationTitle("Unfinished deadlines")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .task { await model.refreshTasks() }
        .onChange(of: editing?.id) { _, value in
            guard value == nil else { return }
            // Task detail edits can update scheduling fields in a separate
            // request. Reload the canonical task so the deadline label and
            // overdue membership reflect the saved date immediately.
            Task { await model.refreshTasks() }
        }
        .refreshable { await model.refreshTasks() }
        .sheet(item: $editing) { task in
            NavigationStack { TaskEditor(task: task) }
                .presentationDetents([.large])
                .presentationCornerRadius(30)
        }
    }
}
