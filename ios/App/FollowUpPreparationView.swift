import SwiftUI

/// One saved preparation is reused from the task, Today, and its notification.
struct FollowUpPreparationView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let task: NexdoTask
    let action: TaskAction
    let initialContact: TaskActionRecipient?
    let saved: (FollowUpPreparation) -> Void
    @State private var value: FollowUpPreparation
    @State private var revision = 0
    @State private var loading = true
    @State private var busy = false
    @State private var loaded = false
    @State private var error: String?
    @State private var outcome = "unresolved"
    @State private var outcomeNotes = ""
    @State private var recordedID: String?
    @State private var nextDate = Date().addingTimeInterval(86400)
    @State private var useSchedule = false
    @State private var newCheck = ""
    init(task: NexdoTask, action: TaskAction, initialContact: TaskActionRecipient? = nil, saved: @escaping (FollowUpPreparation) -> Void) {
        self.task = task; self.action = action; self.saved = saved; self.initialContact = initialContact
        _useSchedule = State(initialValue: action.notificationDate == nil && !task.isDone)
        _value = State(initialValue: action.preparation ?? FollowUpPreparation(company: action.contactName, purpose: action.context ?? "", notes: task.notes ?? ""))
        _nextDate = State(initialValue: max(action.notificationDate ?? Date(), Date().addingTimeInterval(3600)))
    }
    var body: some View {
        NavigationStack {
            Form {
                if loading { ProgressView("Loading preparation…") }
                Section("Follow-up") {
                    TextField("Company or contact", text: $value.company)
                    TextField("What do you need to follow up about?", text: $value.purpose, axis: .vertical)
                    TextField("Phone (optional)", text: $value.phone).keyboardType(.phonePad)
                    TextField("Email (optional)", text: $value.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if let date = action.notificationDate { LabeledContent("Scheduled", value: date.formatted(date: .abbreviated, time: .shortened)) }
                    Toggle("Set or change follow-up time", isOn: $useSchedule)
                    if useSchedule { DatePicker("Follow-up time", selection: $nextDate, in: Date()...) }
                }
                Section("Preparation notes") {
                    TextField("Reference numbers, previous discussion and questions", text: $value.notes, axis: .vertical).lineLimit(3...8)
                }
                Section("Checklist") {
                    ForEach($value.checklist) { $check in
                        Toggle(isOn: $check.done) { TextField("Preparation step", text: $check.title) }
                    }.onDelete { value.checklist.remove(atOffsets: $0) }
                    HStack {
                        TextField("Add a preparation step", text: $newCheck)
                        Button("Add") { value.checklist.append(.init(newCheck)); newCheck = "" }
                            .disabled(newCheck.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || value.checklist.count >= 30)
                    }
                }
                Section("Editable message draft") {
                    TextEditor(text: $value.draft).frame(minHeight: 150)
                    Button("Create draft from purpose") {
                        value.draft = FollowUpPreparation(company: value.company, purpose: value.purpose, notes: value.notes).draft
                    }
                    Text("Save this preparation to your NexDo account. Call and email remain under your control.").font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    Button("Save preparation") { save(then: nil) }.disabled(!canSave)
                }
                if !task.isDone {
                    Section("Record outcome") {
                        Picker("Result", selection: $outcome) {
                            Text("Unresolved / waiting for response").tag("unresolved")
                            Text("No answer").tag("noAnswer")
                            Text("Resolved").tag("resolved")
                        }.disabled(recordedID != nil)
                        TextField("What happened? What is the next step?", text: $outcomeNotes, axis: .vertical).disabled(recordedID != nil)
                        if outcome != "resolved" {
                            DatePicker("Next follow-up", selection: $nextDate, in: Date()...)
                            Button("Record and schedule next follow-up") { save(then: "schedule") }.disabled(!canSave)
                        } else {
                            Button("Record and complete task") { save(then: "complete") }.disabled(!canSave)
                        }
                    }
                }
                if !value.outcomes.isEmpty {
                    Section("Outcome history") {
                        ForEach(value.outcomes.reversed()) { item in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.result == "noAnswer" ? "No answer" : item.result.capitalized).bold()
                                if let date = ServerDate.parse(item.date) { Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption) }
                                Text(item.notes)
                            }
                        }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red); if !loaded { Button("Retry loading") { Task { await load() } } } } }
            }
            .disabled(busy || loading)
            .navigationTitle("Follow-up preparation").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Close") { dismiss() }.disabled(busy) }
            .interactiveDismissDisabled(busy)
            .task { await load() }
        }
    }
    private var canSave: Bool { loaded && !loading && !busy && !value.company.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !value.purpose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private func load() async {
        do {
            let result = try await model.loadFollowUp(task.id)
            revision = result.revision
            if let existing = result.preparation { value = existing }
            else if let recipient = initialContact ?? action.manualRecipient { value.company = recipient.name; value.phone = recipient.phone; value.email = recipient.email }
            loading = false; loaded = true
        } catch { self.error = error.localizedDescription; loading = false }
    }
    private func save(then operation: String?) {
        busy = true; error = nil
        Task {
            defer { busy = false }
            do {
                if operation != nil && recordedID == nil {
                    let item = FollowUpPreparation.Outcome(result: outcome, notes: outcomeNotes)
                    value.outcomes.append(item); recordedID = item.id
                }
                let result = try await model.saveFollowUp(task.id, value: .init(revision: revision, preparation: value))
                revision = result.revision; saved(value)
                if operation == "complete" { try await model.changeTaskStatus(task, status: "COMPLETED") }
                else if operation == "schedule" || useSchedule { try await model.scheduleFollowUp(task, at: nextDate) }
                dismiss()
            } catch {
                self.error = error.localizedDescription
                // Keep entered content and the outcome ID, so retry does not append another outcome.
            }
        }
    }
}
