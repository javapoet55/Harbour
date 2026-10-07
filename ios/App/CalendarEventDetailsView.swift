import SwiftUI

struct CalendarEventDetailsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State var event: CalendarEvent
    let fallbackTimeZone: String
    let onChange: () async -> Void
    @State private var busy = false
    @State private var editing = false
    @State private var deleting = false
    @State private var message: String?
    @State private var taskAdded = false
    @State private var deleted = false
    private struct EventResponse: Decodable, Sendable { let event: CalendarEvent; let warnings: [String]? }
    private struct MutationResponse: Decodable, Sendable { let success: Bool; let warnings: [String]? }
    private struct TaskResponse: Decodable, Sendable { let taskId: String }
    private var path: String { "/api/calendar/events/\(event.id)" }
    private var editable: Bool { event.source == "harbor" && event.connectionId == nil }
    private var calendarName: String { event.source == "harbor" ? "NexDo" : (event.source ?? "Calendar").capitalized }
    private var status: String { event.completedAt != nil ? "Completed" : ((ServerDate.parse(event.endAt) ?? .distantFuture) < Date() ? "Past" : "Upcoming") }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    VStack(alignment: .leading, spacing: 22) {
                        HStack(alignment: .top, spacing: 16) {
                            Image(systemName: "calendar").font(.system(size: 32)).foregroundStyle(.blue)
                                .frame(width: 64, height: 64).background(.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 20))
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Label(calendarName, systemImage: "circle.fill").font(.caption).foregroundStyle(.blue)
                                    Spacer(minLength: 4)
                                    Text(status).font(.caption.weight(.semibold)).foregroundStyle(.green)
                                        .padding(.horizontal, 10).padding(.vertical, 6).background(.green.opacity(0.08), in: Capsule())
                                }
                                Text(event.title).font(.title2.bold()).strikethrough(event.completedAt != nil)
                                if let notes = event.notes, !notes.isEmpty { Text(notes).font(.subheadline).foregroundStyle(Color.nexdoSecondary) }
                            }
                        }
                        HStack(alignment: .top, spacing: 10) {
                            // One of the two, like the ⋯ menu: completing a completed event does nothing.
                            if event.completedAt == nil {
                                action("Mark Complete", icon: "checkmark.circle.fill", color: .green) { await setCompletion(true) }
                            } else {
                                action("Mark Incomplete", icon: "xmark.circle.fill", color: .red) { await setCompletion(false) }
                            }
                            action(taskAdded ? "Added to Tasks" : "Add to Tasks", icon: "calendar.badge.plus", color: .indigo) { await addTask() }
                        }
                        VStack(spacing: 0) {
                            detail("Start", value: dateText(event.startAt), icon: "clock")
                            detail("End", value: dateText(event.endAt), icon: "clock")
                            detail("Time Zone", value: event.timeZone ?? fallbackTimeZone, icon: "mappin.and.ellipse")
                            detail("Calendar", value: calendarName, icon: "list.bullet")
                            if let location = event.location, !location.isEmpty { detail("Location", value: location, icon: "location") }
                        }
                    }.padding(20).eventCard()
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Label("Notes", systemImage: "doc.text").font(.headline)
                            Spacer()
                            if editable { Button("Edit") { editing = true } }
                        }
                        Text(event.notes?.isEmpty == false ? event.notes! : "No notes added.")
                            .foregroundStyle(Color.nexdoSecondary).frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16).background(.indigo.opacity(0.04), in: RoundedRectangle(cornerRadius: 16))
                    }.padding(20).eventCard()
                    Button {
                        if let date = ServerDate.parse(event.startAt), let url = URL(string: "calshow:\(date.timeIntervalSinceReferenceDate)") { openURL(url) }
                    } label: {
                        HStack { Image(systemName: "link"); Text("Open in Calendar").fontWeight(.semibold); Spacer(); Image(systemName: "chevron.right") }.padding(22)
                    }.eventCard()
                    if editable {
                        Button(role: .destructive) { deleting = true } label: {
                            Label("Delete Event", systemImage: "trash").fontWeight(.semibold).frame(maxWidth: .infinity).padding(20)
                        }.background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 24))
                    }
                }.padding(16)
            }
            .background { TodayBackdrop(subtle: true) }
            .foregroundStyle(Color.nexdoInk)
            .navigationTitle("Event Details").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { Image(systemName: "chevron.left") }.accessibilityLabel("Back") }
                ToolbarItemGroup(placement: .primaryAction) {
                    if editable { Button("Edit") { editing = true }.disabled(busy) }
                    Menu {
                        Button(event.completedAt == nil ? "Mark Complete" : "Mark Incomplete", systemImage: event.completedAt == nil ? "checkmark.circle" : "xmark.circle") {
                            Task { await setCompletion(event.completedAt == nil) }
                        }
                        if editable { Button("Delete Event", systemImage: "trash", role: .destructive) { deleting = true } }
                    } label: { Image(systemName: "ellipsis") }.disabled(busy).accessibilityLabel("More event actions")
                }
            }
            .overlay { if busy { ProgressView().padding(22).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18)) } }
            .confirmationDialog("Delete this event?", isPresented: $deleting, titleVisibility: .visible) {
                Button("Delete Event", role: .destructive) { Task { await deleteEvent() } }
            }
            .alert("Event Details", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil; if deleted { dismiss() } } })) { Button("OK") { message = nil; if deleted { dismiss() } } } message: { Text(message ?? "") }
            .sheet(isPresented: $editing) { CalendarEventDetailsEditor(event: event) { body in try await update(body) } }
            .task {
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-event-details-preview") { return }
                #endif
                do { let result: EventResponse = try await model.momentAPI.request(path); event = result.event }
                catch { message = error.localizedDescription }
            }
        }
    }
    private func action(_ title: String, icon: String, color: Color, perform: @escaping () async -> Void) -> some View {
        Button { Task { await perform() } } label: {
            VStack(spacing: 10) { Image(systemName: icon).font(.title2); Text(title).font(.caption.weight(.semibold)).multilineTextAlignment(.center) }
                .frame(maxWidth: .infinity, minHeight: 80).padding(.horizontal, 4).foregroundStyle(color)
                .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
        }.disabled(busy || (title == "Added to Tasks"))
    }
    private func detail(_ label: String, value: String, icon: String) -> some View {
        VStack(spacing: 0) {
            Divider()
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icon).frame(width: 22).foregroundStyle(Color.nexdoSecondary)
                Text(label).foregroundStyle(Color.nexdoSecondary).frame(width: 76, alignment: .leading)
                Text(value).frame(maxWidth: .infinity, alignment: .leading)
            }.font(.subheadline).padding(.vertical, 16)
        }
    }
    private func dateText(_ raw: String) -> String {
        guard let date = ServerDate.parse(raw) else { return raw }
        let formatter = DateFormatter(); formatter.timeZone = TimeZone(identifier: event.timeZone ?? fallbackTimeZone)
        formatter.dateStyle = .medium; formatter.timeStyle = event.allDay == true ? .none : .short
        return formatter.string(from: date) + (event.allDay == true ? " · All day" : "")
    }
    private func update(_ body: Data) async throws {
        let result: EventResponse = try await model.momentAPI.request(path, method: "PATCH", body: body)
        event = result.event
        if let warnings = result.warnings, !warnings.isEmpty { message = warnings.joined(separator: "\n") }
        await onChange()
    }
    private func setCompletion(_ completed: Bool) async {
        busy = true; defer { busy = false }
        do { try await update(JSONSerialization.data(withJSONObject: ["completed": completed])) }
        catch { message = error.localizedDescription }
    }
    private func addTask() async {
        busy = true; defer { busy = false }
        do {
            let _: TaskResponse = try await model.momentAPI.request(path + "/task", method: "POST")
            taskAdded = true; message = "Added to your tasks."; await model.refresh()
        } catch { message = error.localizedDescription }
    }
    private func deleteEvent() async {
        busy = true; defer { busy = false }
        do {
            let result: MutationResponse = try await model.momentAPI.request(path, method: "DELETE")
            deleted = true
            await onChange()
            if let warnings = result.warnings, !warnings.isEmpty { message = warnings.joined(separator: "\n") }
            else { dismiss() }
        } catch { message = error.localizedDescription }
    }
}

private extension View {
    func eventCard() -> some View {
        // The system card surface: white in light mode, dark grey in dark mode, where nexdoInk turns white.
        background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 26))
            .shadow(color: .indigo.opacity(0.035), radius: 14, y: 6)
    }
}

private struct CalendarEventDetailsEditor: View {
    @Environment(\.dismiss) private var dismiss
    let event: CalendarEvent
    let save: (Data) async throws -> Void
    @State private var title = ""
    @State private var notes = ""
    @State private var location = ""
    @State private var saving = false
    @State private var start = Date()
    @State private var end = Date()
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                TextField("Location", text: $location)
                Section("Time") {
                    DatePicker("Start", selection: $start, displayedComponents: event.allDay == true ? [.date] : [.date, .hourAndMinute])
                    DatePicker("End", selection: $end, displayedComponents: event.allDay == true ? [.date] : [.date, .hourAndMinute])
                }
                Section("Notes") { TextEditor(text: $notes).frame(minHeight: 140) }
                if let error { Text(error).foregroundStyle(.red) }
            }.navigationTitle("Edit Event").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { Task {
                            saving = true; defer { saving = false }
                            do {
                                var payload = ["title": title.trimmingCharacters(in: .whitespacesAndNewlines), "notes": notes, "location": location]
                                if start != ServerDate.parse(event.startAt) || end != ServerDate.parse(event.endAt) {
                                    let formatter = ISO8601DateFormatter()
                                    payload["startAt"] = formatter.string(from: start)
                                    payload["endAt"] = formatter.string(from: end)
                                }
                                try await save(JSONSerialization.data(withJSONObject: payload))
                                dismiss()
                            } catch { self.error = error.localizedDescription }
                        }}.disabled(saving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }.onAppear { title = event.title; notes = event.notes ?? ""; location = event.location ?? ""; start = ServerDate.parse(event.startAt) ?? Date(); end = ServerDate.parse(event.endAt) ?? Date() }
        }.interactiveDismissDisabled(saving)
    }
}
