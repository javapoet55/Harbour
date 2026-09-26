import SwiftUI

struct BriefSectionDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let title: String
    let items: [String]
    let ask: (String) -> Void
    let read: () -> Void
    @State private var taskSection: TaskDetailsView.InitialSection?
    @State private var selectedTask: NexdoTask?
    @State private var contactAction: ContactRoute?
    private struct ContactRoute: Identifiable {
        let id: String
        let channel: TaskActionChannel
    }
    private let ink = Color(red: 0.04, green: 0.05, blue: 0.22)
    private let secondary = Color(red: 0.30, green: 0.34, blue: 0.53)

    // Older briefing responses contain prose rather than task IDs. Only expose
    // mutations when a complete task title identifies exactly one current task.
    private func task(for text: String) -> NexdoTask? {
        let matches = model.tasks.filter {
            !$0.title.isEmpty && text.range(of: "(?<![\\p{L}\\p{N}])" + NSRegularExpression.escapedPattern(for: $0.title) + "(?![\\p{L}\\p{N}])", options: [.regularExpression, .caseInsensitive]) != nil
        }
        return matches.count == 1 ? matches.first : nil
    }
    private var isPriority: Bool { title == "Top Priorities" }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left").font(.title2).frame(width: 44, height: 44).background(.indigo.opacity(0.07), in: Circle())
                }.accessibilityLabel("Back to daily brief")
                VStack(spacing: 4) {
                    Text(title).font(.title2.bold()).multilineTextAlignment(.center)
                    Text("\(items.count) \(items.count == 1 ? "item" : "items") to \(isPriority ? "focus on" : "review")")
                        .font(.subheadline).foregroundStyle(secondary)
                }.frame(maxWidth: .infinity)
                Menu {
                    Button("Read aloud", systemImage: "speaker.wave.2", action: read)
                    ShareLink(item: items.joined(separator: "\n\n")) { Label("Share briefing", systemImage: "square.and.arrow.up") }
                } label: {
                    Image(systemName: "ellipsis").font(.title2).frame(width: 44, height: 44).background(.indigo.opacity(0.07), in: Circle())
                }.accessibilityLabel("Briefing options")
            }.padding(16)
            ScrollView {
                VStack(spacing: 14) {
                    HStack(spacing: 12) {
                        DetailArtwork(part: .star).frame(width: 48, height: 48).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(isPriority ? "Focus on what matters" : "Your \(title.lowercased())").font(.headline).foregroundStyle(.pink)
                            Text("Based on your schedule, deadlines, and context.").font(.subheadline).foregroundStyle(secondary)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                        DetailArtwork(part: .target).frame(width: 70, height: 60).accessibilityHidden(true)
                    }.padding(14).background(.purple.opacity(0.045), in: RoundedRectangle(cornerRadius: 22))
                        .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white, lineWidth: 1.5))
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        if let task = task(for: item) { taskCard(task, context: item, index: index) }
                        else { insightCard(item, index: index) }
                    }
                    if items.isEmpty { Text("Nothing to report here today.").foregroundStyle(secondary).padding() }
                    if let error = model.error { Text(error).font(.subheadline).foregroundStyle(.red) }
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Need help with this?", systemImage: "sparkles").font(.headline)
                        Text("Ask Nexdo to take action, draft a message, or find options.").font(.subheadline).foregroundStyle(secondary)
                        Button { requestHelp("Help me with these \(title.lowercased()):\n" + items.joined(separator: "\n")) } label: {
                            Label("Ask Nexdo", systemImage: "sparkles").font(.headline).foregroundStyle(.white)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(LinearGradient(colors: [.purple, .indigo], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 18))
                        }.disabled(model.busy)
                    }.padding(16).background(.white.opacity(0.65), in: RoundedRectangle(cornerRadius: 22))
                }.padding(.horizontal, 14).padding(.bottom, 24)
            }
        }.foregroundStyle(ink).buttonStyle(.plain)
            .background(LinearGradient(colors: [.purple.opacity(0.07), .blue.opacity(0.04)], startPoint: .topLeading, endPoint: .bottomTrailing).background(.white).ignoresSafeArea())
            .sheet(item: $selectedTask) { task in NavigationStack { TaskDetailsView(task: task, initialSection: taskSection) } }
            .sheet(item: $contactAction) { route in
                TaskActionView(actionID: route.id, preferred: route.channel, startSelectedAction: true)
            }
    }

    private func requestHelp(_ query: String) { dismiss(); ask(query) }
    private func date(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        if let result = formatter.date(from: value) { return result }
        formatter.formatOptions.insert(.withFractionalSeconds)
        return formatter.date(from: value)
    }
    private func taskCard(_ task: NexdoTask, context: String, index: Int) -> some View {
        let deadline = date(task.dueAt)
        let scheduled = date(task.startAt)
        let overdue = !task.isDone && deadline.map { $0 < Date() } == true
        let action = TaskActionCoordinator.shared.action(for: task.id)
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Button { Task { model.error = nil; await model.complete(task) } } label: {
                    Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                        .font(.title2).foregroundStyle(task.isDone ? .green : secondary).frame(width: 32, height: 44)
                }.disabled(model.busy).accessibilityLabel(task.isDone ? "Reopen \(task.title)" : "Complete \(task.title)")
                DetailArtwork(part: action == nil ? .calendar : .phone).frame(width: 42, height: 44).accessibilityHidden(true)
                Button { taskSection = nil; selectedTask = task } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(task.title).font(.headline).fixedSize(horizontal: false, vertical: true)
                        if task.isDone || overdue {
                            Text(task.isDone ? "Completed" : "Overdue").font(.caption.bold()).foregroundStyle(task.isDone ? .green : .pink)
                        }
                        if let when = deadline ?? scheduled {
                            Text(when.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened, timeZone: TimeZone(identifier: task.timeZone ?? model.profile?.timeZone ?? "") ?? .current)))
                                .font(.subheadline).foregroundStyle(overdue ? .pink : .blue)
                        }
                        Label("\(task.durationMin) min", systemImage: "clock").font(.caption).foregroundStyle(secondary)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").font(.caption)
                }.accessibilityIdentifier("brief-task-\(index)")
            }
            Text(task.notes?.isEmpty == false ? task.notes! : context).font(.subheadline).foregroundStyle(secondary)
                .fixedSize(horizontal: false, vertical: true)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { taskActions(task, action: action) }
                VStack(alignment: .leading, spacing: 8) { taskActions(task, action: action) }
            }
        }.padding(16).background(.white.opacity(0.95), in: RoundedRectangle(cornerRadius: 24))
    }
    @ViewBuilder private func taskActions(_ task: NexdoTask, action: TaskAction?) -> some View {
        if let action, !task.isDone {
            pill("Call", icon: "phone", color: .pink) { contactAction = ContactRoute(id: action.id, channel: .call) }
            pill("Message", icon: "message", color: .purple) { contactAction = ContactRoute(id: action.id, channel: .message) }
        } else {
            pill("Open", icon: "doc.text", color: .blue) { taskSection = nil; selectedTask = task }
            pill("Add Note", icon: "pencil", color: .purple) { taskSection = .notes; selectedTask = task }
        }
        pill(task.startAt == nil ? "Schedule" : "Reschedule", icon: "calendar", color: .blue) { taskSection = .schedule; selectedTask = task }
    }
    private func pill(_ title: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).font(.caption).fixedSize().padding(.horizontal, 12).frame(minHeight: 44)
                .foregroundStyle(color).background(color.opacity(0.07), in: RoundedRectangle(cornerRadius: 15))
        }.disabled(model.busy)
    }
    private func insightCard(_ item: String, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                DetailArtwork(part: .star).frame(width: 44, height: 44).accessibilityHidden(true)
                Text(item).font(.headline).fixedSize(horizontal: false, vertical: true)
            }
            pill("Ask Nexdo", icon: "sparkles", color: .purple) { requestHelp("Help me with this item from my daily briefing: \(item)") }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(.white.opacity(0.95), in: RoundedRectangle(cornerRadius: 24))
    }
}

private struct DetailArtwork: View {
    enum Part: CaseIterable { case star, target, phone, calendar
        var rect: CGRect {
            switch self {
            case .star: CGRect(x: 615, y: 401, width: 76, height: 76)
            case .target: CGRect(x: 980, y: 240, width: 211, height: 80)
            case .phone: CGRect(x: 597, y: 546, width: 72, height: 68)
            case .calendar: CGRect(x: 696, y: 546, width: 73, height: 68)
            }
        }
    }
    let part: Part
    private static let sprites: [Part: UIImage] = {
        guard let image = UIImage(named: "brief-detail-pack")?.cgImage else { return [:] }
        return Dictionary(uniqueKeysWithValues: Part.allCases.compactMap { part in image.cropping(to: part.rect).map { (part, UIImage(cgImage: $0)) } })
    }()
    var body: some View {
        if let image = Self.sprites[part] { Image(uiImage: image).resizable().scaledToFit().blendMode(.multiply) }
    }
}
