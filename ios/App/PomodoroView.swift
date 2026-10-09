import SwiftUI

struct PomodoroView: View {
    @StateObject private var store: PomodoroStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var category: PomodoroCategory = .focus
    @State private var name = ""
    @State private var minutes = 25
    @ScaledMetric(relativeTo: .body) private var startButtonSpacing = 60
    @State private var autoBreak = true
    @State private var sound = true
    @State private var stopping = false
    @State private var history = false
    @State private var showingDashboard: Bool
    @State private var visible = false
    /// Where the completion button goes. Opened from Tasks (or an alert) it is "Back to Tasks"; opened from Wellness
    /// there is no Tasks to go back to, so it is "Done" and only closes Pomodoro.
    private let onTasks: (() -> Void)?
    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let ink = Color(red: 0.05, green: 0.04, blue: 0.25)
    private let gradient = LinearGradient(colors: [.purple, .indigo, .blue], startPoint: .leading, endPoint: .trailing)

    init(api: APIClient, owner: String, preview: Bool = false, onTasks: (() -> Void)? = nil) {
        _store = StateObject(wrappedValue: PomodoroStore(api: api, owner: owner, preview: preview))
        self.onTasks = onTasks
        _showingDashboard = State(initialValue: !preview || ProcessInfo.processInfo.arguments.contains("-pomodoro-dashboard-preview"))
    }
    var body: some View {
        Group {
        if showingDashboard {
            PomodoroDashboard(store: store, onClose: { dismiss() }, onStart: {
                if store.current?.active != true { store.newSession() }
                showingDashboard = false
            })
        } else {
        GeometryReader { geometry in
        ZStack {
            LinearGradient(colors: [Color.purple.opacity(0.05), .white, Color.blue.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
            ScrollView {
                VStack(spacing: 14) {
                    HStack {
                        Button { showingDashboard = true } label: { Image(systemName: "chevron.left").frame(width: 40, height: 40).background(.purple.opacity(0.07), in: Circle()) }.accessibilityLabel("Pomodoro dashboard")
                        Spacer()
                        if store.current == nil { Text("Pomodoro").font(.title2.bold()) }
                        Spacer()
                        Button { history = true } label: { Image(systemName: "clock.arrow.circlepath").frame(width: 40, height: 40).background(.purple.opacity(0.07), in: Circle()) }.accessibilityLabel("Session history")
                    }
                    if let session = store.current {
                        if session.active { timer(session, compact: geometry.size.height < 740) } else { completion(session) }
                    } else { setup }
                    if let message = store.syncMessage {
                        VStack(spacing: 8) { Text(message).font(.caption).foregroundStyle(.secondary); Button("Retry sync") { Task { await store.restore() } }.disabled(store.syncing) }
                    }
                }.padding(16).frame(maxWidth: 620).frame(maxWidth: .infinity)
            }.id(store.current?.phase)
        }
        }
        }
        }
        .foregroundStyle(ink).tint(.indigo)
        .onAppear { PomodoroNotificationRoute.shared.pomodoroAppeared() }
        .task { visible = true; await store.restore(); updateAwake() }
        .onReceive(clock) { _ in store.tick() }
        .onChange(of: showingDashboard) { _, _ in updateAwake() }
        .onChange(of: history) { _, _ in updateAwake() }
        .onChange(of: store.current) { _, _ in updateAwake() }
        .onChange(of: scenePhase) { _, value in
            updateAwake()
            if value == .active { store.tick(); Task { await store.restore() } }
        }
        .onDisappear { visible = false; UIApplication.shared.isIdleTimerDisabled = false; PomodoroNotificationRoute.shared.pomodoroDisappeared() }
        .confirmationDialog("Stop this focus session?", isPresented: $stopping, titleVisibility: .visible) {
            Button("Stop session", role: .destructive) { store.mutate { $0.stop(at: Date()) } }
        } message: { Text("Your time so far will be saved in session history.") }
        .sheet(isPresented: $history) { historyView }
    }
    private func updateAwake() {
        UIApplication.shared.isIdleTimerDisabled = visible && !showingDashboard && !history && scenePhase == .active && store.current?.phase == .focus && store.current?.paused == false && store.current?.keepAwake == true
    }
    private func tint(_ category: PomodoroCategory) -> Color {
        switch category { case .reading: .mint; case .focus: .purple; case .coding: .orange; case .diary: .pink; case .math: .yellow; case .stretching: .cyan; case .personalWork: .blue }
    }
    private var setup: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Choose a focus type and set your timer.").foregroundStyle(.secondary).frame(maxWidth: .infinity)
            Text("Focus Category").font(.headline)
            VStack(spacing: 2) {
                ForEach(PomodoroCategory.allCases, id: \.self) { item in
                    Button { category = item } label: {
                        HStack(spacing: 12) {
                            Image(systemName: item.icon).foregroundStyle(.white).frame(width: 30, height: 30).background(tint(item).gradient, in: RoundedRectangle(cornerRadius: 10))
                            Text(item.title).font(.body.weight(.medium)); Spacer()
                            Image(systemName: item == category ? "checkmark.circle.fill" : "circle").foregroundStyle(item == category ? .purple : .indigo.opacity(0.4)).font(.title3)
                        }.padding(5).background(item == category ? Color.purple.opacity(0.09) : .clear, in: RoundedRectangle(cornerRadius: 12)).contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityIdentifier("pomodoro-category-" + item.rawValue).accessibilityAddTraits(item == category ? .isSelected : [])
                }
            }.padding(3).background(.white, in: RoundedRectangle(cornerRadius: 18)).shadow(color: .indigo.opacity(0.08), radius: 8, y: 3)
            VStack(alignment: .leading, spacing: 8) {
                Text("+ Session name")
                TextField("What will you focus on?", text: $name)
                    .padding(12)
                    .background(.white, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.nexdoIndigo.opacity(0.5), lineWidth: 1.5).allowsHitTesting(false))
                    .onChange(of: name) { _, value in let limited = PomodoroSession.limitName(value); if limited != value { name = limited } }
                    .accessibilityLabel("Session name (optional)").accessibilityIdentifier("pomodoro-name")
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Focus Duration")
                HStack {
                    Button { minutes = max(5, minutes - 5) } label: { Image(systemName: "minus.circle").font(.title2).frame(width: 44, height: 44) }.disabled(minutes <= 5).accessibilityLabel("Decrease focus duration by 5 minutes")
                    Spacer(); Text("\(minutes) min").font(.headline).monospacedDigit(); Spacer()
                    Button { minutes = min(120, minutes + 5) } label: { Image(systemName: "plus.circle").font(.title2).frame(width: 44, height: 44) }.disabled(minutes == 120).accessibilityLabel("Increase focus duration by 5 minutes")
                }.background(.white, in: RoundedRectangle(cornerRadius: 14))
            }
            Toggle(isOn: $autoBreak) { VStack(alignment: .leading, spacing: 4) { Text("Auto Start Break"); Text("Start a 5-minute break automatically after focus.").font(.caption).foregroundStyle(.secondary) } }
            Toggle("Play Sound", isOn: $sound)
            primary("Start Focus Session") { store.start(category: category, name: name, minutes: minutes, autoBreak: autoBreak, sound: sound); name = "" }
                .padding(.top, max(0, startButtonSpacing - 12))
        }
    }
    private func timer(_ session: PomodoroSession, compact: Bool) -> some View {
        let isBreak = session.phase == .shortBreak
        return VStack(spacing: compact ? 10 : 20) {
            Label(isBreak ? "Short Break" : session.category.title, systemImage: isBreak ? "cup.and.saucer.fill" : session.category.icon)
                .font(.subheadline.weight(.semibold)).padding(.horizontal, 18).padding(.vertical, 10).foregroundStyle(isBreak ? .blue : .purple).background((isBreak ? Color.blue : .purple).opacity(0.08), in: Capsule())
            Text(isBreak ? "Time for a short break!" : (session.name.isEmpty ? "Time to focus" : session.name)).font(.title2.bold()).multilineTextAlignment(.center)
            if isBreak { Text("You’ve earned it! ☕").foregroundStyle(.secondary) }
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let seconds = Int(ceil(session.remaining(at: context.date)))
                ZStack {
                    Circle().stroke((isBreak ? Color.blue : .pink).opacity(0.22), lineWidth: 15)
                    Circle().trim(from: 0, to: max(0.002, 1 - session.progress(at: context.date)))
                        .stroke(AngularGradient(colors: isBreak ? [.blue, .cyan, .blue.opacity(0.3)] : [.purple, .pink, .pink.opacity(0.3)], center: .center), style: StrokeStyle(lineWidth: 15, lineCap: .round))
                        .rotationEffect(.degrees(-90)).animation(reduceMotion ? nil : .linear(duration: 1), value: seconds)
                    VStack(spacing: 8) {
                        if isBreak { Text("☕").font(.system(size: compact ? 48 : 65)) } else { Image("pomodoro-tomato").resizable().scaledToFit().frame(width: compact ? 65 : 90, height: compact ? 60 : 82).accessibilityHidden(true) }
                        Text(String(format: "%02d:%02d", seconds / 60, seconds % 60)).font(.system(size: compact ? 42 : 54, weight: .bold, design: .rounded)).monospacedDigit().minimumScaleFactor(0.6)
                        Text(session.paused ? "Paused" : (isBreak ? "Short Break" : "Focus Time")).font(.title3)
                    }.padding(compact ? 15 : 30)
                }.frame(width: compact ? 240 : 300, height: compact ? 240 : 300).padding(8).frame(maxWidth: .infinity)
            }
            Text(isBreak ? "“A rested mind is a more productive mind.”" : "“Small steps. Big results.” 💪").font(.subheadline.italic()).multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(16).background((isBreak ? Color.blue : .purple).opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
            HStack(spacing: 40) {
                if isBreak {
                    control("Skip", icon: "forward.end.fill", color: .blue) { store.mutate { $0.stop(at: Date()) } }
                    control("End Break", icon: "stop.fill", color: .blue) { store.mutate { $0.stop(at: Date()) } }
                } else {
                    control(session.paused ? "Resume" : "Pause", icon: session.paused ? "play.fill" : "pause.fill", color: .pink) { store.mutate { $0.togglePause(at: Date()) } }
                    control("Stop", icon: "stop.fill", color: .pink) { stopping = true }
                }
            }.padding(.vertical, compact ? 0 : 8)
            if !isBreak {
                Toggle(isOn: Binding(get: { session.keepAwake }, set: { value in store.mutate { $0.setKeepAwake(value, at: Date()) } })) {
                    Label { VStack(alignment: .leading, spacing: 4) { Text("Distraction-free mode").font(.subheadline.weight(.semibold)); Text("Keep this focus screen awake.").font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: "moon.fill").foregroundStyle(.purple) }
                }.padding(16).background(.purple.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
            }
        }
    }
    private func completion(_ session: PomodoroSession) -> some View {
        VStack(spacing: 24) {
            ZStack {
                if session.phase == .completed { PomodoroConfetti().frame(height: 180).accessibilityHidden(true) }
                Image(systemName: session.phase == .completed ? "checkmark" : "stop.fill").font(.system(size: 46, weight: .bold)).foregroundStyle(.white).frame(width: 110, height: 110).background(gradient, in: Circle()).shadow(color: .purple.opacity(0.2), radius: 16, y: 8)
            }.frame(height: 180)
            VStack(spacing: 8) { Text(session.phase == .completed ? "Great job!" : "Session stopped").font(.largeTitle.bold()); Text(session.phase == .completed ? "Focus session completed." : "Your focus time has been saved.").foregroundStyle(.secondary) }
            HStack {
                statistic("🍅", time: duration(session.focusSeconds), label: "Focus time")
                Divider().frame(height: 60)
                statistic("☕", time: duration(session.breakSeconds), label: "Break time")
                Divider().frame(height: 60)
                statistic("📅", time: session.phase == .completed ? "1" : "0", label: "Completed")
            }.padding(16).background(.white, in: RoundedRectangle(cornerRadius: 20)).shadow(color: .indigo.opacity(0.06), radius: 10, y: 4)
            HStack(spacing: 14) { Image(systemName: session.category.icon).font(.title2).foregroundStyle(.purple); VStack(alignment: .leading, spacing: 5) { Text(session.category.title).bold(); if !session.name.isEmpty { Text(session.name).font(.subheadline) } }; Spacer() }.padding(18).background(.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 18))
            primary("Start Another Session") { store.newSession() }
            Button(onTasks == nil ? "Done" : "Back to Tasks") { onTasks?(); dismiss() }.font(.headline).frame(maxWidth: .infinity).padding(16).background(.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
        }
    }
    private func duration(_ seconds: Double) -> String { seconds < 60 ? "\(Int(seconds)) sec" : "\(Int(seconds) / 60) min" }
    private func statistic(_ emoji: String, time: String, label: String) -> some View { VStack(spacing: 8) { Text(emoji).font(.title); Text(time).font(.headline); Text(label).font(.caption) }.frame(maxWidth: .infinity) }
    private func primary(_ title: String, action: @escaping () -> Void) -> some View { Button(action: action) { Text(title).font(.headline).foregroundStyle(.white).frame(maxWidth: .infinity).padding(17).background(gradient, in: RoundedRectangle(cornerRadius: 16)) }.buttonStyle(.plain) }
    private func control(_ title: String, icon: String, color: Color, action: @escaping () -> Void) -> some View { Button(action: action) { VStack(spacing: 10) { Image(systemName: icon).font(.title2).frame(width: 66, height: 66).background(color.opacity(0.10), in: Circle()).foregroundStyle(color); Text(title).font(.subheadline) } }.accessibilityLabel(title) }
    private var historyView: some View {
        PomodoroDashboard(store: store, initialTab: .sessions, onClose: { history = false }, onStart: {
            history = false
            if store.current?.active != true { store.newSession() }
            showingDashboard = false
        })
    }

}

private struct PomodoroConfetti: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spread = false
    var body: some View {
        GeometryReader { proxy in
            ForEach(0..<28, id: \.self) { index in
                Capsule().fill([Color.pink, .purple, .blue, .orange, .mint][index % 5]).frame(width: 5, height: 9)
                    .rotationEffect(.degrees(Double(index * 47)))
                    .position(x: proxy.size.width * CGFloat((index * 37 % 97) + 1) / 100, y: CGFloat((index * 29 % 140) + 10) + (spread ? 12 : -12))
                    .opacity(spread ? 0.9 : 0.4)
            }
        }.onAppear { if reduceMotion { spread = true } else { withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) { spread = true } } }
    }
}
