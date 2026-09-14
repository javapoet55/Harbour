import SwiftUI

struct DoNowView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var recommendation: DoNowRecommendation?
    @State private var loading = false
    @State private var starting = false
    @State private var error: String?
    @State private var customMinutes = ""
    @State private var requestedUntil: Date?
    private var requestedMinutes: Int? { requestedUntil.map { max(0, Int(ceil($0.timeIntervalSinceNow / 60))) } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if !model.aiConsent {
                        Text("Nexdo uses your tasks, calendar, and preferences to recommend what to do now. AI explanations may share this information with OpenAI.")
                        Button("Allow and find my next task") { model.aiConsent = true; Task { await refresh() } }.buttonStyle(.borderedProminent)
                    } else {
                        HStack {
                            TextField("Minutes available (optional)", text: $customMinutes).keyboardType(.numberPad)
                            Button("Update") {
                                let input = customMinutes.trimmingCharacters(in: .whitespacesAndNewlines)
                                if input.isEmpty {
                                    requestedUntil = nil
                                    Task { await refresh() }
                                    return
                                }
                                guard let value = Int(input), (1...480).contains(value) else {
                                    error = "Enter between 1 and 480 minutes."; return
                                }
                                requestedUntil = Date().addingTimeInterval(Double(value * 60))
                                Task { await refresh() }
                            }.disabled(loading || starting)
                        }
                        Text("Leave this blank to use your current opening within saved working hours. Enter minutes to work outside those hours. Appointments and buffers still apply.")
                            .font(.caption).foregroundStyle(.secondary)
                        if requestedMinutes != nil {
                            Button("Use my calendar opening") { customMinutes = ""; requestedUntil = nil; Task { await refresh() } }.disabled(loading || starting)
                        }
                        if loading { ProgressView("Finding your best next step…").frame(maxWidth: .infinity) }
                        if let error {
                            Text(error).foregroundStyle(.red)
                            Button("Refresh recommendation") { Task { await refresh() } }.disabled(loading || starting)
                        }
                        if let recommendation, let next = recommendation.nextAction {
                            Text(next.outsideWorkingHours == true ? "Outside your working hours" : "You have \(DurationDisplay.durationLabel(next.availableWindowMinutes)) free now")
                                .font(.title2.bold()).foregroundStyle(Color.nexdoInk)
                            if let remaining = next.remainingWorkingMinutesToday {
                                Text("Unreserved working time remaining today: \(DurationDisplay.durationLabel(remaining))")
                                    .font(.subheadline).foregroundStyle(.secondary)
                                Text("This can include several gaps. Unscheduled tasks have not reserved time in your calendar.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            if let best = next.bestAction {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text(next.continuingFocus ? "Keep your focus" : "Best thing to do now").font(.subheadline.weight(.semibold)).foregroundStyle(Color.nexdoIndigo)
                                    choiceLabel(best, zone: recommendation.timeZone)
                                    if let reason = best.reasons.first { Text(reason).font(.subheadline).foregroundStyle(.secondary) }
                                    if model.focusSession?.taskID == best.taskId {
                                        Button("Continue Focus Session") { dismiss() }.buttonStyle(.borderedProminent)
                                    } else {
                                        Button(starting ? "Starting…" : "Start Focus Session") { Task { await start(best) } }
                                            .buttonStyle(.borderedProminent).disabled(!recommendation.canStart || starting || loading)
                                    }
                                }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.nexdoIndigo.opacity(0.07), in: RoundedRectangle(cornerRadius: 22))
                                if !recommendation.canStart {
                                    Text("Refresh your calendar before starting a recommended session.").font(.caption).foregroundStyle(.secondary)
                                }
                                if !next.alternatives.isEmpty {
                                    Text("Other options").font(.headline)
                                    ForEach(Array(next.alternatives.prefix(2))) { choice in
                                        Button { Task { await start(choice) } } label: {
                                            HStack { choiceLabel(choice, zone: recommendation.timeZone); Spacer(); Image(systemName: "play.circle") }
                                                .padding(16).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                                        }.buttonStyle(.plain).disabled(!recommendation.canStart || starting || loading)
                                            .accessibilityHint("Starts a \(choice.focusMinutes)-minute focus session")
                                    }
                                }
                            } else {
                                Text(recommendation.summary).foregroundStyle(.secondary)
                                if next.outsideWorkingHours != true {
                                    Text("No task fits this current opening. You can enter a different amount of available time above.").font(.subheadline)
                                }
                            }
                        }
                    }
                }.padding(24)
            }
            .navigationTitle("What should I do now?").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.disabled(starting) } }
            .interactiveDismissDisabled(starting)
            .task {
                if model.aiConsent { await refresh() }
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(60)) } catch { return }
                    if scenePhase == .active && model.aiConsent { await refresh() }
                }
            }
            .onChange(of: scenePhase) { _, phase in if phase == .active && model.aiConsent { Task { await refresh() } } }
        }
    }
    private func choiceLabel(_ choice: DoNowRecommendation.Choice, zone: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(choice.title).font(.headline).foregroundStyle(Color.nexdoInk)
            Text("~\(choice.focusMinutes) min\(choice.partial ? " focus block" : "")" + (choice.dueAt.map { " · Due \(deadline($0, zone: zone))" } ?? ""))
                .font(.subheadline).foregroundStyle(.secondary)
        }
    }
    private func deadline(_ value: String, zone: String) -> String {
        guard let date = ServerDate.parse(value) else { return "date unavailable" }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: zone) ?? .current
        let format = DateFormatter(); format.timeZone = calendar.timeZone
        format.dateStyle = calendar.isDate(date, inSameDayAs: Date()) ? .none : .short
        format.timeStyle = .short
        return format.string(from: date)
    }
    @MainActor private func refresh() async {
        guard !loading, !starting else { return }
        loading = true; error = nil; recommendation = nil
        defer { loading = false }
        do {
            guard requestedMinutes != 0 else { error = "That free-time window has ended. Update your available minutes or use your calendar opening."; return }
            recommendation = try await model.recommendDoNow(minutes: requestedMinutes)
        }
        catch { self.error = error.localizedDescription }
    }
    @MainActor private func start(_ choice: DoNowRecommendation.Choice) async {
        guard !starting, !loading else { return }
        if let requestedMinutes, choice.focusMinutes > requestedMinutes {
            await refresh()
            error = "Your available time has changed. Choose from the refreshed options."
            return
        }
        starting = true; error = nil
        defer { starting = false }
        do { try await model.startRecommendedFocus(choice); dismiss() }
        catch { self.error = error.localizedDescription; recommendation = nil }
    }
}
