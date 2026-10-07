import SwiftUI
import Charts

struct PomodoroDashboard: View {
    enum Tab: String, CaseIterable { case overview = "Overview", sessions = "Sessions", insights = "Insights" }
    @ObservedObject var store: PomodoroStore
    @State private var tab: Tab
    @State private var period: PomodoroPeriod = .today
    @State private var trendPeriod: PomodoroPeriod = .week
    @State private var expanded: Set<Date> = []
    @State private var collapsed: Set<Date> = []
    @State private var selectedDate: Date?
    @State private var selectedSession: PomodoroSession?
    @State private var definitions = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let onClose: () -> Void
    let onStart: () -> Void
    private let ink = Color(red: 0.05, green: 0.04, blue: 0.25)
    private let gradient = LinearGradient(colors: [.purple, .indigo, .blue], startPoint: .leading, endPoint: .trailing)

    init(store: PomodoroStore, initialTab: Tab = .overview, onClose: @escaping () -> Void, onStart: @escaping () -> Void) {
        self.store = store; _tab = State(initialValue: initialTab); self.onClose = onClose; self.onStart = onStart
    }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            let stats = PomodoroAnalytics(sessions: store.sessions, period: period, now: context.date)
            let all = PomodoroAnalytics(sessions: store.sessions, period: .all, now: context.date)
            ZStack {
                LinearGradient(colors: [.purple.opacity(0.04), .white, .blue.opacity(0.05)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 18) {
                        header
                        tabs
                        if store.loadingHistory { ProgressView("Updating sessions…").font(.caption) }
                        if let message = store.syncMessage { Text(message).font(.caption).foregroundStyle(.secondary) }
                        switch tab {
                        case .overview:
                            periodPicker
                            overview(stats)
                            startButton
                        case .sessions: sessionHistory(all)
                        case .insights:
                            let trend = PomodoroAnalytics(sessions: store.sessions, period: trendPeriod, now: context.date)
                            categoryCard(trend)
                            VStack(alignment: .leading, spacing: 16) {
                                HStack {
                                    Text("Focus Trend").font(.headline); Spacer()
                                    Picker("Trend period", selection: $trendPeriod) { ForEach(PomodoroPeriod.allCases, id: \.self) { Text($0.title).tag($0) } }.pickerStyle(.menu).accessibilityIdentifier("pomodoro-trend-period")
                                }
                                chart(trend, breaks: false)
                            }.dashboardCard()
                        }
                    }.padding(16).frame(maxWidth: 620).frame(maxWidth: .infinity)
                }.id(tab).refreshable { await store.restore() }
            }
        }
        .foregroundStyle(ink).tint(.indigo).preferredColorScheme(.light)
        .onChange(of: period) { _, _ in selectedDate = nil }
        .onChange(of: trendPeriod) { _, _ in selectedDate = nil }
        .sheet(item: $selectedSession) { sessionDetail($0) }
        .alert("Your focus metrics", isPresented: $definitions) {
            Button("Got it", role: .cancel) { }
        } message: {
            Text("Focus time excludes pauses and breaks, and includes partial stopped sessions. Sessions counts all attempts. Focus rate is the percentage of finished or stopped focus sessions that reached their planned duration; ongoing focus is excluded. Activity is grouped by the session’s start date in your local time zone. Time saved is not measured, so we show recorded break time instead. Comparisons use the previous full day, week, or month.")
        }
    }
    private var header: some View {
        HStack {
            Button { if tab == .overview { onClose() } else { tab = .overview } } label: { Image(systemName: "chevron.left").frame(width: 40, height: 40).background(.indigo.opacity(0.06), in: Circle()) }.accessibilityLabel(tab == .overview ? "Close dashboard" : "Back to overview")
            Spacer(); Text(tab == .overview ? "Pomodoro" : tab.rawValue).font(.title2.bold()); Spacer()
            Menu {
                Button("Refresh", systemImage: "arrow.clockwise") { Task { await store.restore() } }
                Button("About these metrics", systemImage: "info.circle") { definitions = true }
            } label: { Image(systemName: "ellipsis").frame(width: 40, height: 40).background(.indigo.opacity(0.06), in: Circle()) }.accessibilityLabel("Dashboard options")
        }
    }
    private var tabs: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases, id: \.self) { item in
                Button { tab = item; selectedDate = nil } label: {
                    // The label is always the tab's own name: "Insights" read "Categories" only while selected.
                    Text(item.rawValue).font(.subheadline.weight(.medium)).frame(maxWidth: .infinity).padding(.vertical, 12)
                        .foregroundStyle(tab == item ? .white : ink)
                        .background { if tab == item { Capsule().fill(gradient) } else { Capsule().fill(.indigo.opacity(0.04)) } }
                }.buttonStyle(.plain).accessibilityIdentifier("pomodoro-tab-" + item.rawValue.lowercased()).accessibilityAddTraits(tab == item ? .isSelected : [])
            }
        }
    }
    private var periodPicker: some View {
        HStack(spacing: 5) {
            ForEach(PomodoroPeriod.allCases, id: \.self) { item in
                Button { period = item } label: {
                    Text(item.title).font(.caption.weight(.medium)).frame(maxWidth: .infinity).padding(.vertical, 11).foregroundStyle(period == item ? .white : ink)
                        .background { Capsule().fill(period == item ? Color.indigo : .indigo.opacity(0.05)) }
                }.buttonStyle(.plain).accessibilityIdentifier("pomodoro-period-" + item.rawValue).accessibilityAddTraits(period == item ? .isSelected : [])
            }
        }
    }
    private func overview(_ stats: PomodoroAnalytics) -> some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "stopwatch.fill").font(.title2).foregroundStyle(.indigo).frame(width: 48, height: 48).background(.indigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Focus Time").font(.subheadline)
                        Text(time(stats.focusSeconds)).font(.title.bold()).monospacedDigit().accessibilityIdentifier("pomodoro-focus-total")
                        if let change = stats.changePercent {
                            Label("\(abs(change))% \(change >= 0 ? "more" : "less") than \(comparison)", systemImage: change >= 0 ? "arrow.up" : "arrow.down").font(.caption).foregroundStyle(change >= 0 ? .green : .orange)
                        } else if period != .all { Text(stats.focusSeconds > 0 ? "Your first focus time this period" : "Start a session to build your focus habit").font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer(minLength: 0)
                }
                chart(stats, breaks: true)
            }.dashboardCard()
            HStack(spacing: 10) {
                metric("timer", value: String(stats.sessions.count), label: "Sessions", color: .pink)
                metric("cup.and.saucer.fill", value: time(stats.breakSeconds), label: "Break Time", color: .orange)
                metric("trophy.fill", value: stats.focusRate.map { "\(Int(($0 * 100).rounded()))%" } ?? "—", label: "Focus Rate", color: .green)
            }
            if stats.sessions.isEmpty { Text("No sessions in this period yet.").font(.subheadline).foregroundStyle(.secondary).padding(.vertical, 8) }
        }
    }
    private var comparison: String { switch period { case .today: "yesterday"; case .week: "last week"; case .month: "last month"; case .all: "previous period" } }
    private func metric(_ icon: String, value: String, label: String, color: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.title3).foregroundStyle(color).frame(width: 36, height: 36).background(color.opacity(0.09), in: Circle())
            Text(value).font(.headline).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
            Text(label).font(.caption).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(.vertical, 12).background(color.opacity(0.04), in: RoundedRectangle(cornerRadius: 18)).overlay { RoundedRectangle(cornerRadius: 18).stroke(.white, lineWidth: 1) }
    }
    private var startButton: some View {
        Button(action: onStart) {
            Label(store.current?.active == true ? "Return to Timer" : "Start Focus Session", systemImage: store.current?.active == true ? "timer" : "play.fill").font(.headline).foregroundStyle(.white).frame(maxWidth: .infinity).padding(17).background(gradient, in: RoundedRectangle(cornerRadius: 16))
        }.accessibilityIdentifier("pomodoro-dashboard-start")
    }
    private func chart(_ stats: PomodoroAnalytics, breaks: Bool) -> some View {
        let buckets = stats.buckets
        let tickStep = max(1, Int(ceil(Double(buckets.count) / Double(stats.period == .week ? 7 : 5))))
        let ticks = stride(from: 0, to: buckets.count, by: tickStep).map { buckets[$0].start }
        let selected = selectedDate.flatMap { date in buckets.first { date >= $0.start && date < $0.end } } ?? buckets.max(by: { $0.seconds < $1.seconds })
        return VStack(alignment: .leading, spacing: 8) {
            Chart(buckets) { bucket in
                BarMark(x: .value("Date", bucket.start, unit: stats.period == .today ? .hour : stats.period == .all ? .month : .day), y: .value("Focus minutes", bucket.seconds / 60), width: .ratio(0.65))
                    .position(by: .value("Activity", "Focus"))
                    .foregroundStyle(LinearGradient(colors: bucket.id == selected?.id ? [.purple, .indigo.opacity(0.45)] : [.blue.opacity(0.7), .cyan.opacity(0.4)], startPoint: .top, endPoint: .bottom))
                    .cornerRadius(4)
                    .annotation(position: .top) { if !breaks && bucket.id == selected?.id && bucket.seconds > 0 { Text(time(bucket.seconds)).font(.caption2.bold()).foregroundStyle(.white).padding(5).background(.purple, in: Capsule()) } }
                    .accessibilityLabel(bucket.start.formatted(date: .abbreviated, time: .shortened))
                    .accessibilityValue("\(time(bucket.seconds)) focus")
                if breaks {
                    BarMark(x: .value("Date", bucket.start, unit: stats.period == .today ? .hour : stats.period == .all ? .month : .day), y: .value("Break minutes", bucket.breakSeconds / 60), width: .ratio(0.65))
                        .position(by: .value("Activity", "Break")).foregroundStyle(.cyan.opacity(0.55)).cornerRadius(4)
                        .accessibilityValue("\(time(bucket.breakSeconds)) break")
                }
            }
            .chartLegend(.hidden)
            .chartXSelection(value: $selectedDate)
            .chartYScale(domain: 0...max(5, (buckets.map { max($0.seconds, $0.breakSeconds) / 60 }.max() ?? 0) * 1.3))
            .chartXAxis { AxisMarks(values: ticks) { value in
                AxisValueLabel { if let date = value.as(Date.self) { Text(axisLabel(date, period: stats.period)).font(.caption2) } }
            } }
            .chartYAxis { AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in AxisGridLine().foregroundStyle(.indigo.opacity(0.07)); AxisValueLabel { if let minutes = value.as(Double.self) { Text("\(Int(minutes))m").font(.caption2) } } } }
            .frame(height: 170).padding(.top, 8)
            if breaks { HStack(spacing: 16) { Label("Focus", systemImage: "circle.fill").foregroundStyle(.indigo); Label("Break", systemImage: "circle.fill").foregroundStyle(.cyan) }.font(.caption2) }
        }.animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: stats.period)
    }
    private func axisLabel(_ date: Date, period: PomodoroPeriod) -> String {
        let formatter = DateFormatter(); formatter.dateFormat = period == .today ? "ha" : period == .week ? "EEE" : period == .month ? "d" : "MMM yy"; return formatter.string(from: date)
    }
    private func categoryCard(_ stats: PomodoroAnalytics) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Time by Category").font(.headline)
            Text(trendPeriod.title).font(.caption).foregroundStyle(.secondary)
            if stats.focusSeconds == 0 {
                VStack(spacing: 12) { Image(systemName: "chart.pie").font(.largeTitle).foregroundStyle(.purple.opacity(0.5)); Text("No focus time in this period yet.").font(.subheadline) }.frame(maxWidth: .infinity).padding(.vertical, 30)
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 16) { donut(stats).frame(width: 155, height: 155); categoryLegend(stats).frame(minWidth: 135) }
                    VStack(spacing: 18) { donut(stats).frame(height: 170); categoryLegend(stats) }
                }
            }
        }.dashboardCard()
    }
    private func donut(_ stats: PomodoroAnalytics) -> some View {
        Chart(stats.categories) { item in
            SectorMark(angle: .value("Focus time", item.seconds), innerRadius: .ratio(0.72), angularInset: 1)
                .foregroundStyle(categoryColor(item.category).gradient)
                .accessibilityLabel(item.category.title).accessibilityValue("\(time(item.seconds)), \(Int((item.seconds / stats.focusSeconds * 100).rounded())) percent")
        }.chartBackground { _ in VStack(spacing: 3) { Text(time(stats.focusSeconds)).font(.headline).minimumScaleFactor(0.6); Text("Total Focus").font(.caption2) }.padding(30) }
    }
    private func categoryLegend(_ stats: PomodoroAnalytics) -> some View {
        VStack(spacing: 13) {
            ForEach(stats.categories) { item in
                HStack(spacing: 7) { Circle().fill(categoryColor(item.category)).frame(width: 9, height: 9); Text(item.category.title).font(.caption); Spacer(minLength: 4); Text("\(Int((item.seconds / stats.focusSeconds * 100).rounded()))%").font(.caption.weight(.medium)).monospacedDigit() }
            }
        }
    }
    private func sessionHistory(_ stats: PomodoroAnalytics) -> some View {
        VStack(spacing: 16) {
            if stats.sessions.isEmpty { ContentUnavailableView("No sessions yet", systemImage: "timer", description: Text("Start a focus session to build your history.")); startButton }
            ForEach(stats.days, id: \.date) { day in
                let open = expanded.contains(day.date) || (day.date == stats.days.first?.date && !collapsed.contains(day.date))
                VStack(spacing: 12) {
                    Button {
                        if open { expanded.remove(day.date); collapsed.insert(day.date) } else { expanded.insert(day.date); collapsed.remove(day.date) }
                    } label: {
                        HStack { Text(dayTitle(day.date)).font(.subheadline.bold()); Spacer(); Text("\(day.sessions.count) \(day.sessions.count == 1 ? "session" : "sessions")").font(.caption); Image(systemName: open ? "chevron.up" : "chevron.down").font(.caption) }.contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityLabel("\(dayTitle(day.date)), \(day.sessions.count) sessions, \(open ? "collapse" : "expand")")
                    if open {
                        ForEach(day.sessions) { session in
                            Button { selectedSession = session } label: { sessionRow(session, stats: stats) }.buttonStyle(.plain).accessibilityIdentifier("pomodoro-history-entry")
                            if session.id != day.sessions.last?.id { Divider().opacity(0.35) }
                        }
                    }
                }.dashboardCard()
            }
        }
    }
    private func sessionRow(_ session: PomodoroSession, stats: PomodoroAnalytics) -> some View {
        HStack(spacing: 12) {
            Image(systemName: session.category.icon).foregroundStyle(.white).frame(width: 38, height: 38).background(categoryColor(session.category).gradient, in: RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 4) {
                Text(session.category.title).font(.subheadline.weight(.medium))
                if !session.name.isEmpty { Text(session.name).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                Text("\(time(stats.focused(session))) · \(Date(timeIntervalSince1970: session.startedAt).formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: session.phase == .completed || session.phase == .shortBreak ? "checkmark.circle.fill" : session.phase == .stopped ? "stop.circle" : session.paused ? "pause.circle" : "circle").font(.title3).foregroundStyle(session.phase == .stopped ? .orange : session.phase == .completed || session.phase == .shortBreak ? .green : .indigo.opacity(0.5)).accessibilityLabel(status(session))
        }.contentShape(Rectangle()).accessibilityElement(children: .combine)
    }
    private func sessionDetail(_ session: PomodoroSession) -> some View {
        NavigationStack {
            let stats = PomodoroAnalytics(sessions: [session], period: .all)
            Form {
                Section(session.category.title) {
                    if !session.name.isEmpty { Text(session.name) }
                    LabeledContent("Status", value: status(session))
                    LabeledContent("Started", value: Date(timeIntervalSince1970: session.startedAt).formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Planned focus", value: "\(session.durationMinutes) min")
                    LabeledContent("Focus time", value: time(stats.focused(session)))
                    LabeledContent("Break time", value: time(stats.rested(session)))
                }
                if store.current?.id == session.id && store.current?.active == true { Button("Return to Timer") { selectedSession = nil; onStart() } }
            }.navigationTitle("Session details").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { selectedSession = nil } } }
        }
    }
    private func status(_ session: PomodoroSession) -> String { switch session.phase { case .completed: "Completed"; case .stopped: "Stopped early"; case .shortBreak: "Focus complete · Break"; case .focus: session.paused ? "Paused" : "In progress" } }
    private func dayTitle(_ date: Date) -> String {
        let calendar = Calendar.current
        let prefix = calendar.isDateInToday(date) ? "Today, " : calendar.isDateInYesterday(date) ? "Yesterday, " : ""
        return prefix + date.formatted(.dateTime.month(.abbreviated).day().year())
    }
    private func time(_ seconds: Double) -> String {
        let minutes = Int(max(0, seconds)) / 60
        if minutes >= 60 { return "\(minutes / 60)h \(minutes % 60)m" }
        return minutes == 0 && seconds > 0 ? "\(Int(seconds))s" : "\(minutes) min"
    }
    private func categoryColor(_ category: PomodoroCategory) -> Color { switch category { case .reading: .green; case .focus: .purple; case .coding: .orange; case .diary: .pink; case .math: .yellow; case .stretching: .cyan } }
}

private extension View {
    func dashboardCard() -> some View {
        padding(16).background(.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 20))
            .overlay { RoundedRectangle(cornerRadius: 20).stroke(.indigo.opacity(0.06), lineWidth: 1) }
            .shadow(color: .blue.opacity(0.06), radius: 10, y: 4)
    }
}
