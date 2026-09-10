import SwiftUI

private enum ProjectStyle {
    static let accent = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.70, green: 0.64, blue: 1, alpha: 1) : UIColor(red: 0.25, green: 0.16, blue: 0.78, alpha: 1) })
    static let surface = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.055, green: 0.05, blue: 0.105, alpha: 1) : .secondarySystemGroupedBackground })
    static func color(_ hex: String) -> Color {
        let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x8875ff
        return Color(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}

struct ProjectsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var search = ""
    @State private var sort: ProjectSort = .updated
    @State private var adding = false
    private var visible: [NexdoProject] { ProjectQuery.results(model.projects, search: search, sort: sort) }
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(spacing: 10) {
                        ProjectSearchField(placeholder: "Search projects", text: $search)
                        Menu {
                            Picker("Sort projects", selection: $sort) { ForEach(ProjectSort.allCases) { Text($0.rawValue).tag($0) } }
                        } label: {
                            Image(systemName: "slider.horizontal.3").font(.title3).frame(width: 48, height: 50)
                                .background(.background.opacity(0.8), in: RoundedRectangle(cornerRadius: 14))
                        }.accessibilityLabel("Sort projects").accessibilityValue(sort.rawValue)
                    }
                    HStack {
                        Text("Projects").font(.title2.bold())
                        Spacer()
                        Button { adding = true } label: { Label("New project", systemImage: "plus").font(.subheadline.weight(.semibold)).frame(minHeight: 44) }
                    }
                    if model.projectsLoading && !model.projectsLoaded { ProgressView("Loading projects…").frame(maxWidth: .infinity).padding() }
                    if let error = model.projectsError {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(error).font(.subheadline)
                            if model.projectsLoaded { Text("Showing saved projects.").font(.caption).foregroundStyle(.secondary) }
                            Button("Retry") { Task { await model.refreshProjects() } }.frame(minHeight: 44)
                        }.accessibilityElement(children: .contain)
                    }
                    if model.projectsLoaded && visible.isEmpty && (search.isEmpty || !CalendarSearch.matches("No project", query: search)) {
                        ContentUnavailableView(search.isEmpty ? "Organize your tasks" : "No matching projects", systemImage: "folder", description: Text(search.isEmpty ? "Create a project to keep related tasks together." : "Try a different project name."))
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: typeSize.isAccessibilitySize || geometry.size.width < 340 ? 1 : 2), alignment: .leading, spacing: 12) {
                        ForEach(visible) { project in
                            NavigationLink { ProjectDetailView(projectID: project.id) } label: { ProjectCard(project: project) }.buttonStyle(.plain)
                        }
                    }
                    if model.projectsLoaded && CalendarSearch.matches("No project", query: search) {
                        NavigationLink { ProjectDetailView(projectID: nil) } label: {
                            HStack(spacing: 16) {
                                ProjectFolder(color: .secondary)
                                let unassigned = model.tasks.filter { $0.projectId == nil && $0.status != "CANCELLED" }
                                VStack(alignment: .leading, spacing: 5) {
                                    Text("No project").font(.headline)
                                    Text("Open: \(unassigned.filter { !$0.isDone }.count)   Done: \(unassigned.filter(\.isDone).count)")
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer(); Image(systemName: "chevron.right").foregroundStyle(.secondary)
                            }.padding(18).projectCardSurface()
                        }.buttonStyle(.plain).accessibilityHint("Opens unassigned tasks")
                    }
                }.padding(.bottom, 20)
            }.scrollDismissesKeyboard(.interactively).scrollIndicators(.hidden)
                .refreshable { await model.refreshTasks(); await model.refreshProjects() }
        }
        .foregroundStyle(Color.nexdoInk).tint(ProjectStyle.accent)
        .task { await model.refreshProjects() }
        .sheet(isPresented: $adding) { ProjectEditorView(project: nil) }
    }
}
private struct ProjectCard: View {
    let project: NexdoProject
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { ProjectFolder(color: ProjectStyle.color(project.color)); Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary) }
            Text(project.name).font(.headline).lineLimit(3).frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
            Text("Open: \(max(0, project.totalTaskCount - project.completedTaskCount))   Done: \(project.completedTaskCount)")
                .font(.subheadline).foregroundStyle(.secondary)
            ProgressView(value: project.progress).tint(ProjectStyle.color(project.color))
                .accessibilityLabel("Completion").accessibilityValue("\(project.completedTaskCount) of \(project.totalTaskCount) tasks completed")
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).projectCardSurface()
            .accessibilityElement(children: .combine).accessibilityHint("Opens project tasks")
    }
}
private struct ProjectFolder: View {
    let color: Color
    var body: some View { Image(systemName: "folder").font(.system(size: 22, weight: .semibold)).foregroundStyle(.white).frame(width: 48, height: 48).background(color.gradient, in: Circle()).accessibilityHidden(true) }
}
private extension View {
    func projectCardSurface() -> some View {
        self.background(ProjectStyle.surface.opacity(0.92), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(ProjectStyle.accent.opacity(0.25)))
    }
}
private struct ProjectSearchField: View {
    let placeholder: String
    @Binding var text: String
    var body: some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(placeholder, text: $text).autocorrectionDisabled().submitLabel(.search).accessibilityLabel(placeholder)
            if !text.isEmpty { Button { text = "" } label: { Image(systemName: "xmark.circle.fill").frame(width: 44, height: 44) }.accessibilityLabel("Clear search") }
        }.padding(.leading, 14).frame(minHeight: 50).projectCardSurface()
    }
}

struct ProjectEditorView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let project: NexdoProject?
    @State private var name: String
    @State private var color: String
    @State private var saving = false
    @State private var error: String?
    @FocusState private var nameFocused: Bool
    init(project: NexdoProject?) {
        self.project = project
        _name = State(initialValue: project?.name ?? "")
        _color = State(initialValue: project?.color ?? ProjectQuery.palette[0])
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Project name") {
                    TextField("Name", text: $name).focused($nameFocused).submitLabel(.done).onSubmit(save).accessibilityLabel("Project name")
                    if !name.isEmpty && !ProjectQuery.validName(name) { Text("Use 1–80 characters, excluding surrounding spaces.").font(.caption).foregroundStyle(.red) }
                }
                Section("Color") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 48))]) {
                        ForEach(Array(Set(ProjectQuery.palette + [color])).sorted(), id: \.self) { value in
                            Button { color = value } label: {
                                Circle().fill(ProjectStyle.color(value)).frame(width: 40, height: 40)
                                    .overlay { if color == value { Image(systemName: "checkmark").foregroundStyle(.white).bold() } }.frame(width: 48, height: 48)
                            }.buttonStyle(.plain).accessibilityLabel(colorName(value)).accessibilityAddTraits(color == value ? .isSelected : [])
                        }
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red); Button("Retry", action: save).disabled(saving || !ProjectQuery.validName(name)) } }
                if saving { ProgressView("Saving project…") }
            }
            .navigationTitle(project == nil ? "Add Project" : "Edit Project").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeProjectEditor() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) { Button("Done", action: save).disabled(saving || model.projectMutationBusy || !ProjectQuery.validName(name)) }
            }
        }.tint(ProjectStyle.accent).interactiveDismissDisabled(saving)
            .task { if project == nil { nameFocused = true } }
    }
    private func closeProjectEditor() {
        nameFocused = false
        dismiss()
    }
    private func colorName(_ color: String) -> String {
        let names = ["#8875ff": "Purple", "#35bce6": "Cyan", "#ed4b9a": "Pink", "#67be66": "Green", "#367de8": "Blue", "#5b6abf": "Indigo"]
        return names[color] ?? "Custom color"
    }
    private func save() {
        guard !saving, ProjectQuery.validName(name) else { return }
        saving = true; error = nil; nameFocused = false
        Task {
            defer { saving = false }
            do { try await model.saveProject(id: project?.id, name: name, color: color); closeProjectEditor() }
            catch { self.error = error.localizedDescription }
        }
    }
}

struct ProjectDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let projectID: String?
    @State private var search = ""
    // Project folders open to actionable work; completed tasks remain
    // available through the status filter.
    @State private var status = "Open"
    @State private var priority = "All"
    @State private var adding = false
    @State private var editing = false
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var error: String?
    @State private var selectedTask: NexdoTask?
    private var project: NexdoProject? { model.projects.first { $0.id == projectID } }
    private var missing: Bool { projectID != nil && model.projectsLoaded && project == nil }
    private var tasks: [NexdoTask] {
        model.tasks.filter { $0.projectId == projectID && $0.status != "CANCELLED" && CalendarSearch.matches($0.title, query: search) && (status == "All" || (status == "Completed" ? $0.isDone : !$0.isDone)) && (priority == "All" || $0.priority == priority) }
            .sorted { a, b in a.isDone != b.isDone ? !a.isDone : (a.title == b.title ? a.id < b.id : a.title.localizedStandardCompare(b.title) == .orderedAscending) }
    }
    var body: some View {
        ZStack {
            TodayBackdrop(subtle: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        ProjectFolder(color: project.map { ProjectStyle.color($0.color) } ?? .secondary)
                        Text(project?.name ?? "No project").font(.title2.bold())
                        Spacer()
                        TodayHeaderButton(icon: "plus", label: "Add task to \(project?.name ?? "No project")") {
                            adding = true
                        }
                        .disabled(deleting || missing)
                    }
                    HStack {
                        ProjectSearchField(placeholder: "Search tasks", text: $search)
                        Menu {
                            Picker("Status", selection: $status) { ForEach(["All", "Open", "Completed"], id: \.self) { Text($0) } }
                            Picker("Priority", selection: $priority) { ForEach(["All", "LOW", "NORMAL", "HIGH", "CRITICAL"], id: \.self) { Text($0.capitalized).tag($0) } }
                            Button("Reset filters") { status = "Open"; priority = "All" }
                        } label: { Image(systemName: "slider.horizontal.3").frame(width: 48, height: 48) }.accessibilityLabel("Filter project tasks")
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                    if model.tasksLoadFailed { Text("Couldn’t refresh tasks. Showing saved tasks."); Button("Retry") { Task { await model.refreshTasks() } } }
                    if model.tasksLoading && model.tasks.isEmpty { ProgressView("Loading tasks…") }
                    else if missing { ContentUnavailableView("Project unavailable", systemImage: "folder.badge.questionmark", description: Text("This project may have been deleted.")) }
                    else {
                        if !tasks.isEmpty {
                            Text("\(tasks.count) \(tasks.count == 1 ? "task" : "tasks")")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        if tasks.isEmpty {
                            VStack(spacing: 14) {
                                Image(systemName: "checklist")
                                    .font(.system(size: 38, weight: .regular))
                                    .foregroundStyle(Color.nexdoSecondary)
                                Text(search.isEmpty && status == "Open" && priority == "All" ? "You don’t have any open tasks." : "No matching tasks")
                                    .font(.title3.weight(.regular))
                                    .foregroundStyle(Color.nexdoSecondary)
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity, minHeight: 260)
                            Button { adding = true } label: {
                                Text("Add task")
                                    .font(.headline.weight(.semibold))
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity, minHeight: 52)
                                    .background(ProjectStyle.color(project?.color ?? "#8875ff"), in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Add task to \(project?.name ?? "project")")
                        }
                        LazyVStack(spacing: 12) {
                            ForEach(tasks) { task in
                                Button { selectedTask = task } label: {
                                    TaskListRow(task: task, subtitle: subtitle(task))
                                }.buttonStyle(.plain).accessibilityHint("Opens task details")
                            }
                        }
                    }
                }.padding(20)
            }.scrollDismissesKeyboard(.interactively).refreshable { await model.refreshTasks(); await model.refreshProjects() }
        }
        .foregroundStyle(Color.nexdoInk).tint(ProjectStyle.accent)
        .navigationTitle(project?.name ?? "No project").navigationBarTitleDisplayMode(.inline).toolbar(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Add task", systemImage: "plus") { adding = true }
                    if project != nil {
                        Button("Edit project", systemImage: "pencil") { editing = true }
                        Button("Delete project", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                    }
                } label: { Image(systemName: "ellipsis.circle").frame(width: 44, height: 44) }.disabled(deleting || missing).accessibilityLabel("Project actions")
            }
        }
        .confirmationDialog("Delete this project?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete project", role: .destructive) { remove() }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Its tasks will move to No project. No tasks will be deleted.") }
        .overlay { if deleting { ProgressView("Deleting project…").padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14)) } }
        .sheet(isPresented: $adding) { NavigationStack { TaskEditor(task: nil, initialProjectID: projectID) } }
        .sheet(isPresented: $editing) { if let project { ProjectEditorView(project: project) } }
        .sheet(item: $selectedTask) { task in NavigationStack { TaskEditor(task: task) } }
        .task { await model.refreshTasks(); await model.refreshProjects() }
    }
    private func subtitle(_ task: NexdoTask) -> String {
        let zone = task.timeZone ?? model.profile?.timeZone ?? TimeZone.current.identifier
        let date = (task.startAt ?? task.dueAt).map { " · \(ServerDate.day($0, timeZone: zone) ?? "")" } ?? ""
        return "\(task.durationMin) min\(date)"
    }
    private func remove() {
        guard let project, !deleting else { return }
        deleting = true; error = nil
        Task {
            defer { deleting = false }
            do { try await model.deleteProject(project); dismiss() } catch { self.error = error.localizedDescription }
        }
    }
}

struct ProjectAssignmentField: View {
    @EnvironmentObject private var model: AppModel
    @Binding var projectID: String?
    private var selected: NexdoProject? { model.projects.first { $0.id == projectID } }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Menu {
                Button("No project") { projectID = nil }
                ForEach(ProjectQuery.results(model.projects, search: "", sort: .name)) { project in
                    Button { projectID = project.id } label: { Label(project.name, systemImage: project.id == projectID ? "checkmark" : "folder").tint(ProjectStyle.color(project.color)) }
                }
            } label: {
                HStack { Image(systemName: "folder.fill").foregroundStyle(selected.map { ProjectStyle.color($0.color) } ?? .secondary); Text(selected?.name ?? (projectID == nil ? "No project" : "Assigned project")); Spacer(); Image(systemName: "chevron.down").font(.caption) }
                    .padding(.horizontal, 14).frame(minHeight: 48).projectCardSurface()
            }.accessibilityLabel("Project").accessibilityValue(selected?.name ?? (projectID == nil ? "No project" : "Assigned project"))
            if let error = model.projectsError { Text(error).font(.caption).foregroundStyle(.secondary); Button("Retry projects") { Task { await model.refreshProjects() } }.frame(minHeight: 44) }
            if model.projectsLoading && !model.projectsLoaded { ProgressView("Loading projects…").font(.caption) }
        }.tint(ProjectStyle.accent).task { await model.refreshProjects() }
    }
}

struct TaskListRow: View {
    let task: NexdoTask
    let subtitle: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle").font(.title2).foregroundStyle(Color.nexdoSecondary).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(task.title).font(.body).foregroundStyle(Color.nexdoInk).strikethrough(task.isDone)
                if task.critical == true || task.priority == "CRITICAL" {
                    Text("Critical").font(.caption).foregroundStyle(.red)
                }
                if !subtitle.isEmpty { Text(subtitle).font(.caption).foregroundStyle(Color.nexdoSecondary) }
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.nexdoSecondary).accessibilityHidden(true)
        }.padding(18).frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .background(.background.opacity(0.88), in: RoundedRectangle(cornerRadius: 17))
            .overlay(RoundedRectangle(cornerRadius: 17).stroke(Color.nexdoSecondary.opacity(0.16)))
            .contentShape(RoundedRectangle(cornerRadius: 17)).accessibilityElement(children: .combine)
    }
}
