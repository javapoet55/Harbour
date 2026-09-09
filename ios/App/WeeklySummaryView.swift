import SwiftUI
import Charts

struct WeeklySummaryView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var typeSize
    let onPlanNextWeek: (String) -> Void
    @State private var weekStart = Date()
    @State private var summary: WeeklySummary?
    @State private var loading = true
    @State private var error: String?
    @State private var requestID = UUID()
    @State private var selectedDay: String?

    private var timeZoneID: String { model.profile?.timeZone ?? TimeZone.current.identifier }
    private var currentWeek: Date { WeeklySummaryDates.startOfWeek(containing: Date(), timeZoneID: timeZoneID) }
    private var canMoveForward: Bool { weekStart < currentWeek }
    private var shareText: String {
        guard let summary else { return "Weekly Summary" }
        let metrics = summary.metrics
        return "Weekly Summary (\(rangeLabel))\n\(summary.headline)\n\(summary.summary)\nCompleted: \(metrics.completed) of \(metrics.planned)\nOverdue: \(metrics.overdue.map(String.init) ?? "Unavailable")\nFocus time: \(focusLabel(metrics.focusMinutes))"
    }

    var body: some View {
        ZStack {
            WeeklySummaryBackdrop()
            content
        }
        .navigationTitle("Weekly Summary")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: shareText).disabled(summary == nil).accessibilityLabel("Share weekly summary")
            }
        }
        .task {
            weekStart = currentWeek
            await load()
        }
    }

    @ViewBuilder private var content: some View {
        if loading && summary == nil {
            ProgressView("Loading weekly summary…").accessibilityAddTraits(.updatesFrequently)
        } else if let error, summary == nil {
            ContentUnavailableView("Couldn’t load this week", systemImage: "exclamationmark.arrow.triangle.2.circlepath", description: Text(error))
                .overlay(alignment: .bottom) { Button("Retry") { Task { await load() } }.buttonStyle(.borderedProminent).padding(.bottom, 80) }
        } else if let summary {
            ScrollView {
                LazyVStack(spacing: 16) {
                    weekSelector
                    summaryCard(summary)
                    metricsGrid(summary.metrics)
                    chartCard(summary)
                    accomplishmentsCard(summary)
                    if let insight = summary.productivityInsight { insightCard(insight) }
                    limitations(summary.limitations)
                    planButton(summary)
                }
                .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .refreshable { await load() }
        }
    }

    private var weekSelector: some View {
        HStack {
            Button { moveWeek(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                .accessibilityLabel("Previous week")
            Spacer()
            Text(rangeLabel).font(.headline).foregroundStyle(Color.nexdoInk).lineLimit(1).minimumScaleFactor(0.8)
            Spacer()
            Button { moveWeek(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                .disabled(!canMoveForward).accessibilityLabel("Next week")
        }
        .padding(.horizontal, 6).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.nexdoIndigo.opacity(0.12)))
    }

    private func summaryCard(_ value: WeeklySummary) -> some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: "sparkles").font(.title).foregroundStyle(Color.nexdoPurple).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 7) {
                Text(value.headline).font(.title2.bold()).foregroundStyle(Color.nexdoInk).accessibilityAddTraits(.isHeader)
                Text(value.summary).font(.body).foregroundStyle(Color.nexdoSecondary)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.weeklyCard()
    }

    private func metricsGrid(_ metrics: WeeklySummary.Metrics) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            MetricCard(icon: "checkmark.circle.fill", color: .green, value: "\(metrics.completed) of \(metrics.planned)", label: "Tasks completed")
            CompletionMetricCard(rate: metrics.completionRate)
            MetricCard(icon: "exclamationmark.circle.fill", color: .red, value: metrics.overdue.map(String.init) ?? "Unavailable", label: "Overdue tasks")
            MetricCard(icon: "clock", color: .nexdoPurple, value: focusLabel(metrics.focusMinutes), label: "Recorded focus time")
        }
    }

    private func chartCard(_ value: WeeklySummary) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Planned vs completed").font(.title3.bold()).foregroundStyle(Color.nexdoInk)
            if value.days.allSatisfy({ $0.planned == 0 && $0.completed == 0 }) {
                ContentUnavailableView("No task activity", systemImage: "chart.bar", description: Text("There are no planned or completed tasks in this week’s cohort."))
                    .frame(minHeight: 180)
            } else {
                Chart(value.days) { day in
                    BarMark(x: .value("Date", day.date), y: .value("Tasks", day.planned)).foregroundStyle(by: .value("Series", "Planned")).position(by: .value("Series", "Planned"))
                    BarMark(x: .value("Date", day.date), y: .value("Tasks", day.completed)).foregroundStyle(by: .value("Series", "Completed")).position(by: .value("Series", "Completed"))
                }
                .chartForegroundStyleScale(["Planned": Color.nexdoBlue.opacity(0.42), "Completed": Color.nexdoPurple])
                .chartXAxis { AxisMarks(values: value.days.map(\.date)) { mark in AxisValueLabel { if let raw = mark.as(String.self) { Text(weekday(raw)) } } } }
                .chartLegend(position: .bottom, alignment: .center)
                // `chartXSelection` installs a drag gesture that competes with the
                // surrounding vertical ScrollView. Use a discrete tap instead so
                // swipes that begin on the chart continue scrolling the report.
                .chartOverlay { proxy in
                    GeometryReader { geometry in
                        Color.clear
                            .contentShape(Rectangle())
                            .gesture(
                                SpatialTapGesture().onEnded { tap in
                                    guard let plotFrame = proxy.plotFrame else { return }
                                    let plotOrigin = geometry[plotFrame].origin
                                    let xPosition = tap.location.x - plotOrigin.x
                                    guard let day: String = proxy.value(atX: xPosition) else { return }
                                    selectedDay = day
                                }
                            )
                    }
                }
                .frame(height: 220)
                .accessibilityLabel("Planned versus completed tasks by day")
                if let selectedDay, let day = value.days.first(where: { $0.date == selectedDay }) {
                    Text("\(longDay(day.date)): \(day.planned) planned, \(day.completed) completed").font(.caption).foregroundStyle(Color.nexdoSecondary)
                }
            }
        }.weeklyCard()
    }

    private func accomplishmentsCard(_ value: WeeklySummary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Top accomplishments").font(.title3.bold()).foregroundStyle(Color.nexdoInk)
            if value.accomplishments.isEmpty { Text("No completed tasks in this week’s planned cohort.").foregroundStyle(Color.nexdoSecondary) }
            ForEach(value.accomplishments) { accomplishment in
                if let task = model.tasks.first(where: { $0.id == accomplishment.id }) {
                    NavigationLink { TaskDetailsView(task: task) } label: { accomplishmentRow(accomplishment) }.buttonStyle(.plain)
                } else { accomplishmentRow(accomplishment) }
            }
        }.weeklyCard()
    }

    private func accomplishmentRow(_ item: WeeklySummary.Accomplishment) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).accessibilityHidden(true)
            Text(item.title).foregroundStyle(Color.nexdoInk).frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.nexdoSecondary).accessibilityHidden(true)
        }.frame(minHeight: 44).accessibilityElement(children: .combine).accessibilityHint("Opens task details")
    }

    private func insightCard(_ insight: String) -> some View {
        Label(insight, systemImage: "sparkles").font(.subheadline.bold()).foregroundStyle(Color.nexdoIndigo).weeklyCard()
    }

    private func limitations(_ values: [String]) -> some View {
        DisclosureGroup("How these metrics are calculated") {
            VStack(alignment: .leading, spacing: 8) { ForEach(values, id: \.self) { Text("• \($0)").font(.footnote).foregroundStyle(Color.nexdoSecondary) } }.padding(.top, 8)
        }.font(.subheadline.weight(.semibold)).weeklyCard()
    }

    private func planButton(_ value: WeeklySummary) -> some View {
        Button { onPlanNextWeek(planPrompt(value)) } label: {
            Text("Plan next week with Nexdo →").font(.headline).foregroundStyle(.white).frame(maxWidth: .infinity, minHeight: 54).background(NexdoTheme.gradient, in: RoundedRectangle(cornerRadius: 18))
        }.buttonStyle(.plain).accessibilityHint("Opens Ask Nexdo with this summary. No tasks are changed without approval.")
    }

    private func moveWeek(_ amount: Int) {
        let target = WeeklySummaryDates.addingWeek(amount, to: weekStart, timeZoneID: timeZoneID)
        guard target <= currentWeek else { return }
        weekStart = target; selectedDay = nil; summary = nil
        Task { await load() }
    }

    @MainActor private func load() async {
        let id = UUID(); requestID = id; loading = true; error = nil
        do {
            let value = try await model.weeklySummary(start: WeeklySummaryDates.apiDay(weekStart, timeZoneID: timeZoneID))
            guard requestID == id else { return }
            summary = value
        } catch {
            guard requestID == id else { return }
            self.error = error.localizedDescription
        }
        if requestID == id { loading = false }
    }

    private var rangeLabel: String {
        let end = WeeklySummaryDates.calendar(timeZoneID: timeZoneID).date(byAdding: .day, value: 6, to: weekStart)!
        let startFormatter = DateFormatter(); startFormatter.timeZone = TimeZone(identifier: timeZoneID); startFormatter.dateFormat = "MMM d"
        let endFormatter = DateFormatter(); endFormatter.timeZone = TimeZone(identifier: timeZoneID); endFormatter.dateFormat = "MMM d, yyyy"
        return "\(startFormatter.string(from: weekStart))–\(endFormatter.string(from: end))"
    }
    private func focusLabel(_ minutes: Int?) -> String { guard let minutes else { return "Unavailable" }; return minutes < 60 ? "\(minutes)m" : String(format: "%.1fh", Double(minutes) / 60) }
    private func weekday(_ raw: String) -> String { dateFormatter("EEEEE").string(from: dayDate(raw) ?? Date()) }
    private func longDay(_ raw: String) -> String { dateFormatter("EEE, MMM d").string(from: dayDate(raw) ?? Date()) }
    private func dayDate(_ raw: String) -> Date? { let f = dateFormatter("yyyy-MM-dd"); return f.date(from: raw) }
    private func dateFormatter(_ format: String) -> DateFormatter { let f = DateFormatter(); f.calendar = WeeklySummaryDates.calendar(timeZoneID: timeZoneID); f.timeZone = f.calendar.timeZone; f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = format; return f }
    private func planPrompt(_ value: WeeklySummary) -> String {
        let nextStart = WeeklySummaryDates.addingWeek(1, to: weekStart, timeZoneID: timeZoneID)
        let nextEnd = WeeklySummaryDates.calendar(timeZoneID: timeZoneID).date(byAdding: .day, value: 6, to: nextStart)!
        return "Help me plan the week from \(WeeklySummaryDates.apiDay(nextStart, timeZoneID: timeZoneID)) through \(WeeklySummaryDates.apiDay(nextEnd, timeZoneID: timeZoneID)). Facts from \(value.start) through \(value.end): \(value.metrics.completed) of \(value.metrics.planned) planned tasks completed, \(value.metrics.overdue.map(String.init) ?? "overdue unavailable") overdue, and \(value.metrics.focusMinutes.map { "\($0) recorded focus minutes" } ?? "focus time unavailable"). Propose a plan for my review; do not modify tasks without my approval."
    }
}

private struct MetricCard: View {
    let icon: String; let color: Color; let value: String; let label: String
    var body: some View { VStack(alignment: .leading, spacing: 8) { Image(systemName: icon).font(.title2).foregroundStyle(color); Text(value).font(.title2.bold()).foregroundStyle(Color.nexdoInk).minimumScaleFactor(0.72); Text(label).font(.caption).foregroundStyle(Color.nexdoSecondary) }.frame(maxWidth: .infinity, minHeight: 112, alignment: .leading).weeklyCard() }
}

private struct CompletionMetricCard: View {
    let rate: Int?
    var body: some View { HStack { ZStack { Circle().stroke(Color.nexdoBlue.opacity(0.18), lineWidth: 7); Circle().trim(from: 0, to: CGFloat(rate ?? 0) / 100).stroke(Color.nexdoBlue, style: StrokeStyle(lineWidth: 7, lineCap: .round)).rotationEffect(.degrees(-90)) }.frame(width: 44, height: 44).accessibilityHidden(true); VStack(alignment: .leading, spacing: 5) { Text(rate.map { "\($0)%" } ?? "Unavailable").font(.title2.bold()).foregroundStyle(Color.nexdoInk).minimumScaleFactor(0.7); Text("Completion rate").font(.caption).foregroundStyle(Color.nexdoSecondary) } }.frame(maxWidth: .infinity, minHeight: 112, alignment: .leading).weeklyCard() }
}

private struct WeeklySummaryBackdrop: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View { LinearGradient(colors: scheme == .dark ? [Color(red: 0.03, green: 0.08, blue: 0.14), Color(red: 0.14, green: 0.03, blue: 0.13)] : [Color(red: 0.88, green: 0.96, blue: 1), Color(red: 1, green: 0.91, blue: 0.98)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea() }
}

private extension View {
    func weeklyCard() -> some View { self.padding(16).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.white.opacity(0.34))) }
}
