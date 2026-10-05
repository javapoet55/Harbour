import SwiftUI

struct TaskDetailsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let task: NexdoTask
    enum InitialSection { case notes, schedule }
    private let initialSection: InitialSection?
    @State private var draft: TaskDraft
    @State private var original: TaskDraft
    @State private var newStep = ""
    @State private var hasBusinessResearch = false
    @State private var showMoreDetails = false
    @State private var working = false
    @State private var message: String?
    @FocusState private var focus: Field?
    enum Field: Hashable { case title, step, notes, agentLocation, agentDraft(String) }

    init(task: NexdoTask, initialSection: InitialSection? = nil) {
        self.task = task
        self.initialSection = initialSection
        _draft = State(initialValue: TaskDraft(task: task))
        _original = State(initialValue: TaskDraft(task: task))
    }

    private var currentTask: NexdoTask { model.tasks.first { $0.id == task.id } ?? task }
    private var zone: TimeZone { TimeZone(identifier: model.profile?.timeZone ?? task.timeZone ?? TimeZone.current.identifier) ?? .current }
    private var blocked: Bool { working || model.busy }
    private var dirty: Bool { draft != original || !newStep.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        TaskAgentCard(taskID: task.id, focusedField: $focus) { hasBusinessResearch = $0 }
                        if !hasBusinessResearch {
                            TaskActionCard(task: currentTask)
                            actions
                        }
                        if hasBusinessResearch {
                            agentTaskInformation
                        } else {
                        field("TASK") {
                            TextField("Task title", text: $draft.title)
                                .focused($focus, equals: .title).submitLabel(.done)
                                .onSubmit { focus = nil }
                                .accessibilityLabel("Task title")
                                .modifier(DetailInput(focused: focus == .title))
                        }.id(Field.title)
                        metadata
                        field("PROJECT") { ProjectAssignmentField(projectID: $draft.projectId) }
                        }
                        if !hasBusinessResearch || showMoreDetails {
                        schedule.id("schedule")
                        field("REPEAT") {
                            menu("Repeat", value: $draft.recurrence, options: ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
                        }
                        Toggle(isOn: $draft.critical) {
                            VStack(alignment: .leading, spacing: 5) {
                                Text("Important reminders").font(.subheadline.weight(.semibold))
                                Text("Use escalation channels").font(.caption).foregroundStyle(Color.nexdoSecondary)
                            }
                        }.toggleStyle(DetailCheckboxStyle())
                        steps.id(Field.step)
                        field("NOTES") {
                            TextField("Context, links, or anything you need to remember...", text: $draft.notes, axis: .vertical)
                                .lineLimit(4...20).focused($focus, equals: .notes)
                                .accessibilityLabel("Task notes")
                                .modifier(DetailInput())
                        }.id(Field.notes)
                        }
                    }
                    .padding(20)
                    .disabled(blocked)
                }
                .onAppear {
                    if let initialSection {
                        showMoreDetails = true
                        if initialSection == .notes { focus = .notes; proxy.scrollTo(Field.notes, anchor: .center) }
                        else { proxy.scrollTo("schedule", anchor: .center) }
                    }
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: focus) { _, value in
                    if let value { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { proxy.scrollTo(value, anchor: .center) } }
                }
            }
        }
        .foregroundStyle(Color.nexdoInk)
        .background(Color(uiColor: .systemBackground))
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if focus == nil { footer }
        }
        .environment(\.timeZone, zone)
        .interactiveDismissDisabled(blocked)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focus = nil } }
        }
        .onChange(of: currentTask.title) { _, title in
            if draft.title == original.title { draft.title = title }
            original.title = title
        }
        .onChange(of: currentTask.subtasks) { _, steps in
            if draft.steps == original.steps { draft.steps = steps ?? [] }
            original.steps = steps ?? []
        }
        .onDisappear { focus = nil }
        .alert("Task details", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(message ?? "") }
    }

    @ViewBuilder private var header: some View {
        if hasBusinessResearch {
            HStack {
                Button(action: closeTaskDetails) { Image(systemName: "chevron.left").font(.title3).frame(width: 42, height: 42) }
                    .background(Color.nexdoIndigo.opacity(0.04), in: Circle()).overlay(Circle().stroke(Color.nexdoIndigo.opacity(0.12)))
                    .accessibilityLabel("Back")
                Spacer()
                Text("Task Details").font(.headline)
                Spacer()
                Button(action: closeTaskDetails) {
                    Image(systemName: "xmark").font(.title3).frame(width: 42, height: 42)
                }
                    .background(Color.nexdoIndigo.opacity(0.04), in: Circle()).overlay(Circle().stroke(Color.nexdoIndigo.opacity(0.12)))
                    .accessibilityLabel("Close task details")
            }.buttonStyle(.plain).padding(.horizontal, 20).padding(.vertical, 14).disabled(blocked)
        } else {
        HStack {
            VStack(alignment: .leading, spacing: 5) {
                Text("TASK DETAILS").font(.caption.weight(.bold)).tracking(1.7).foregroundStyle(Color.nexdoIndigo)
                if let lifeReminderLabel = currentTask.lifeReminderLabel {
                    Label(lifeReminderLabel, systemImage: "sparkles")
                        .font(.caption.weight(.semibold)).foregroundStyle(Color.nexdoMagenta)
                        .accessibilityLabel("Smart reminder: \(lifeReminderLabel)")
                }
                Text(draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? currentTask.title : draft.title)
                    .font(.title3.weight(.semibold))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer()
            Button { closeTaskDetails() } label: {
                Image(systemName: "xmark").font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.nexdoIndigo).frame(width: 44, height: 44)
                    .background(Color.nexdoIndigo.opacity(0.09), in: Circle())
            }.buttonStyle(.plain).accessibilityLabel("Close task details").disabled(blocked)
        }.padding(.horizontal, 20).padding(.vertical, 18)
            .overlay(alignment: .bottom) { Divider().overlay(Color.nexdoIndigo.opacity(0.10)) }
    }

    }

    private var actions: some View {
        VStack(spacing: 8) {
            if model.focusSession?.taskID == task.id {
                FocusSessionStrip()
            } else {
                Button("Start a 25-minute focus session") {
                    run { try await model.startFocus(currentTask) }
                }.buttonStyle(DetailOutlineButton(animatedBorder: true)).disabled(currentTask.isDone || !["INBOX", "PLANNED", "IN_PROGRESS"].contains(currentTask.status))
            }
            Button(currentTask.status == "IN_PROGRESS" ? "Task in progress" : "Start task") {
                run { try await model.changeTaskStatus(currentTask, status: "IN_PROGRESS") }
            }.buttonStyle(DetailOutlineButton()).disabled(currentTask.isDone || currentTask.status == "IN_PROGRESS")
        }
    }

    private var agentTaskInformation: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("TASK INFORMATION").font(.caption.weight(.bold)).tracking(1.8).foregroundStyle(Color.nexdoSecondary)
                Spacer()
                Menu {
                    Button(showMoreDetails ? "Hide additional details" : "Show additional details", systemImage: "slider.horizontal.3") {
                        focus = nil
                        showMoreDetails.toggle()
                    }
                } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.title3).foregroundStyle(Color.nexdoIndigo)
                        .frame(width: 44, height: 44)
                        .background(Color.nexdoIndigo.opacity(0.06), in: Circle())
                }
                .accessibilityLabel("Additional task details")
                .accessibilityValue(showMoreDetails ? "Shown" : "Hidden")
            }
            VStack(spacing: 18) {
                HStack(spacing: 10) {
                    taskIcon("doc.text", color: .nexdoBlue)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Task").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        TextField("Task", text: $draft.title).focused($focus, equals: .title).submitLabel(.done).onSubmit { focus = nil }.modifier(DetailInput()).accessibilityLabel("Task title")
                    }
                }
                let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 14)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
                layout {
                    HStack(spacing: 8) {
                        taskIcon("flag", color: .purple)
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Priority").font(.caption).foregroundStyle(Color.nexdoSecondary)
                            menu("Priority", value: $draft.priority, options: ["LOW", "NORMAL", "HIGH", "CRITICAL"])
                        }
                    }
                    HStack(spacing: 8) {
                        taskIcon("clock", color: .green)
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Estimate").font(.caption).foregroundStyle(Color.nexdoSecondary)
                            Menu {
                                ForEach(Array(Set([15, 30, 45, 60, 90, 120, draft.duration])).sorted(), id: \.self) { minutes in
                                    Button("\(minutes) min") { draft.duration = minutes }
                                }
                            } label: { menuLabel("\(draft.duration) min") }.accessibilityLabel("Estimate")
                        }
                    }
                }
                HStack(spacing: 10) {
                    taskIcon("folder", color: .orange)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Project").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        ProjectAssignmentField(projectID: $draft.projectId)
                    }
                }
            }.font(.subheadline).padding(14).background(.white, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.nexdoIndigo.opacity(0.05)))
                .shadow(color: Color.nexdoIndigo.opacity(0.04), radius: 10, y: 4)
        }
    }
    private func taskIcon(_ name: String, color: Color) -> some View {
        Image(systemName: name).font(.title3).foregroundStyle(color).frame(width: 36, height: 42)
            .background(color.opacity(0.09), in: RoundedRectangle(cornerRadius: 12)).accessibilityHidden(true)
    }

    private var metadata: some View {
        VStack(alignment: .leading, spacing: 16) {
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 16)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
            layout {
                field("PRIORITY") { menu("Priority", value: $draft.priority, options: ["LOW", "NORMAL", "HIGH", "CRITICAL"]) }
                field("ESTIMATE") {
                    Menu {
                        ForEach(Array(Set([15, 30, 45, 60, 90, 120, draft.duration])).sorted(), id: \.self) { minutes in
                            Button("\(minutes) min") { draft.duration = minutes }
                        }
                        ControlGroup {
                            Button("Less", systemImage: "minus") { draft.duration = max(1, draft.duration - 5) }
                            Button("More", systemImage: "plus") { draft.duration = min(1440, draft.duration + 5) }
                        }
                    } label: { menuLabel("\(draft.duration) min") }
                    .accessibilityLabel("Estimate").accessibilityValue("\(draft.duration) minutes")
                }
            }
        }
    }

    private var schedule: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("SCHEDULE")
            if draft.schedule != nil {
                let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
                layout {
                    DatePicker("Schedule date", selection: scheduleBinding, displayedComponents: .date)
                        .datePickerStyle(.compact).labelsHidden()
                        .accessibilityLabel("Schedule date")
                        .frame(minHeight: 44)
                    DatePicker("Start time", selection: scheduleBinding, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.compact).labelsHidden()
                        .accessibilityLabel("Start time")
                        .frame(minHeight: 44)
                }
            } else {
                Button { draft.schedule = Date() } label: { Label("Set date and start time", systemImage: "calendar") }
                    .buttonStyle(DetailOutlineButton())
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
            .padding(12).background(.background, in: RoundedRectangle(cornerRadius: 17))
            .overlay(RoundedRectangle(cornerRadius: 17).stroke(Color.nexdoIndigo.opacity(0.16)))
    }

    private var scheduleBinding: Binding<Date> {
        Binding(get: { draft.schedule ?? Date() }, set: { draft.schedule = $0 })
    }

    private var steps: some View {
        field("STEPS") {
            VStack(spacing: 8) {
                ForEach(draft.steps) { step in
                    HStack {
                        Image(systemName: step.completedAt == nil ? "circle" : "checkmark.circle.fill").accessibilityHidden(true)
                        Text(step.title).frame(maxWidth: .infinity, alignment: .leading)
                        Button {
                            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) { draft.steps.removeAll { $0.id == step.id } }
                        } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                            .accessibilityLabel("Remove step \(step.title)")
                    }.modifier(DetailInput())
                }
                HStack(spacing: 8) {
                    TextField("Add a step", text: $newStep).focused($focus, equals: .step)
                        .submitLabel(.done).onSubmit(addStep).accessibilityLabel("Add task step")
                        .modifier(DetailInput())
                    Button("Add", action: addStep).buttonStyle(DetailOutlineButton())
                        .fixedSize(horizontal: true, vertical: false)
                        .disabled(newStep.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draft.steps.count >= 50)
                }
                if draft.steps.count >= 50 { Text("Up to 50 steps per task.").font(.caption).foregroundStyle(Color.nexdoSecondary) }
            }
        }
    }

    private var footer: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            if hasBusinessResearch {
                Button { run { try await persist(); dismiss() } } label: { Label("Save changes", systemImage: "doc.text").foregroundStyle(Color.nexdoIndigo) }
                    .buttonStyle(DetailOutlineButton()).disabled(!draft.isValid || !dirty)
                    .accessibilityLabel("Save task changes")
            }
            Button {
                run {
                    // Save the edit buffer before the status branch, which ignores form fields.
                    if dirty { try await persist() }
                    try await model.changeTaskStatus(currentTask, status: currentTask.isDone ? "PLANNED" : "COMPLETED")
                    dismiss()
                }
            } label: { Label(currentTask.isDone ? "Mark incomplete" : "Mark complete", systemImage: "checkmark") }
            .buttonStyle(DetailOutlineButton(greenBackground: true))
                .accessibilityLabel(currentTask.isDone ? "Mark task incomplete" : "Mark task complete")
                .disabled(!draft.isValid)
            if !hasBusinessResearch {
            Button {
                run { try await persist(); dismiss() }
            } label: {
                HStack {
                    if working { ProgressView().tint(.white) }
                    Text(working ? "Saving…" : "Save changes").font(.subheadline.weight(.semibold))
                }.frame(maxWidth: .infinity, minHeight: 46)
                    .padding(.horizontal, 12).foregroundStyle(.white)
                    .background(NexdoTheme.saveGradient, in: Capsule())
            }.buttonStyle(.plain).accessibilityLabel("Save task changes")
                .disabled(!draft.isValid || !dirty)
                .opacity(draft.isValid && dirty ? 1 : 0.55)
            }
        }.disabled(blocked).padding(.horizontal, 16).padding(.vertical, 12)
            .background(.regularMaterial)
            .overlay(alignment: .top) { Divider().overlay(Color.nexdoIndigo.opacity(0.1)) }
    }

    private func addStep() {
        let value = newStep.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, draft.steps.count < 50 else { return }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
            draft.steps.append(TaskStep(id: UUID().uuidString, title: value, completedAt: nil, sortOrder: draft.steps.count))
            newStep = ""
        }
    }

    private func persist() async throws {
        addStep()
        guard newStep.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw TaskEditError.stepLimit }
        try await model.saveTaskDetails(task: currentTask, draft: draft, original: original)
        original = draft
    }

    private func run(_ action: @escaping @MainActor () async throws -> Void) {
        guard !blocked else { return }
        focus = nil; working = true
        Task { @MainActor in
            defer { working = false }
            do { try await action() }
            catch is CancellationError { /* Keep edits available after declining a schedule warning. */ }
            catch { message = (error as? TaskEditError)?.errorDescription ?? "Couldn’t update your task. Your edits are still here. Please try again." }
        }
    }

    private func closeTaskDetails() {
        focus = nil
        dismiss()
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title).font(.caption.weight(.bold)).foregroundStyle(Color.nexdoSecondary).accessibilityAddTraits(.isHeader)
    }
    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) { sectionLabel(title); content() }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func menu(_ title: String, value: Binding<String>, options: [String]) -> some View {
        Menu {
            Picker(title, selection: value) {
                ForEach(Array(Set(options + [value.wrappedValue])).sorted(), id: \.self) { item in
                    Text(item == "NONE" ? "Does not repeat" : item.capitalized).tag(item)
                }
            }
        } label: { menuLabel(value.wrappedValue == "NONE" ? "Does not repeat" : value.wrappedValue.capitalized) }
            .accessibilityLabel(title).accessibilityValue(value.wrappedValue == "NONE" ? "Does not repeat" : value.wrappedValue.capitalized)
    }
    private func menuLabel(_ title: String) -> some View {
        HStack { Text(title); Spacer(minLength: 8); Image(systemName: "chevron.down").font(.caption) }
            .modifier(DetailInput())
    }
}

private struct DetailInput: ViewModifier {
    var focused = false
    func body(content: Content) -> some View {
        content.padding(.horizontal, 14).padding(.vertical, 11).frame(minHeight: 44)
            .background(.background, in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(focused ? Color.nexdoBlue : Color.nexdoIndigo.opacity(0.16), lineWidth: focused ? 2 : 1))
    }
}

private struct DetailOutlineButton: ButtonStyle {
    var animatedBorder = false
    var greenBackground = false
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.subheadline.weight(.semibold)).foregroundStyle(greenBackground ? Color.white : Color.nexdoInk)
            .frame(maxWidth: .infinity, minHeight: 44).padding(.horizontal, 14)
            .padding(.vertical, typeSize.isAccessibilitySize ? 8 : 0)
            .background {
                if greenBackground {
                    RoundedRectangle(cornerRadius: 13).fill(LinearGradient(
                        colors: [Color(red: 0, green: 0.68, blue: 0.39), Color(red: 0, green: 0.49, blue: 0.46)],
                        startPoint: .leading, endPoint: .trailing))
                } else {
                    RoundedRectangle(cornerRadius: 13).fill(Color(uiColor: .systemBackground))
                }
            }
            .overlay {
                if animatedBorder { FocusButtonBorder() }
                else if !greenBackground { RoundedRectangle(cornerRadius: 13).stroke(Color.nexdoIndigo.opacity(0.16)) }
            }
            .opacity(!isEnabled ? 0.45 : configuration.isPressed ? 0.65 : 1)
    }
}

private struct FocusButtonBorder: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || scenePhase != .active || !isEnabled)) { context in
            let phase = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 6) / 6
            RoundedRectangle(cornerRadius: 13).strokeBorder(
                AngularGradient(colors: [.nexdoBlue, .nexdoIndigo, .nexdoMagenta, .nexdoBlue], center: .center, angle: .degrees(phase * 360)),
                lineWidth: 2)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct DetailCheckboxStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 12) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .foregroundStyle(configuration.isOn ? Color.nexdoIndigo : Color.nexdoSecondary)
                configuration.label.frame(maxWidth: .infinity, alignment: .leading)
            }.padding(16).frame(minHeight: 58)
                .background(.background, in: RoundedRectangle(cornerRadius: 17))
                .overlay(RoundedRectangle(cornerRadius: 17).stroke(Color.nexdoIndigo.opacity(0.16)))
                .contentShape(Rectangle())
        }.buttonStyle(.plain)
            .accessibilityRepresentation { Toggle(isOn: configuration.$isOn) { configuration.label } }
    }
}
