import SwiftUI

struct CalendarView: View {
    private enum Mode: String, CaseIterable { case schedule = "Schedule", week = "Week", month = "Month" }
    private enum Range: String, CaseIterable { case three = "Next 3 days", seven = "Next 7 days", week = "This week" }
    @EnvironmentObject private var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var mode: Mode = .schedule
    @State private var range: Range = .three
    @State private var selected = Date()
    @State private var data: Agenda?
    @State private var loading = false
    @State private var failure: String?
    @State private var adding = false
    @State private var account = false
    @State private var ask = false
    @State private var conflicts = false
    @State private var expanded = false
    @State private var showTasks = true
    @State private var showEvents = true
    @State private var criticalOnly = false
    @State private var eventDetail: CalendarEvent?
    @State private var searching = false
    @State private var searchText = ""
    @FocusState private var searchFocused: Bool
    private var hasSearch: Bool { !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private var zone: String { model.profile?.timeZone ?? model.agenda?.timeZone ?? TimeZone.current.identifier }
    private var dates: CalendarDates { CalendarDates(timeZone: zone) }
    private var visibleDays: [Date] {
        switch mode {
        case .week: return dates.week(selected)
        case .month: return dates.month(selected)
        case .schedule:
            if range == .week { return dates.week(selected) }
            return (0..<(range == .three ? 3 : 7)).map { dates.addingDays($0, to: dates.calendar.startOfDay(for: selected)) }
        }
    }
    private var requestID: String { "\(zone):\(dates.key(visibleDays[0])):\(visibleDays.count)" }
    private var currentData: Agenda? {
        guard let data, data.timeZone == zone, visibleDays.allSatisfy({ data.range.days.contains(dates.key($0)) }) else { return nil }
        return data
    }
    private var openTasks: [NexdoTask] { model.tasks.filter { !$0.isDone && $0.status != "CANCELLED" } }
    private func overdue(_ task: NexdoTask) -> Bool {
        guard let due = task.dueAt.flatMap({ ServerDate.day($0, timeZone: zone) }) else { return false }
        return due < dates.key(Date())
    }
    private func matches(_ task: NexdoTask) -> Bool {
        showTasks && (!criticalOnly || task.critical == true || task.priority == "CRITICAL")
            && CalendarSearch.matches(task.title, query: searchText)
    }
    private func tasks(_ day: Date) -> [NexdoTask] {
        (currentData?.tasks ?? []).filter { matches($0) && dates.taskOccurs($0, on: day) }
    }
    private func events(_ day: Date) -> [CalendarEvent] {
        guard showEvents, !criticalOnly else { return [] }
        return (currentData?.events ?? []).filter {
            CalendarSearch.matches($0.title, query: searchText) && ServerDate.occurs($0, on: dates.key(day), timeZone: zone)
        }
    }
    private var backlog: [NexdoTask] { openTasks.filter { matches($0) && ($0.startAt == nil || overdue($0)) } }
    private func label(_ date: Date, _ format: String) -> String {
        let f = DateFormatter(); f.calendar = dates.calendar; f.timeZone = dates.calendar.timeZone; f.dateFormat = format
        return f.string(from: date)
    }
    private func count(_ day: Date) -> Int { tasks(day).count + events(day).count }
    private func itemCount(_ count: Int) -> String { "\(count) \(count == 1 ? "item" : "items")" }

    var body: some View {
        NavigationStack {
            ZStack {
                TodayBackdrop(subtle: true)
                VStack(spacing: 0) {
                    TodayTopBar(name: model.profile?.name ?? "", temperature: model.weather.map { Int($0.current.temperature.rounded()) }, add: { adding = true }, account: { account = true })
                        .padding(.horizontal, 24).padding(.vertical, 12).background(.ultraThinMaterial)
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            calendarHeader
                            if searching { searchField }
                            segments
                            if mode == .schedule { if !hasSearch { intelligence } }
                            else { dateNavigation; dateGrid }
                            if let failure {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(failure).font(.subheadline)
                                    Button("Retry") { Task { await load() } }
                                }.foregroundStyle(Color.nexdoSecondary)
                            }
                            if loading { ProgressView("Loading calendar…").frame(maxWidth: .infinity) }
                            if currentData != nil {
                                if mode == .schedule {
                                    upcoming
                                    summary
                                    if hasSearch { searchResults }
                                    else { ForEach(visibleDays, id: \.self) { day in daySection(day, relative: true) } }
                                    DisclosureGroup(isExpanded: $expanded) {
                                        if backlog.isEmpty { Text("No unscheduled or overdue tasks.").font(.subheadline).padding(.vertical) }
                                        ForEach(backlog) { task in
                                            NavigationLink { TaskDetailsView(task: task) } label: {
                                                HStack { Text(task.title); Spacer(); if overdue(task) { badge("Overdue", color: .orange) } }
                                                    .font(.subheadline).padding(.vertical, 10)
                                            }
                                        }
                                    } label: { Text("Unscheduled & overdue  \(backlog.count)").font(.subheadline.weight(.semibold)) }
                                        .padding(16).background(.background.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
                                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.nexdoBlue.opacity(0.18)))
                                } else {
                                    if hasSearch { searchResults }
                                    else {
                                    if mode == .week {
                                        summaryCard("Your \(label(selected, "EEEE"))", detail: "\(itemCount(count(selected))) · \(tasks(selected).filter { scheduled($0, selected) }.reduce(0) { $0 + $1.durationMin }) min planned")
                                    }
                                    daySection(selected, relative: false)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 24)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                    .scrollDismissesKeyboard(.interactively)
                    .refreshable {
                        async let analysis: Void = model.refreshScheduleIntelligence()
                        await model.refresh(); await load()
                        await analysis
                    }
                }
            }
            .foregroundStyle(Color.nexdoInk)
            .toolbar(.hidden, for: .navigationBar)
            .onAppear {
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-calendar-design-preview") {
                    selected = ServerDate.parse("2026-09-07T19:00:00Z")!
                    if ProcessInfo.processInfo.arguments.contains("-calendar-week") { mode = .week }
                    if ProcessInfo.processInfo.arguments.contains("-calendar-month") { mode = .month }
                }
                #endif
            }
            .task(id: requestID) { await load() }
            .task {
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-calendar-design-preview") { return }
                #endif
                await model.refreshScheduleIntelligence()
            }
            .onReceive(model.$agenda.dropFirst()) { _ in Task { await load() } }
            .sheet(isPresented: $adding) { NavigationStack { TaskEditor(task: nil) } }
            .sheet(isPresented: $account) { AccountView() }
            .sheet(isPresented: $ask) {
                AskNexdoView(initialPrompt: "Help fix my schedule around \(dates.key(selected)). Analyze tasks, due dates, calendar commitments, available time, priority, and overdue work. Propose an improved schedule for my approval.")
                    .presentationDetents([.large]).presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $conflicts) { conflictSheet }
            .sheet(item: $eventDetail) { event in
                NavigationStack {
                    Form {
                        Section { Text(event.title).font(.headline) }
                        Section("Calendar commitment") {
                            if event.allDay == true { Text("All day") }
                            Text("Starts: \(eventDate(event.startAt))")
                            Text("Ends: \(eventDate(event.endAt))")
                            Text(zone).foregroundStyle(.secondary)
                        }
                    }.navigationTitle("Event Details").navigationBarTitleDisplayMode(.inline)
                        .toolbar { Button("Done") { eventDetail = nil } }
                }
            }
        }
    }

    private var calendarHeader: some View {
        HStack {
            Text("Calendar").font(.largeTitle.bold())
            Spacer()
            Button {
                searching = true
                searchFocused = true
            } label: {
                Image(systemName: "magnifyingglass").font(.title3)
                    .frame(width: 44, height: 44)
                    .background(Color.nexdoIndigo.opacity(0.09), in: Circle())
            }.buttonStyle(.plain).accessibilityLabel("Search calendar")
        }
    }

    private var searchField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Color.nexdoSecondary)
                    TextField("Search events and tasks", text: $searchText)
                        .focused($searchFocused)
                        .submitLabel(.search)
                        .autocorrectionDisabled()
                        .onSubmit { searchFocused = false }
                        .accessibilityLabel("Search calendar by keyword")
                    if !searchText.isEmpty {
                        Button { searchText = ""; searchFocused = true } label: {
                            Image(systemName: "xmark.circle.fill").frame(width: 44, height: 44)
                        }.accessibilityLabel("Clear calendar search")
                    }
                }
                .padding(.leading, 12).frame(minHeight: 48)
                .background(.background.opacity(0.9), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.nexdoIndigo.opacity(0.18)))
                Button("Cancel") { searchFocused = false; searchText = ""; searching = false }
                    .frame(minHeight: 44)
            }
            Text("Searching \(label(visibleDays[0], "MMM d"))–\(label(visibleDays.last!, "MMM d, yyyy")) · Current filters apply")
                .font(.caption).foregroundStyle(Color.nexdoSecondary)
        }
        .task { searchFocused = true }
    }

    private var searchResults: some View {
        VStack(alignment: .leading, spacing: 24) {
            if !visibleDays.contains(where: { count($0) > 0 }) {
                Text("No matching events or tasks in this date range. Try another keyword, date range, or filter.")
                    .font(.subheadline).foregroundStyle(Color.nexdoSecondary)
            }
            ForEach(visibleDays.filter { count($0) > 0 }, id: \.self) { day in
                daySection(day, relative: true)
            }
        }
    }

    private var segments: some View {
        HStack(spacing: 0) {
            ForEach(Mode.allCases, id: \.self) { option in
                Button { withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) { mode = option } } label: {
                    Text(option.rawValue).font(.subheadline).frame(maxWidth: .infinity, minHeight: 48)
                        .foregroundStyle(mode == option ? .white : Color.nexdoIndigo)
                        .background(mode == option ? AnyShapeStyle(NexdoTheme.saveGradient) : AnyShapeStyle(Color.clear), in: RoundedRectangle(cornerRadius: 11))
                }.buttonStyle(.plain).accessibilityAddTraits(mode == option ? .isSelected : [])
            }
        }.background(Color.nexdoIndigo.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }
    private var intelligence: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Schedule Intelligence", systemImage: "sparkles").font(.subheadline.bold())
                Spacer(minLength: 4)
                Button { conflicts = true } label: { Text("Review conflicts").font(.caption.weight(.semibold)).frame(minHeight: 44) }
            }.foregroundStyle(Color.blue)
            if let info = model.scheduleIntelligence?.today, info.day == dates.key(Date()) {
                Label(info.recommendation.title, systemImage: "exclamationmark.triangle").font(.headline)
                Text("\(info.appointments) calendar commitments today · \(String(format: "%.1f", Double(info.availableMinutes) / 60)) usable hours remain")
                    .font(.caption).foregroundStyle(Color.nexdoSecondary)
                Text(info.recommendation.explanation).font(.caption).foregroundStyle(Color.nexdoSecondary)
            } else if !model.intelligenceLoading && model.intelligenceError == nil {
                Text("Review your schedule").font(.headline)
                Text("Load today’s conflicts and available time.").font(.caption).foregroundStyle(Color.nexdoSecondary)
            }
            intelligenceStatus
            Button { ask = true } label: { Text("Fix my schedule").font(.caption.bold()).padding(14).foregroundStyle(.white).background(Color(red: 0.18, green: 0.36, blue: 0.59), in: RoundedRectangle(cornerRadius: 12)) }.buttonStyle(.plain)
        }.padding(14).background(Color.nexdoBlue.opacity(0.045), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.nexdoBlue.opacity(0.2)))
    }
    @ViewBuilder private var intelligenceStatus: some View {
        if model.intelligenceLoading {
            ProgressView("Reviewing your schedule…").font(.subheadline)
        } else if let message = model.intelligenceError {
            Text(message).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
            if model.scheduleIntelligence != nil {
                Text("Showing the last successful review.").font(.caption).foregroundStyle(Color.nexdoSecondary)
            }
            Button("Retry schedule intelligence") { Task { await model.refreshScheduleIntelligence() } }
                .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
        } else if model.scheduleIntelligence?.today.day != dates.key(Date()) {
            Button("Review schedule") { Task { await model.refreshScheduleIntelligence() } }
                .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
        }
    }
    private var upcoming: some View {
        HStack {
            Text("Upcoming").font(.title2.bold()); Spacer()
            Menu { ForEach(Range.allCases, id: \.self) { value in Button(value.rawValue) { range = value } } } label: {
                HStack { Text(range.rawValue); Image(systemName: "chevron.down").font(.caption2) }.font(.subheadline).padding(12)
            }.background(.background.opacity(0.8), in: RoundedRectangle(cornerRadius: 12))
            filters
        }
    }
    private var filters: some View {
        Menu {
            Toggle("Tasks", isOn: $showTasks)
            Toggle("Calendar events", isOn: $showEvents)
            Toggle("Critical only", isOn: $criticalOnly)
            Button("Reset filters") { showTasks = true; showEvents = true; criticalOnly = false }
        } label: {
            Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44)
                .background(.background.opacity(0.8), in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.nexdoIndigo.opacity(0.18)))
        }.accessibilityLabel("Calendar filters\((!showTasks || !showEvents || criticalOnly) ? ", active" : "")")
    }
    private var summary: some View {
        let total = visibleDays.reduce(0) { $0 + count($1) }
        let deadlines = Set(visibleDays.flatMap { day in tasks(day).filter { $0.dueAt.flatMap { ServerDate.day($0, timeZone: zone) } == dates.key(day) }.map(\.id) }).count
        return summaryCard("\(itemCount(total)) · \(deadlines) \(deadlines == 1 ? "deadline" : "deadlines")", detail: "\(openTasks.filter { overdue($0) }.count) overdue tasks overall · \(visibleDays.contains { dates.calendar.isDate($0, inSameDayAs: Date()) } ? "Includes today" : label(visibleDays[0], "MMM d"))")
    }
    private func summaryCard(_ title: String, detail: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "sparkles").font(.title2).foregroundStyle(Color.nexdoIndigo)
            VStack(alignment: .leading, spacing: 8) { Text(title).font(.headline).foregroundStyle(Color.nexdoIndigo); Text(detail).font(.subheadline).foregroundStyle(Color.nexdoSecondary) }
            Spacer(minLength: 0)
        }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(Color.nexdoIndigo.opacity(0.075), in: RoundedRectangle(cornerRadius: 16))
    }
    private var dateNavigation: some View {
        HStack {
            Button { shift(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("Previous \(mode == .week ? "week" : "month")")
            Spacer(minLength: 0)
            Text(mode == .month ? label(selected, "MMMM yyyy") : "\(label(visibleDays[0], "MMM d")) – \(label(visibleDays.last!, "MMM d, yyyy"))").font(.headline).multilineTextAlignment(.center)
            Spacer(minLength: 0)
            Button { shift(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel("Next \(mode == .week ? "week" : "month")")
            Button("Today") { selected = Date() }.font(.subheadline).foregroundStyle(Color.nexdoIndigo).frame(minHeight: 44)
        }.buttonStyle(.plain)
    }
    private var dateGrid: some View {
        VStack(spacing: 18) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: mode == .month ? 10 : 0) {
                ForEach(Array((mode == .week ? ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] : ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]).enumerated()), id: \.offset) { _, day in Text(day).font(.caption2).foregroundStyle(Color.nexdoSecondary).frame(height: 28) }
                ForEach(visibleDays, id: \.self) { day in
                    Button { selected = day } label: {
                        VStack(spacing: 2) {
                            Text(label(day, "d")).font(.body).frame(width: 38, height: 38)
                                .foregroundStyle(dates.calendar.isDate(day, inSameDayAs: selected) ? .white : Color.nexdoInk.opacity(mode == .month && !dates.calendar.isDate(day, equalTo: selected, toGranularity: .month) ? 0.4 : 1))
                                .background(dates.calendar.isDate(day, inSameDayAs: selected) ? Color(red: 0.18, green: 0.36, blue: 0.59) : .clear, in: Circle())
                            HStack(spacing: 3) {
                                if !events(day).isEmpty || tasks(day).contains(where: { scheduled($0, day) }) { Circle().fill(.blue).frame(width: 4, height: 4) }
                                if tasks(day).contains(where: { overdue($0) }) { Circle().fill(.orange).frame(width: 4, height: 4) }
                                if tasks(day).contains(where: { $0.critical == true || $0.priority == "CRITICAL" }) { Circle().fill(.red).frame(width: 4, height: 4) }
                            }.frame(height: 5)
                        }.frame(maxWidth: .infinity, minHeight: 48).contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityLabel("\(label(day, "EEEE, MMMM d, yyyy")), \(currentData == nil ? "loading" : itemCount(count(day)))")
                        .accessibilityAddTraits(dates.calendar.isDate(day, inSameDayAs: selected) ? .isSelected : [])
                }
            }
            Text("Blue: planned · Amber: overdue · Red: critical").font(.caption).foregroundStyle(Color.nexdoSecondary).padding(.top, 4)
        }
    }
    private func shift(_ direction: Int) {
        selected = mode == .week ? dates.addingDays(direction * 7, to: selected) : dates.calendar.date(byAdding: .month, value: direction, to: selected)!
    }
    private func daySection(_ day: Date, relative: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(dayTitle(day, relative)).font(.headline)
                Spacer()
                Text(itemCount(count(day))).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                if !relative { filters }
            }.padding(.bottom, 16)
            Divider().overlay(Color.nexdoIndigo.opacity(0.08))
            if count(day) == 0 {
                Text(!showTasks || !showEvents || criticalOnly ? "No items match your filters." : "Nothing scheduled. Room to breathe.")
                    .font(.subheadline).foregroundStyle(Color.nexdoSecondary).padding(.vertical, 26).frame(maxWidth: .infinity, alignment: .leading)
            }
            ForEach(rows(day)) { row in
                if let task = row.task {
                    NavigationLink { TaskDetailsView(task: task) } label: { timeline(row) }.buttonStyle(.plain)
                } else if let event = row.event {
                    Button { eventDetail = event } label: { timeline(row) }.buttonStyle(.plain)
                }
            }
        }
    }
    private func dayTitle(_ day: Date, _ relative: Bool) -> String {
        guard relative else { return label(day, "EEEE, MMM d") }
        let prefix = dates.calendar.isDate(day, inSameDayAs: Date()) ? "Today · " : dates.calendar.isDate(day, inSameDayAs: dates.addingDays(1, to: Date())) ? "Tomorrow · " : ""
        return prefix + label(day, "EEE, MMM d")
    }
    private struct Row: Identifiable {
        let id: String; let title: String; let at: Date; let time: String; let detail: String
        let task: NexdoTask?; let event: CalendarEvent?; let deadline: Bool
    }
    private func scheduled(_ task: NexdoTask, _ day: Date) -> Bool { task.startAt.flatMap { ServerDate.day($0, timeZone: zone) } == dates.key(day) }
    private func rows(_ day: Date) -> [Row] {
        let taskRows = tasks(day).map { task in
            let isScheduled = scheduled(task, day)
            let value = (isScheduled ? task.startAt : task.dueAt) ?? ""
            return Row(id: "task:\(task.id)", title: task.title, at: ServerDate.parse(value) ?? .distantFuture,
                       time: (isScheduled ? "" : "Due ") + ServerDate.time(value, timeZone: zone),
                       detail: isScheduled ? "\(task.durationMin) min · Task\(task.recurrence == nil ? "" : " · Repeats")" : "Task deadline",
                       task: task, event: nil, deadline: task.dueAt.flatMap { ServerDate.day($0, timeZone: zone) } == dates.key(day))
        }
        let eventRows = events(day).map { event in
            let start = max(ServerDate.parse(event.startAt) ?? day, dates.calendar.startOfDay(for: day))
            let end = min(ServerDate.parse(event.endAt) ?? start, dates.addingDays(1, to: dates.calendar.startOfDay(for: day)))
            return Row(id: "event:\(event.id)", title: event.title, at: event.allDay == true ? dates.calendar.startOfDay(for: day) : start,
                       time: event.allDay == true ? "All day" : ServerDate.time(ISO8601DateFormatter().string(from: start), timeZone: zone),
                       detail: event.allDay == true ? "Calendar event" : "\(max(0, Int(end.timeIntervalSince(start) / 60))) min · Event", task: nil, event: event, deadline: false)
        }
        return (taskRows + eventRows).sorted { $0.at == $1.at ? $0.id < $1.id : $0.at < $1.at }
    }
    private func timeline(_ row: Row) -> some View {
        let late = row.task.map { overdue($0) } ?? false
        let critical = row.task.map { $0.critical == true || $0.priority == "CRITICAL" } ?? false
        let color: Color = critical ? .red : late ? .orange : .nexdoIndigo
        return HStack(spacing: 10) {
            Text(row.time).font(.caption).frame(width: 64, alignment: .leading)
            ZStack {
                Rectangle().fill(Color.nexdoIndigo.opacity(0.18)).frame(width: 1)
                Circle().fill(color).frame(width: 8, height: 8)
            }.frame(width: 8)
            Image(systemName: row.event != nil ? "calendar" : late ? "doc.text" : "checkmark.square").font(.title3).foregroundStyle(color)
                .frame(width: 32, height: 36).background(color.opacity(0.11), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 7) {
                Text(row.title).font(.body).fixedSize(horizontal: false, vertical: true)
                Text(row.detail).font(.caption).foregroundStyle(Color.nexdoSecondary)
                HStack { if late { badge("Overdue", color: .orange) }; if critical { badge("Critical", color: .red) }; if row.deadline { badge("Deadline", color: .nexdoIndigo) } }
                Divider().padding(.top, 10)
            }.padding(.top, 18).padding(.bottom, 4)
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.nexdoSecondary)
        }.fixedSize(horizontal: false, vertical: true).contentShape(Rectangle())
    }
    private func badge(_ text: String, color: Color) -> some View {
        Text(text).font(.caption2).foregroundStyle(color).padding(.horizontal, 8).padding(.vertical, 4).background(color.opacity(0.12), in: Capsule())
    }
    private var conflictSheet: some View {
        NavigationStack {
            List {
                if let info = model.scheduleIntelligence?.today, info.day == dates.key(Date()) {
                    Section("Today’s schedule review") {
                        if info.attention.isEmpty { Text("No issues reported by schedule intelligence.") }
                        ForEach(info.attention) { item in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(item.label).font(.caption).foregroundStyle(.secondary)
                                Text(item.title).font(.headline)
                                Text(item.explanation)
                                Text(item.recommendedAction).font(.subheadline)
                            }.padding(.vertical, 6)
                        }
                    }
                }
                Section { intelligenceStatus }
            }.navigationTitle("Schedule review").navigationBarTitleDisplayMode(.inline).toolbar { Button("Done") { conflicts = false } }
        }
    }
    private func eventDate(_ value: String) -> String { ServerDate.parse(value).map { label($0, "EEE, MMM d, yyyy h:mm a") } ?? "Unavailable" }
    @State private var loadToken = UUID()
    private func load() async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-calendar-design-preview") {
            data = Agenda(timeZone: zone, range: .init(days: visibleDays.map(dates.key)), tasks: model.tasks, events: [], overdue: model.tasks.filter { overdue($0) })
            return
        }
        #endif
        let token = UUID(); loadToken = token
        let days = visibleDays; let requested = requestID
        loading = true; failure = nil
        do {
            let result = try await model.calendarAgenda(from: dates.key(days[0]), days: days.count)
            guard !Task.isCancelled, token == loadToken, requestID == requested else { return }
            guard days.allSatisfy({ result.range.days.contains(dates.key($0)) }) else { throw APIError.invalidResponse }
            data = result; loading = false
        } catch {
            guard !Task.isCancelled, token == loadToken, requestID == requested else { return }
            loading = false; failure = "Couldn’t refresh this date range.\(currentData == nil ? "" : " Showing previously loaded data.")"
        }
    }
}
