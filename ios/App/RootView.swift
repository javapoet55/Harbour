import SwiftUI
import AuthenticationServices
import CryptoKit

struct RootView: View {
    @StateObject private var model: AppModel
    @StateObject private var moments: ImportantMomentsStore
    init() {
        let model = AppModel()
        _model = StateObject(wrappedValue: model)
        _moments = StateObject(wrappedValue: ImportantMomentsStore(api: model.momentAPI))
    }
    @ObservedObject private var momentRoutes = MomentNotificationRoute.shared
    @ObservedObject private var taskActions = TaskActionCoordinator.shared
    @Environment(\.scenePhase) private var phase
    @State private var selectedTab: NexdoTab = .today
    var body: some View {
        Group {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-shopping-design-preview") {
                ShoppingDesignPreview()
            } else if ProcessInfo.processInfo.arguments.contains("-moments-design-preview") {
                MomentsDesignPreview()
            } else if ProcessInfo.processInfo.arguments.contains("-calendar-manual-preview") {
                NavigationStack { CalendarEventEditor() }
            } else if ProcessInfo.processInfo.arguments.contains("-calendar-voice-preview") {
                AddTaskByVoiceView(calendarOnly: true)
            } else if ProcessInfo.processInfo.arguments.contains("-ask-design-preview") {
                AskNexdoView()
            } else if ProcessInfo.processInfo.arguments.contains("-ask-text-design-preview") {
                AskNexdoView(textPage: true)
            } else if ProcessInfo.processInfo.arguments.contains("-ask-voice-design-preview") {
                AddTaskByVoiceView(askMode: true)
            } else if ProcessInfo.processInfo.arguments.contains("-weekly-summary-preview") {
                WeeklySummaryPreview()
            } else if ProcessInfo.processInfo.arguments.contains("-projects-design-preview") {
                ProjectsDesignPreview()
            } else if ProcessInfo.processInfo.arguments.contains("-calendar-design-preview") {
                CalendarDesignPreview()
            } else if ProcessInfo.processInfo.arguments.contains("-today-design-preview") {
                TodayDesignPreview()
            } else if ProcessInfo.processInfo.arguments.contains("-task-design-preview") || ProcessInfo.processInfo.arguments.contains("-voice-task-design-preview") {
                TaskDesignPreview()
            } else if ProcessInfo.processInfo.arguments.contains("-email-verification-preview") {
                NavigationStack { EmailVerificationView(pending: PendingEmailVerification(email: "preview@example.com", reason: .codeSent), showsCancel: true) }
            } else if model.profile != nil {
                authenticatedTabs
            } else { SignInView() }
            #else
            if model.profile != nil {
                authenticatedTabs
            } else { SignInView() }
            #endif
        }
        .environmentObject(model)
        .environmentObject(moments)
        .tint(.nexdoIndigo)
        .onChange(of: model.profile?.id) { _, id in taskActions.activate(userID: id); model.refreshNextAction(); Task { await moments.activate(id) } }
        .onReceive(model.$tasks) { tasks in
            if let id = model.profile?.id { taskActions.synchronize(tasks: tasks, userID: id); if phase == .active { model.refreshNextAction() } }
        }
        .onReceive(model.$focusSession.dropFirst()) { _ in if phase == .active { model.refreshNextAction() } }
        .onReceive(model.$agenda.dropFirst()) { _ in if phase == .active { model.refreshNextAction() } }
        .task {
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                if phase == .active { model.refreshNextAction(); await moments.refresh() }
            }
        }
        .onChange(of: momentRoutes.pending) { _, _ in Task { await moments.refresh(); moments.resolveRoute() } }
        .background { MomentSheetHost().environmentObject(moments) }
        .sheet(item: $taskActions.route) { route in
            TaskActionView(actionID: route.id, preferred: route.preferred).environmentObject(model)
        }
        .overlay(alignment: .top) { if model.busy { ProgressView("Updating…").padding(8).background(.regularMaterial, in: Capsule()).accessibilityAddTraits(.updatesFrequently) } }
        .alert("Unable to complete request", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK") { model.error = nil }
        } message: { Text(model.error ?? "") }
        .onChange(of: phase) { _, value in
            if value == .active && model.profile != nil { model.refreshNextAction(); Task { await model.refresh(); await moments.refresh() } }
            else if value != .active { model.invalidateNextAction() }
        }
    }

    private var authenticatedTabs: some View {
        NexdoTabShell(selection: $selectedTab)
    }
}

private enum NexdoTab: String, CaseIterable, Identifiable {
    case today, tasks, askAI, calendar
    var id: String { rawValue }
    var title: String { switch self { case .today: "Today"; case .tasks: "Tasks"; case .askAI: "Ask AI"; case .calendar: "Calendar" } }
    var icon: String { switch self { case .today: "sun.max"; case .tasks: "checkmark.circle"; case .askAI: "sparkles"; case .calendar: "calendar" } }
}

private struct NexdoTabShell: View {
    @Binding var selection: NexdoTab
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @EnvironmentObject private var model: AppModel
    @State private var showingAsk = false
    @State private var askPrompt = ""
    private var activeTab: NexdoTab { showingAsk ? .askAI : selection }

    var body: some View {
        // Give navigation screens a physically smaller viewport. An outer
        // safeAreaInset is not reliably retained by pushed destinations.
        VStack(spacing: 0) {
        ZStack {
            Group {
                switch selection {
                case .today:
                    TodayView(onAsk: { askPrompt = ""; showingAsk = true }, onCalendar: { selection = .calendar }, onPlanWeek: { askPrompt = $0; showingAsk = true })
                case .tasks: TasksView()
                case .askAI: TodayView(onAsk: { askPrompt = ""; showingAsk = true }, onCalendar: { selection = .calendar }, onPlanWeek: { askPrompt = $0; showingAsk = true })
                case .calendar: CalendarView()
                }
            }
            .id(selection)
            .transition(.opacity.combined(with: .scale(scale: 0.985)))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .blur(radius: showingAsk ? 2 : 0)
        .fullScreenCover(isPresented: $showingAsk) {
            AskNexdoView(initialPrompt: askPrompt)
                .presentationDetents([.fraction(0.84)])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(28)
                .presentationBackgroundInteraction(.disabled)
        }
        .animation(reduceMotion ? nil : .snappy(duration: 0.28), value: selection)
            VStack(spacing: 0) {
                FocusSessionStrip()
                HStack(spacing: 4) {
                    ForEach(NexdoTab.allCases) { tab in
                        Button { if tab == .askAI { showingAsk = true } else {
                            if tab == .tasks && selection != .tasks { model.taskQuery.date = .today }
                            selection = tab
                        } } label: {
                            VStack(spacing: 4) {
                                Image(systemName: tab.icon)
                                    .font(.system(size: 19, weight: activeTab == tab ? .semibold : .regular))
                                Text(tab.title).font(.caption2.weight(activeTab == tab ? .semibold : .regular))
                            }
                            .foregroundStyle(activeTab == tab ? Color.nexdoIndigo : Color.nexdoSecondary)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(activeTab == tab ? Color.nexdoIndigo.opacity(0.10) : .clear, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(tab.title)
                        .accessibilityAddTraits(activeTab == tab ? .isSelected : [])
                    }
                }
                .padding(.horizontal, 8)
                .padding(.top, 6)
                .background(.ultraThinMaterial)
                .overlay(alignment: .top) { Divider().opacity(0.45) }
            }
            .fixedSize(horizontal: false, vertical: true)
            .background { Color(uiColor: .systemBackground).ignoresSafeArea(edges: .bottom) }
        }
    }
}

#if DEBUG
private struct WeeklySummaryPreview: View {
    @StateObject private var model = WeeklySummaryPreviewProtocol.model()
    @State private var selection: NexdoTab = .today
    var body: some View { NexdoTabShell(selection: $selection).environmentObject(model) }
}

private struct ProjectsDesignPreview: View {
    @StateObject private var model = ProjectsPreviewProtocol.model()
    @State private var selection: NexdoTab = .tasks
    var body: some View { NexdoTabShell(selection: $selection).environmentObject(model) }
}

private struct CalendarDesignPreview: View {
    @StateObject private var model = AppModel()
    var body: some View {
        NexdoTabShell(selection: .constant(.calendar))
            .environmentObject(model)
            .onAppear {
                model.profile = Profile(id: "calendar-preview", name: "Preview", email: "preview@example.com", timeZone: "America/Los_Angeles")
                model.tasks = [
                    NexdoTask(id: "review", title: "Review the project proposal", status: "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: "2026-09-07T15:00:00Z", dueAt: "2026-09-06T17:00:00Z"),
                    NexdoTask(id: "prepare", title: "Prepare meeting notes", status: "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: "2026-09-07T15:30:00Z", dueAt: "2026-09-06T18:00:00Z"),
                    NexdoTask(id: "walk", title: "Morning walk", status: "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: "2026-09-07T16:00:00Z", dueAt: nil)
                ]
                model.agenda = Agenda(timeZone: "America/Los_Angeles", range: .init(days: []), tasks: model.tasks, events: [], overdue: [])
            }
    }
}

private struct TodayDesignPreview: View {
    @StateObject private var model = AppModel()
    @State private var loaded = false

    var body: some View {
        NexdoTabShell(selection: .constant(.today))
            .environmentObject(model)
            .onAppear {
                guard !loaded else { return }
                loaded = true
                let tasks = [
                    NexdoTask(id: "pickup", title: "CALLED: GROCERY PICK UP", status: "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: "2026-09-07T15:00:00Z", dueAt: nil),
                    NexdoTask(id: "hair", title: "Hair Cuttery", status: "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: "2026-09-07T15:30:00Z", dueAt: nil),
                    NexdoTask(id: "gym", title: "Gym", status: "PLANNED", priority: "HIGH", durationMin: 45, notes: nil, startAt: "2026-09-07T16:00:00Z", dueAt: nil)
                ]
                model.profile = Profile(id: "preview", name: "Rohit Kumar", email: "preview@example.com", timeZone: "America/Los_Angeles")
                model.tasks = tasks
                if ProcessInfo.processInfo.arguments.contains("-ask-response-preview") {
                    model.lastAssistantPrompt = "Nexdo, brief me for the next 5 days."
                    let response = #"{"spoken":"Your five-day briefing is ready.","visual":{"summary":"Your 5-day plan is ready. Today: 0 Calendar appointments and 3 tasks. Tomorrow: 0 Calendar appointments and 0 tasks.","sections":[{"title":"At a glance","items":["Today: 0 Calendar appointments and 3 tasks.","Tomorrow: 0 Calendar appointments and 0 tasks.","Next 5 days: 0 Calendar appointments and 3 open tasks."]},{"title":"Deadlines & schedule","items":["Upcoming deadlines: none in this period.","Schedule conflicts: no calendar conflicts."]},{"title":"Top 3 focus items","items":["1. Gym — high priority","2. CALLED: GROCERY PICK UP","3. Hair Cuttery"]},{"title":"Overdue","items":["Gym"]}]}}"#
                    model.turn = try? JSONDecoder().decode(AssistantTurn.self, from: Data(response.utf8))
                }
                model.agenda = Agenda(timeZone: "America/Los_Angeles", range: .init(days: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]), tasks: tasks, events: [], overdue: [tasks[2]])
            }
    }
}

private struct TaskDesignPreview: View {
    @StateObject private var model = ProjectsPreviewProtocol.model()
    @State private var loaded = false
    @State private var selectedTab: NexdoTab = .tasks

    var body: some View {
        Group {
            if ProcessInfo.processInfo.arguments.contains("-voice-task-design-preview") {
                AddTaskByVoiceView()
            } else if ProcessInfo.processInfo.arguments.contains("-task-editor-preview") {
                NavigationStack { TaskEditor(task: nil) }
            } else {
                NexdoTabShell(selection: $selectedTab)
            }
        }
            .environmentObject(model)
            .onAppear {
                guard !loaded else { return }
                loaded = true
                model.profile = Profile(id: "preview", name: "Sri", email: "sri@example.com", timeZone: "America/Los_Angeles")
                var calendar = Calendar(identifier: .gregorian)
                calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
                let today = calendar.startOfDay(for: Date())
                func scheduled(_ day: Int, _ hour: Int) -> String {
                    let date = calendar.date(byAdding: .day, value: day, to: today)!
                    return ISO8601DateFormatter().string(from: calendar.date(bySettingHour: hour, minute: 0, second: 0, of: date)!)
                }
                model.tasks = [
                    NexdoTask(id: "proposal", title: "Finish the launch proposal", status: "PLANNED", priority: "CRITICAL", durationMin: 45, notes: "Share the final draft with the launch team.", startAt: scheduled(0, 11), dueAt: scheduled(0, 23)),
                    NexdoTask(id: "notes", title: "Review product launch notes", status: "PLANNED", priority: "HIGH", durationMin: 30, notes: "Confirm open questions before the afternoon review.", startAt: nil, dueAt: scheduled(0, 15)),
                    NexdoTask(id: "followup", title: "Send client follow-up", status: "PLANNED", priority: "MEDIUM", durationMin: 15, notes: "Include the revised timeline.", startAt: nil, dueAt: nil),
                    NexdoTask(id: "briefing", title: "Prepare tomorrow’s executive briefing", status: "PLANNED", priority: "LOW", durationMin: 60, notes: "Summarize progress, risks, and decisions.", startAt: scheduled(1, 14), dueAt: nil),
                    NexdoTask(id: "done", title: "Confirm design review", status: "COMPLETED", priority: "MEDIUM", durationMin: 15, notes: nil, startAt: nil, dueAt: nil)
                ]
                if ProcessInfo.processInfo.arguments.contains("-task-scroll-preview") {
                    model.tasks = (-13...6).flatMap { day in
                        (0..<5).map { index in
                            NexdoTask(id: "scroll-\(day)-\(index)", title: "Day \(day) task \(index): Review the upcoming appointment and prepare the required documents", status: index == 4 ? "COMPLETED" : "PLANNED", priority: "NORMAL", durationMin: 30, notes: nil, startAt: scheduled(day, 9 + index), dueAt: nil)
                        }
                    }
                    model.taskQuery.status = "All"
                }
            }
    }
}
#endif

private struct SignInView: View {
    @EnvironmentObject var model: AppModel
    @State private var email = ""
    @State private var password = ""
    @State private var showsPassword = false
    @State private var showsSignUp = false
    @State private var showsPasswordReset = false
    @State private var appleNonce = ""
    @FocusState private var focusedField: Field?

    private enum Field { case email, password }

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground).ignoresSafeArea()
            SignInBackdrop()

            ScrollView {
                VStack(spacing: 0) {
                    Spacer(minLength: 42)

                    NexdoLogoMark()
                        .frame(width: 116, height: 84)
                        .accessibilityHidden(true)

                    Text("Welcome back, Sri")
                        .font(.system(size: 42, weight: .bold, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [.nexdoBlue, .nexdoIndigo, .nexdoMagenta],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.78)
                        .shadow(color: Color.nexdoIndigo.opacity(0.20), radius: 12, y: 4)
                        .padding(.top, 22)

                    Text("Your AI assistant for a smarter, more organized day.")
                        .font(.title3)
                        .foregroundStyle(Color.nexdoSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 8)

                    VStack(spacing: 0) {
                        HStack(spacing: 14) {
                            SignInFieldIcon(systemName: "envelope")
                            TextField("Email address", text: $email)
                                .textContentType(.username)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .submitLabel(.next)
                                .focused($focusedField, equals: .email)
                                .onSubmit { focusedField = .password }
                                .accessibilityLabel("Email address")
                        }
                        .padding(.horizontal, 20)
                        .frame(minHeight: 72)

                        Divider().padding(.leading, 78)

                        HStack(spacing: 14) {
                            SignInFieldIcon(systemName: "lock")
                            Group {
                                if showsPassword {
                                    TextField("Password", text: $password)
                                } else {
                                    SecureField("Password", text: $password)
                                }
                            }
                            .textContentType(.password)
                            .submitLabel(.go)
                            .focused($focusedField, equals: .password)
                            .onSubmit { signIn() }
                            .accessibilityLabel("Password")

                            Button { showsPassword.toggle() } label: {
                                Image(systemName: showsPassword ? "eye.slash" : "eye")
                                    .font(.title3)
                                    .foregroundStyle(Color.nexdoSecondary)
                                    .frame(width: 44, height: 44)
                            }
                            .accessibilityLabel(showsPassword ? "Hide password" : "Show password")
                        }
                        .padding(.horizontal, 20)
                        .frame(minHeight: 72)

                        Divider().padding(.leading, 78)

                        Button("Forgot password?") {
                            showsPasswordReset = true
                        }
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.horizontal, 22)
                        .frame(minHeight: 54)
                    }
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Color.white.opacity(0.8)))
                    .shadow(color: Color.purple.opacity(0.09), radius: 25, y: 12)
                    .padding(.horizontal, 28)
                    .padding(.top, 42)

                    Button { signIn() } label: {
                        Text(model.busy ? "Signing In…" : "Sign In")
                            .font(.title3.bold())
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 62)
                            .background(
                                LinearGradient(
                                    colors: [.nexdoMagenta, .nexdoIndigo, .nexdoBlue],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                ),
                                in: RoundedRectangle(cornerRadius: 20, style: .continuous)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSignIn)
                    .opacity(canSignIn ? 1 : 0.55)
                    .padding(.horizontal, 28)
                    .padding(.top, 22)

                    HStack(spacing: 12) {
                        Rectangle().frame(height: 1).foregroundStyle(Color.nexdoSecondary.opacity(0.25))
                        Text("OR").font(.subheadline.weight(.semibold)).foregroundStyle(Color.nexdoSecondary)
                        Rectangle().frame(height: 1).foregroundStyle(Color.nexdoSecondary.opacity(0.25))
                    }
                    .padding(.horizontal, 36)
                    .padding(.vertical, 22)

                    SignInWithAppleButton(.continue) { request in
                        appleNonce = UUID().uuidString
                        request.requestedScopes = [.fullName, .email]
                        request.nonce = Self.sha256(appleNonce)
                    } onCompletion: { result in
                        handleApple(result)
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(maxWidth: .infinity, minHeight: 58)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .disabled(model.busy)
                    .padding(.horizontal, 28)

                    HStack(spacing: 5) {
                        Text("New to Nexdo?")
                        Button("Create account") {
                            showsSignUp = true
                        }
                    }
                    .font(.subheadline)
                    .padding(.top, 24)

                    Label("Your password stays on this device only for this sign-in.", systemImage: "checkmark.shield")
                        .font(.footnote)
                        .foregroundStyle(Color.nexdoSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.top, 18)
                        .padding(.bottom, 34)
                }
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .sheet(isPresented: $showsSignUp) { SignUpView() }
        .sheet(isPresented: $showsPasswordReset) { PasswordResetView(initialEmail: email) }
        .sheet(item: $verification) { pending in
            NavigationStack { EmailVerificationView(pending: pending, showsCancel: true) }
                .presentationDetents([.large])
        }
    }

    @State private var verification: PendingEmailVerification?

    private var canSignIn: Bool {
        !model.busy && email.contains("@") && !password.isEmpty
    }

    private func signIn() {
        guard canSignIn else { return }
        focusedField = nil
        let submittedPassword = password
        password = ""
        Task { if let pending = await model.login(email: email, password: submittedPassword) { verification = pending } }
    }

    private static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let codeData = credential.authorizationCode,
                  let code = String(data: codeData, encoding: .utf8), !appleNonce.isEmpty else {
                model.error = "Apple did not return a complete authorization. Please try again."
                return
            }
            let components = credential.fullName
            let givenName = components?.givenName
            let familyName = components?.familyName
            Task { await model.loginWithApple(authorizationCode: code, rawNonce: appleNonce, givenName: givenName, familyName: familyName) }
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled { model.error = "Apple sign-in was not completed. Please try again." }
        }
    }
}

private struct SignUpView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmation = ""
    @State private var localError: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color(uiColor: .systemBackground).ignoresSafeArea()
                SignInBackdrop()

                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Create your account")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.nexdoInk)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("Make your day easier with an AI-powered to-do app that turns a busy mind into a clear plan.")
                            .font(.body)
                            .foregroundStyle(Color.nexdoSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 8)

                        VStack(spacing: 0) {
                            HStack(spacing: 14) {
                                SignInFieldIcon(systemName: "person")
                                TextField("Full name", text: $name).textContentType(.name).accessibilityLabel("Full name")
                            }.padding(.horizontal, 18).frame(minHeight: 68)
                            Divider().padding(.leading, 78)
                            HStack(spacing: 14) {
                                SignInFieldIcon(systemName: "envelope")
                                TextField("Email address", text: $email)
                                    .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityLabel("Email address")
                            }.padding(.horizontal, 18).frame(minHeight: 68)
                            Divider().padding(.leading, 78)
                            HStack(spacing: 14) {
                                SignInFieldIcon(systemName: "lock")
                                RevealablePasswordField(title: "Password", text: $password)
                            }.padding(.horizontal, 18).frame(minHeight: 68)
                            Divider().padding(.leading, 78)
                            HStack(spacing: 14) {
                                SignInFieldIcon(systemName: "checkmark.shield")
                                RevealablePasswordField(title: "Confirm password", text: $confirmation)
                            }.padding(.horizontal, 18).frame(minHeight: 68)
                        }
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.white.opacity(0.8)))
                        .shadow(color: Color.purple.opacity(0.09), radius: 25, y: 12)
                        .padding(.top, 28)

                        Text("Use at least 12 characters. Your password is sent securely to Nexdo and stored only as a one-way hash.")
                            .font(.footnote)
                            .foregroundStyle(Color.nexdoSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12)
                        if let localError {
                            Text(localError).font(.footnote).foregroundStyle(.red).padding(.top, 8)
                        }
                        Button { create() } label: {
                            Text(model.busy ? "Creating Account…" : "Create Account")
                                .font(.title3.bold()).foregroundStyle(.white)
                                .frame(maxWidth: .infinity, minHeight: 60)
                                .background(LinearGradient(colors: [.nexdoMagenta, .nexdoIndigo, .nexdoBlue], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(!canCreate)
                        .opacity(canCreate ? 1 : 0.55)
                        .padding(.top, 20)
                        Text("Nexdo captures tasks in your own words, finds the right next step, and helps you protect time for what matters.")
                            .font(.footnote).foregroundStyle(Color.nexdoSecondary).multilineTextAlignment(.leading).padding(.top, 18)
                    }
                    .padding(.horizontal, 28).padding(.vertical, 28).frame(maxWidth: 560)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Create your account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closeSignUp() } } }
            .navigationDestination(item: $verification) { pending in EmailVerificationView(pending: pending) }
        }
        .onChange(of: model.profile?.id) { _, id in if id != nil { dismiss() } }
        .presentationDetents([.large])
    }
    @State private var verification: PendingEmailVerification?
    private var canCreate: Bool {
        !model.busy && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && email.contains("@") && password.count >= 12 && confirmation.count >= 12
    }
    private func closeSignUp() {
        dismiss()
    }

    private func create() {
        guard password == confirmation else { localError = "The passwords do not match."; return }
        localError = nil
        Task { if let pending = await model.register(name: name, email: email, password: password) { verification = pending } }
    }
}

private struct PasswordResetView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var email: String
    @State private var code = ""
    @State private var password = ""
    @State private var confirmation = ""
    @State private var codeSent = false
    @State private var complete = false
    @State private var localError: String?

    init(initialEmail: String) { _email = State(initialValue: initialEmail) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email address", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                } footer: { Text("We’ll email a six-digit code if an account exists. Codes expire after 15 minutes.") }
                if codeSent {
                    Section("Verification") {
                        TextField("6-digit code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                            .onChange(of: code) { _, value in
                                let digits = VerificationCode.sanitized(value)
                                if digits != value { code = digits }
                            }
                        RevealablePasswordField(title: "New password", text: $password)
                        RevealablePasswordField(title: "Confirm new password", text: $confirmation)
                    }
                }
                if let localError { Section { Text(localError).foregroundStyle(.red) } }
                Section {
                    if codeSent {
                        Button(model.busy ? "Updating…" : "Update Password") { confirm() }
                            .disabled(model.busy || code.count != 6 || password.count < 12)
                        Button("Send a new code") { requestCode() }.disabled(model.busy)
                    } else {
                        Button(model.busy ? "Sending…" : "Send Verification Code") { requestCode() }
                            .disabled(model.busy || !email.contains("@"))
                    }
                }
            }
            .navigationTitle("Reset password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { closePasswordReset() } } }
            .alert("Password updated", isPresented: $complete) {
                Button("Sign In") { closePasswordReset() }
            } message: { Text("You can now sign in with your new password.") }
        }
        .presentationDetents([.large])
    }
    private func closePasswordReset() {
        dismiss()
    }

    private func requestCode() {
        localError = nil
        Task { if await model.requestPasswordReset(email: email) { codeSent = true } }
    }

    private func confirm() {
        guard password == confirmation else { localError = "The passwords do not match."; return }
        localError = nil
        Task { if await model.confirmPasswordReset(email: email, code: code, password: password) { complete = true } }
    }
}

private struct RevealablePasswordField: View {
    let title: String
    @Binding var text: String
    @State private var visible = false

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if visible {
                    TextField(title, text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } else {
                    SecureField(title, text: $text)
                }
            }
            .textContentType(.newPassword)
            .accessibilityLabel(title)

            Button { visible.toggle() } label: {
                Image(systemName: visible ? "eye.slash" : "eye")
                    .font(.title3)
                    .foregroundStyle(Color.nexdoSecondary)
                    .frame(width: 44, height: 44)
            }
            // Borderless keeps the toggle from activating the whole row inside a Form.
            .buttonStyle(.borderless)
            .accessibilityLabel(visible ? "Hide password" : "Show password")
        }
    }
}

private struct EmailVerificationView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let pending: PendingEmailVerification
    let showsCancel: Bool
    @State private var code = ""
    @State private var working = false
    @State private var message: String?
    @State private var errorMessage: String?
    @State private var resendAvailableAt: Date?
    @FocusState private var codeFocused: Bool

    private static let resendCooldown: TimeInterval = 60

    init(pending: PendingEmailVerification, showsCancel: Bool = false) {
        self.pending = pending
        self.showsCancel = showsCancel
        switch pending.reason {
        case .codeSent:
            _message = State(initialValue: "We sent a six-digit code to \(pending.email). It expires in 24 hours.")
        case .codeNotSent:
            _errorMessage = State(initialValue: "We couldn’t send your verification code. Send a new code to try again.")
        case .signInRequiresVerification:
            _message = State(initialValue: "Verify your email to sign in. Send a new code if you don’t have one from the last 24 hours.")
        }
    }

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground).ignoresSafeArea()
            SignInBackdrop()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    SignInFieldIcon(systemName: "envelope.badge")
                    Text("Verify your email")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.nexdoInk)
                        .padding(.top, 18)
                    Text("Enter the six-digit code we emailed to \(pending.email).")
                        .font(.body)
                        .foregroundStyle(Color.nexdoSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)

                    HStack(spacing: 14) {
                        SignInFieldIcon(systemName: "number")
                        TextField("6-digit code", text: $code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .font(.title2.monospacedDigit().weight(.semibold))
                            .focused($codeFocused)
                            .onChange(of: code) { _, value in
                                let digits = VerificationCode.sanitized(value)
                                if digits != value { code = digits }
                            }
                            .accessibilityLabel("Verification code")
                    }
                    .padding(.horizontal, 18)
                    .frame(minHeight: 72)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.white.opacity(0.8)))
                    .shadow(color: Color.purple.opacity(0.09), radius: 25, y: 12)
                    .padding(.top, 28)

                    if let message {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(Color.nexdoSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12)
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 8)
                    }

                    Button { verify() } label: {
                        Text(working ? "Verifying…" : "Verify Email")
                            .font(.title3.bold()).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 60)
                            .background(LinearGradient(colors: [.nexdoMagenta, .nexdoIndigo, .nexdoBlue], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(!canVerify)
                    .opacity(canVerify ? 1 : 0.55)
                    .padding(.top, 20)

                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let wait = secondsUntilResend(at: context.date)
                        Button(wait > 0 ? "Send a new code in \(wait)s" : "Send a new code") { resend() }
                            .font(.subheadline.weight(.semibold))
                            .disabled(working || wait > 0)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .padding(.top, 12)
                }
                .padding(.horizontal, 28).padding(.vertical, 28).frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationTitle("Verify email")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if showsCancel {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .onAppear { codeFocused = true }
    }

    private var canVerify: Bool { !working && VerificationCode.isComplete(code) }

    private func secondsUntilResend(at date: Date) -> Int {
        guard let resendAvailableAt else { return 0 }
        return max(0, Int(resendAvailableAt.timeIntervalSince(date).rounded(.up)))
    }

    private func verify() {
        guard canVerify else { return }
        working = true; errorMessage = nil; message = nil; codeFocused = false
        Task {
            defer { working = false }
            do { try await model.verifyEmail(email: pending.email, code: code) }
            catch { errorMessage = error.localizedDescription; codeFocused = true }
        }
    }

    private func resend() {
        guard !working else { return }
        working = true; errorMessage = nil; message = nil
        Task {
            defer { working = false }
            do {
                message = try await model.resendVerificationCode(email: pending.email)
                resendAvailableAt = Date().addingTimeInterval(Self.resendCooldown)
                code = ""
                codeFocused = true
            } catch { errorMessage = error.localizedDescription }
        }
    }
}

private struct SignInFieldIcon: View {
    let systemName: String
    var body: some View {
        Image(systemName: systemName)
            .font(.title3.weight(.medium))
            .foregroundStyle(Color.nexdoIndigo)
            .frame(width: 46, height: 46)
            .background(Color.nexdoIndigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityHidden(true)
    }
}

private struct SignInBackdrop: View {
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [.nexdoBlue.opacity(0.22), .nexdoIndigo.opacity(0.08)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: min(geometry.size.width * 0.75, 380))
                    .blur(radius: 1)
                    .offset(x: -geometry.size.width * 0.38, y: -geometry.size.height * 0.42)
                Circle()
                    .fill(LinearGradient(colors: [.nexdoMagenta.opacity(0.14), .white.opacity(0.02)], startPoint: .topTrailing, endPoint: .bottomLeading))
                    .frame(width: min(geometry.size.width * 0.5, 260))
                    .offset(x: geometry.size.width * 0.48, y: -geometry.size.height * 0.28)
                Circle()
                    .fill(LinearGradient(colors: [.nexdoIndigo.opacity(0.16), .nexdoBlue.opacity(0.12)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: min(geometry.size.width * 0.72, 360))
                    .offset(x: geometry.size.width * 0.38, y: geometry.size.height * 0.48)
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

struct NexdoLogoMark: View {
    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let stroke = width * 0.23
            ZStack {
                Capsule()
                    .fill(LinearGradient(colors: [.nexdoBlue, .nexdoIndigo], startPoint: .bottomLeading, endPoint: .topTrailing))
                    .frame(width: stroke, height: width * 0.72)
                    .rotationEffect(.degrees(20))
                    .offset(x: -width * 0.25)
                Capsule()
                    .fill(LinearGradient(colors: [.nexdoIndigo, .nexdoPurple], startPoint: .top, endPoint: .bottom))
                    .frame(width: stroke, height: width * 0.72)
                    .rotationEffect(.degrees(-27))
                    .offset(x: width * 0.01, y: width * 0.05)
                Capsule()
                    .fill(LinearGradient(colors: [.nexdoPurple, .nexdoMagenta], startPoint: .bottom, endPoint: .top))
                    .frame(width: stroke, height: width * 0.72)
                    .rotationEffect(.degrees(17))
                    .offset(x: width * 0.26)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

extension Color {
    static let nexdoInk = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? .label : UIColor(red: 0.03, green: 0.06, blue: 0.18, alpha: 1) })
    static let nexdoSecondary = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? .secondaryLabel : UIColor(red: 0.34, green: 0.36, blue: 0.50, alpha: 1) })
    static let nexdoScheduleBlue = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.48, green: 0.73, blue: 1, alpha: 1) : UIColor(red: 0.15, green: 0.34, blue: 0.56, alpha: 1) })
    static let nexdoBlue = Color(red: 0.02, green: 0.58, blue: 0.96)
    static let nexdoIndigo = Color(red: 0.24, green: 0.16, blue: 0.94)
    static let nexdoPurple = Color(red: 0.52, green: 0.08, blue: 0.96)
    static let nexdoMagenta = Color(red: 0.94, green: 0.08, blue: 0.78)
}

private enum TodayRange: Int, CaseIterable, Identifiable {
    case today = 1, threeDays = 3, fiveDays = 5
    var id: Int { rawValue }
    var title: String { switch self { case .today: "Today"; case .threeDays: "3 days"; case .fiveDays: "5 days" } }
}

private struct TodayScheduleItem: Identifiable {
    let id: String
    let sourceId: String
    let title: String
    let dateValue: String
    let timeLabel: String
    let detail: String
    let task: NexdoTask?
    let isPast: Bool
}

private struct TodayView: View {
    @EnvironmentObject private var moments: ImportantMomentsStore
    @EnvironmentObject private var model: AppModel
    @ObservedObject private var actionCoordinator = TaskActionCoordinator.shared
    let onAsk: () -> Void
    let onCalendar: () -> Void
    let onPlanWeek: (String) -> Void
    @State private var range: TodayRange = .today
    @State private var adding = false
    @State private var showingAccount = false
    @State private var editing: NexdoTask?
    @State private var showingWeeklySummary = false
    @State private var showingOverdueTasks = false
    @State private var showingAttention = false
    @State private var showingDoNow = false
    @State private var selectedScheduleCheck: ScheduleIntelligenceResponse.Today.AttentionItem?

    private var timeZone: String { model.agenda?.timeZone ?? model.profile?.timeZone ?? TimeZone.current.identifier }
    private var selectedDays: Set<String> { Set(model.agenda?.range.days.prefix(range.rawValue) ?? []) }

    private func taskDetail(_ task: NexdoTask, deadlineOnly: Bool) -> String {
        if task.priority == "CRITICAL" || task.critical == true { return "Critical task" }
        return deadlineOnly ? "Task deadline" : "Planned task"
    }

    private func scheduleOrder(_ lhs: TodayScheduleItem, _ rhs: TodayScheduleItem) -> Bool {
        let lhsCritical = lhs.task?.priority == "CRITICAL" || lhs.task?.critical == true
        let rhsCritical = rhs.task?.priority == "CRITICAL" || rhs.task?.critical == true
        if lhsCritical != rhsCritical { return lhsCritical }
        return (ServerDate.parse(lhs.dateValue) ?? .distantFuture) < (ServerDate.parse(rhs.dateValue) ?? .distantFuture)
    }

    private var schedule: [TodayScheduleItem] {
        guard let agenda = model.agenda else { return [] }
        if range == .today, let snapshot = model.scheduleIntelligence?.today {
            return snapshot.timeline.map { item in
                let task = item.kind == "task" ? (model.tasks.first(where: { $0.id == item.sourceId }) ?? agenda.tasks.first(where: { $0.id == item.sourceId })) : nil
                return TodayScheduleItem(
                    id: item.id,
                    sourceId: item.sourceId,
                    title: item.title,
                    dateValue: item.startAt,
                    timeLabel: item.allDay ? "All day" : (item.deadlineOnly ? "Due \(ServerDate.time(item.startAt, timeZone: snapshot.timeZone))" : ServerDate.time(item.startAt, timeZone: snapshot.timeZone)),
                    detail: task.map { taskDetail($0, deadlineOnly: item.deadlineOnly) } ?? "Calendar appointment",
                    task: task,
                    isPast: item.past
                )
            }
        }

        let eventItems = agenda.events.filter { event in
            selectedDays.contains { ServerDate.occurs(event, on: $0, timeZone: agenda.timeZone) }
        }.map { event in
            TodayScheduleItem(id: "event:\(event.id)", sourceId: event.id, title: event.title, dateValue: event.startAt,
                              timeLabel: event.allDay == true ? "All day" : ServerDate.time(event.startAt, timeZone: agenda.timeZone),
                              detail: "Calendar appointment", task: nil,
                              isPast: (ServerDate.parse(event.endAt) ?? .distantFuture) < Date())
        }
        let taskItems = agenda.tasks.filter { task in
            guard !task.isDone, task.status != "CANCELLED", let date = task.startAt ?? task.dueAt else { return false }
            let zone = task.timeZone ?? agenda.timeZone
            return selectedDays.contains(ServerDate.day(date, timeZone: zone) ?? "")
        }.map { task in
            let value = task.startAt ?? task.dueAt!
            let zone = task.timeZone ?? agenda.timeZone
            return TodayScheduleItem(id: "task:\(task.id)", sourceId: task.id, title: task.title, dateValue: value,
                                     timeLabel: task.startAt == nil ? "Due \(ServerDate.time(value, timeZone: zone))" : ServerDate.time(value, timeZone: zone),
                                     detail: taskDetail(task, deadlineOnly: task.startAt == nil), task: task, isPast: false)
        }
        return (eventItems + taskItems).sorted(by: scheduleOrder)
    }

    private var counts: (appointments: Int, tasks: Int) {
        let events = schedule.filter { $0.task == nil }.count
        return (events, schedule.count - events)
    }

    private func remainingSchedule(_ queue: TodayActionQueue) -> [TodayScheduleItem] {
        guard range == .today else { return schedule }
        var result = schedule.filter { item in item.task.map { !$0.isDone && $0.status != "CANCELLED" && !queue.reservedTaskIDs.contains($0.id) } ?? true }
        for action in queue.laterActions {
            guard let task = model.tasks.first(where: { $0.id == action.taskId }), let date = action.notificationDate else { continue }
            let value = ISO8601DateFormatter().string(from: date)
            result.append(TodayScheduleItem(id: "task:\(task.id)", sourceId: task.id, title: task.title, dateValue: value,
                timeLabel: ServerDate.time(value, timeZone: timeZone), detail: "Nexdo Action", task: task, isPast: false))
        }
        var seen = Set<String>()
        return result.sorted(by: scheduleOrder).filter { seen.insert($0.task.map { "task:\($0.id)" } ?? $0.id).inserted }
    }

    private var greeting: String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
        switch calendar.component(.hour, from: Date()) {
        case 0..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        default: return "Good evening"
        }
    }

    private var dateLabel: String {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: timeZone)
        formatter.dateFormat = "EEE, MMM d, yyyy"
        return formatter.string(from: Date())
    }

    var body: some View {
        NavigationStack {
            ZStack {
                TodayBackdrop()
                TimelineView(.periodic(from: .now, by: 60)) { context in
                let queue = TodayActionQueue(actions: range == .today ? actionCoordinator.actions : [], tasks: model.tasks,
                    now: context.date, timeZone: TimeZone(identifier: timeZone) ?? .current)
                ScrollView {
                    LazyVStack(spacing: 16) {
                        TodayTopBar(
                            name: model.profile?.name ?? "",
                            temperature: model.weather.map { Int($0.current.temperature.rounded()) },
                            add: { adding = true },
                            account: { showingAccount = true }
                        )

                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(greeting), \(ProfileName.firstName(from: model.profile?.name ?? "") ?? "there")")
                                .font(.system(.title, design: .rounded, weight: .bold))
                                .foregroundStyle(Color.nexdoInk)
                                .minimumScaleFactor(0.78)
                                .lineLimit(1)
                            Text(dateLabel)
                                .font(.body)
                                .foregroundStyle(Color.nexdoSecondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        HStack(spacing: 0) {
                            ForEach(TodayRange.allCases) { option in
                                Button { range = option } label: {
                                    Text(option.title)
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(range == option ? .white : Color.nexdoInk.opacity(0.82))
                                        .frame(maxWidth: .infinity, minHeight: 44)
                                        .background(range == option ? Color(red: 0.18, green: 0.38, blue: 0.62) : .clear)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Show \(option.title)")
                                .accessibilityAddTraits(range == option ? .isSelected : [])
                            }
                        }
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.nexdoIndigo.opacity(0.12)))

                        TodayQuickAccess(onPlanWeek: onPlanWeek) { showingWeeklySummary = true }

                        TodayIntelligenceCard(
                            range: range,
                            appointments: counts.appointments,
                            taskCount: counts.tasks,
                            momentCount: range == .today ? moments.today.count : 0,
                            availableMinutes: range == .today ? model.scheduleIntelligence?.today.availableMinutes : nil,
                            attentionCount: range == .today ? (model.scheduleIntelligence?.today.attention.count ?? model.agenda?.overdue.count ?? 0) : (model.agenda?.overdue.count ?? 0),
                            schedule: remainingSchedule(queue),
                            searchSchedule: schedule,
                            recommendation: range == .today ? model.scheduleIntelligence?.today.recommendation : nil,
                            actionRecommendation: queue.recommendation,
                            showsSummary: true,
                            onOpenTask: { editing = $0 },
                            onAttention: { showingAttention = true },
                            onAsk: { showingDoNow = true },
                            onCalendar: onCalendar
                        )

                        if range == .today {
                            TodayActionsView(queue: queue, now: context.date, onTask: { id in editing = model.tasks.first { $0.id == id } })
                        }

                        if range == .today, let proposal = model.protectedTime {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Make room for important work", systemImage: "lock.shield").font(.headline)
                                Text("You’ve postponed \(proposal.title) \(proposal.postponeCount) times.").font(.subheadline)
                                Text("Reserve \(proposal.durationMin) minutes at \(model.protectedTimeLabel(proposal))?")
                                Text("Nexdo will keep this block in place during replanning. You can still move it yourself.").font(.caption).foregroundStyle(.secondary)
                                HStack {
                                    Button("Reserve time") { Task { await model.respondToProtectedTime(proposal, accept: true) } }.buttonStyle(.borderedProminent)
                                    Button("Not now") { Task { await model.respondToProtectedTime(proposal, accept: false) } }
                                }.disabled(model.protectingTime)
                            }.padding(18).background(Color.nexdoIndigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 20))
                        }

                        if range == .today {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Label("Focus next", systemImage: "sparkles").font(.subheadline.bold()).foregroundStyle(Color.nexdoIndigo)
                                    Spacer()
                                    Menu {
                                        Button("Other options") { showingDoNow = true }
                                        Button("Dismiss suggestion") { model.dismissPersistentNext() }
                                    } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                                    .accessibilityLabel("Focus options")
                                }
                                if let recommendation = model.persistentNext?.recommendation,
                                   let best = recommendation.nextAction?.bestAction {
                                    Text(best.title).font(.headline).foregroundStyle(Color.nexdoInk).lineLimit(2)
                                    Text("\(best.focusMinutes) min\(recommendation.canStart ? " · Fits your free time" : "")")
                                        .font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                                    ViewThatFits(in: .horizontal) {
                                        HStack { focusStartButton; Spacer(); Button("Other options") { showingDoNow = true }.frame(minHeight: 44) }
                                        VStack(alignment: .leading) { focusStartButton; Button("Other options") { showingDoNow = true }.frame(minHeight: 44) }
                                    }
                                } else {
                                    Text("Find a task for the time you have.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                                    Button("Find my next task") { showingDoNow = true }.buttonStyle(.borderedProminent).frame(minHeight: 44)
                                }
                            }
                            .padding(.horizontal, 18).padding(.bottom, 16).padding(.top, 4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.nexdoIndigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 20))
                            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.nexdoIndigo.opacity(0.12)))
                            .accessibilityIdentifier("today-focus-next")

                            let overdueCount = OverdueTasks.results(model.tasks, now: context.date).count
                            let otherCount = model.scheduleIntelligence?.today.attention.filter { $0.id != "overdue" }.count ?? 0
                            if overdueCount + otherCount > 0 {
                                Button { showingAttention = true } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.title2)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text("Needs attention").font(.headline).foregroundStyle(Color.nexdoInk)
                                            Text(overdueCount > 0 ? "\(overdueCount) overdue task\(overdueCount == 1 ? "" : "s")\(otherCount > 0 ? " · \(otherCount) other" : "")" : "\(otherCount) schedule check\(otherCount == 1 ? "" : "s")")
                                                .font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                                        }
                                        Spacer(minLength: 4)
                                        Text("\(overdueCount + otherCount)").font(.subheadline.bold()).foregroundStyle(.brown)
                                            .padding(.horizontal, 10).padding(.vertical, 5).background(Color.orange.opacity(0.18), in: Capsule())
                                        Image(systemName: "chevron.right").foregroundStyle(Color.nexdoSecondary)
                                    }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
                                        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
                                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.nexdoIndigo.opacity(0.12)))
                                        .contentShape(RoundedRectangle(cornerRadius: 20))
                                }.buttonStyle(.plain).accessibilityIdentifier("today-attention-summary")
                            }
                        }

                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 32)
                }
                .scrollIndicators(.hidden)
                .clipped()
                .refreshable { await model.refresh() }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $adding) { NavigationStack { TaskEditor(task: nil) } }
            .sheet(isPresented: $showingDoNow) { DoNowView().presentationDetents([.large]).presentationDragIndicator(.visible) }
            .sheet(isPresented: $showingAccount) { AccountView() }
            .sheet(item: $editing) { task in
                NavigationStack { TaskEditor(task: task) }
                    .presentationDetents([.large])
                    .presentationCornerRadius(30)
            }
            .sheet(isPresented: $showingAttention) {
                NavigationStack {
                    TodayAttentionSheet()
                }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
            }
            .navigationDestination(item: $selectedScheduleCheck) { item in
                scheduleCheckDetails(item)
            }
            .navigationDestination(isPresented: $showingOverdueTasks) {
                OverdueTasksView()
            }
            .navigationDestination(isPresented: $showingWeeklySummary) {
                WeeklySummaryView(onPlanNextWeek: onPlanWeek)
            }
        }
    }

    private var focusStartButton: some View {
        Button {
            guard let best = model.persistentNext?.recommendation?.nextAction?.bestAction else { return }
            Task {
                do { try await model.startRecommendedFocus(best); model.refreshNextAction() }
                catch { model.error = error.localizedDescription; model.refreshNextAction() }
            }
        } label: { Label("Start focus", systemImage: "play.fill").font(.subheadline.bold()).padding(.vertical, 5) }
        .buttonStyle(.borderedProminent)
        .disabled(model.persistentNext?.recommendation?.canStart != true || model.busy)
    }

    @ViewBuilder private var attentionDetails: some View {
        if range != .today || model.scheduleIntelligence == nil {
            OverdueTasksView()
        } else {
            List {
                let items = model.scheduleIntelligence?.today.attention ?? []
                if items.isEmpty {
                    ContentUnavailableView("Nothing needs attention", systemImage: "checkmark.circle")
                }
                ForEach(items.sorted { $0.id == "overdue" && $1.id != "overdue" }) { item in
                    if item.id == "overdue" {
                        NavigationLink { OverdueTasksView() } label: {
                            attentionCard(item, opensTasks: false)
                        }
                    } else if !(item.taskIds?.isEmpty ?? true) {
                        NavigationLink { scheduleCheckDetails(item) } label: {
                            attentionCard(item, opensTasks: false)
                        }
                    } else {
                        attentionCard(item, opensTasks: false)
                    }
                }
            }
            .navigationTitle("Needs your attention")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.visible, for: .navigationBar)
            .refreshable { await model.refresh(); await model.refreshScheduleIntelligence() }
        }
    }

    private func scheduleCheckDetails(_ item: ScheduleIntelligenceResponse.Today.AttentionItem) -> some View {
        let tasks = (item.taskIds ?? []).compactMap { id in model.tasks.first(where: { $0.id == id }) }
        return List {
            Section {
                Text(item.explanation)
                Text(item.recommendedAction).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
            }
            Section(item.requiredMinutes.flatMap { minutes in item.deadlineAt.map { "Tasks needing \(minutes) minutes by \(scheduleCheckDeadline($0))" } } ?? "Tasks in this schedule check") {
                if tasks.isEmpty {
                    Text("The affected tasks are no longer available.").foregroundStyle(Color.nexdoSecondary)
                }
                ForEach(tasks) { task in
                    NavigationLink { TaskEditor(task: task) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(task.title).font(.body.weight(.semibold))
                            Text("\(task.durationMin) minutes\(task.dueAt.map { " · due \(scheduleCheckDeadline($0))" } ?? "")")
                                .font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Schedule check")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func scheduleCheckDeadline(_ value: String) -> String {
        ServerDate.parse(value).map { $0.formatted(date: .omitted, time: .shortened) } ?? value
    }

    private func attentionCard(_ item: ScheduleIntelligenceResponse.Today.AttentionItem, opensTasks: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(item.label.uppercased()).font(.caption2.bold()).foregroundStyle(.red)
            HStack {
                Text(item.title).font(.headline).foregroundStyle(Color.nexdoInk)
                if opensTasks {
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Color.nexdoSecondary)
                }
            }
            Text(item.explanation).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
    }

}

struct TodayTopBar: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingWeather = false
    let name: String
    let temperature: Int?
    var showsWeather = true
    let add: (() -> Void)?
    let account: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 7) {
                NexdoLogoMark().frame(width: 40, height: 30)
                VStack(alignment: .leading, spacing: -2) {
                    HStack(spacing: 3) {
                        Text("Nexdo").font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(Color.nexdoInk)
                        Image(systemName: "sparkles").font(.system(size: 17.28)).foregroundStyle(Color.nexdoIndigo)
                    }
                    Text("GET MORE DONE WITH AI").font(.system(size: 8, weight: .bold)).tracking(0.35).foregroundStyle(Color.nexdoSecondary)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Nexdo")

            Spacer(minLength: 6)
            if showsWeather {
                Button { showingWeather = true } label: {
                    ZStack {
                        Circle().fill(NexdoTheme.gradient)
                        VStack(spacing: 1) {
                            Image(systemName: model.weather?.current.conditionSymbol ?? "thermometer.medium")
                                .font(.system(size: 12, weight: .semibold))
                            Text(temperature.map { "\($0)°" } ?? "–°")
                                .font(.system(size: 13, weight: .bold)).minimumScaleFactor(0.75)
                        }
                        .foregroundStyle(.white)
                    }
                    .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(temperature.map { "San Ramon weather, \($0) degrees Fahrenheit" } ?? "Weather temporarily unavailable")
                .accessibilityHint("Opens the five-day forecast")
            }
            if let add { TodayHeaderButton(icon: "plus", label: "Add a task", action: add) }

            Button(action: account) {
                ProfileAvatar(name: name, size: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open account for \(name)")
        }
        .frame(minHeight: 50)
        .sheet(isPresented: $showingWeather) {
            WeatherForecastView().presentationDetents([.large]).presentationDragIndicator(.visible)
        }
    }
}

struct TodayHeaderButton: View {
    let icon: String
    let label: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: icon).font(.title3.bold()).foregroundStyle(.white)
                .frame(width: 44, height: 44).background(NexdoTheme.gradient, in: Circle())
                .shadow(color: Color.nexdoIndigo.opacity(0.20), radius: 10, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

private struct TodayIntelligenceCard: View {
    let range: TodayRange
    let appointments: Int
    let taskCount: Int
    var momentCount: Int = 0
    let availableMinutes: Int?
    let attentionCount: Int
    let schedule: [TodayScheduleItem]
    let searchSchedule: [TodayScheduleItem]
    let recommendation: ScheduleIntelligenceResponse.Today.Recommendation?
    var actionRecommendation: String? = nil
    var showsSummary = true
    let onOpenTask: (NexdoTask) -> Void
    let onAttention: () -> Void
    let onAsk: () -> Void
    let onCalendar: () -> Void

    @State private var showingSearch = false
    @State private var searchText = ""
    @FocusState private var searchFocused: Bool
    private var searching: Bool { showingSearch && !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var visibleSchedule: [TodayScheduleItem] {
        guard searching else { return Array(schedule.prefix(7)) }
        let keywords = searchText.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        // searchSchedule already contains only the selected Today/3/5-day range.
        return searchSchedule.filter { item in
            guard let task = item.task else { return false }
            return keywords.allSatisfy { task.title.localizedStandardContains($0) || (task.notes?.localizedStandardContains($0) ?? false) }
        }
    }

    private var commitmentCount: Int { appointments + taskCount + momentCount }
    var body: some View {
        VStack(spacing: 0) {
            if showsSummary {
            VStack(alignment: .leading, spacing: 12) {
                Label(range == .today ? "Your day, in focus" : "Your next \(range.rawValue) days", systemImage: "sparkles")
                    .font(.subheadline.bold()).foregroundStyle(Color.nexdoIndigo)
                Text("\(commitmentCount) commitment\(commitmentCount == 1 ? "" : "s") \(range == .today ? "today" : "ahead")")
                    .font(.system(.title, design: .rounded, weight: .bold)).foregroundStyle(Color.nexdoInk)
                    .accessibilityHeading(.h2)
                Text("\(taskCount) Task\(taskCount == 1 ? "" : "s") · \(appointments) Appointment\(appointments == 1 ? "" : "s") · \(momentCount) Moment\(momentCount == 1 ? "" : "s")")
                    .font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    .lineLimit(1).minimumScaleFactor(0.7)
                HStack(spacing: 10) {
                    if attentionCount > 0 {
                        Button(action: onAttention) {
                            Label("\(attentionCount) thing\(attentionCount == 1 ? " needs" : "s need") attention", systemImage: "exclamationmark.circle")
                                .font(.caption.bold()).foregroundStyle(Color(red: 0.66, green: 0.18, blue: 0.12))
                                .padding(.horizontal, 10).padding(.vertical, 7)
                                .background(Color(red: 1, green: 0.88, blue: 0.82), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Shows the items that need your attention")
                    } else {
                        Label("Nothing needs attention", systemImage: "checkmark.circle")
                            .font(.caption.bold()).foregroundStyle(.green)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(LinearGradient(colors: [Color.nexdoBlue.opacity(0.08), Color.nexdoMagenta.opacity(0.09)], startPoint: .topLeading, endPoint: .bottomTrailing))
            }

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(showsSummary ? "On your schedule" : "Later Today").font(.headline).foregroundStyle(Color.nexdoInk)
                    Spacer()
                    Button {
                        showingSearch.toggle()
                        searchFocused = showingSearch
                        if !showingSearch { searchText = "" }
                    } label: {
                        Image(systemName: "magnifyingglass")
                            .font(.body.weight(.semibold)).foregroundStyle(Color.nexdoInk)
                            .frame(width: 36, height: 36)
                            .background(Color.primary.opacity(0.08), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(showingSearch ? "Close task search" : "Search tasks")
                    .accessibilityHint("Search tasks in the selected date range")
                    Button(action: onCalendar) { Label("View day", systemImage: "chevron.down").labelStyle(.titleAndIcon).font(.caption) }
                        .accessibilityLabel("Open Calendar")
                }
                .padding(.bottom, 10)

                if showingSearch {
                    HStack {
                        TextField("Search tasks by keywords", text: $searchText)
                            .focused($searchFocused).submitLabel(.search)
                            .autocorrectionDisabled()
                            .onSubmit { searchFocused = false }
                        if !searchText.isEmpty {
                            Button { searchText = "" } label: { Image(systemName: "xmark.circle.fill") }
                                .accessibilityLabel("Clear task search")
                        }
                    }
                    .padding(10).background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                    .padding(.bottom, 12)
                }

                if visibleSchedule.isEmpty {
                    VStack(spacing: 9) {
                        Image(systemName: "calendar.badge.checkmark").font(.title2).foregroundStyle(Color.nexdoIndigo)
                        Text(searching ? "No matching tasks" : "Your schedule is clear").font(.headline).foregroundStyle(Color.nexdoInk)
                        Text(searching ? "Try different keywords or select a wider date range." : "Add a task or enjoy the open space.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 28)
                    .accessibilityElement(children: .combine)
                } else {
                    ForEach(Array(visibleSchedule.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { Divider().opacity(0.55) }
                        if let task = item.task {
                            Button { onOpenTask(task) } label: { TodayScheduleRow(item: item) }.buttonStyle(.plain)
                        } else {
                            Button(action: onCalendar) { TodayScheduleRow(item: item) }.buttonStyle(.plain)
                        }
                    }
                    if !searching && schedule.count > 7 {
                        Button("View \(schedule.count - 7) more") { onCalendar() }
                            .font(.subheadline.weight(.semibold)).padding(.top, 12)
                    }
                }


            }
            .padding(18)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.nexdoIndigo.opacity(0.11)))
        .shadow(color: Color.nexdoIndigo.opacity(0.09), radius: 24, y: 10)
        .accessibilityElement(children: .contain)
    }
}

private struct TodayScheduleRow: View {
    let item: TodayScheduleItem
    private var isCritical: Bool { item.task?.priority == "CRITICAL" || item.task?.critical == true }
    var body: some View {
        HStack(spacing: 12) {
            Text(item.timeLabel)
                .font(.caption.weight(.semibold)).foregroundStyle(Color.nexdoScheduleBlue)
                .frame(width: 64, alignment: .leading).lineLimit(2).minimumScaleFactor(0.8)
            Image(systemName: item.task == nil ? "calendar" : "checkmark.square.fill")
                .font(.headline).foregroundStyle(item.task == nil ? Color.nexdoIndigo : Color.green)
                .frame(width: 28, height: 28)
                .background((item.task == nil ? Color.nexdoIndigo : Color.green).opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title).font(.subheadline.weight(.semibold)).foregroundStyle(isCritical ? Color.red : Color.nexdoInk).lineLimit(2)
                Text(item.detail).font(.caption2).foregroundStyle(Color.nexdoSecondary)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Color.nexdoSecondary.opacity(0.45))
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.timeLabel), \(item.title), \(item.detail)")
        .accessibilityHint(item.task == nil ? "Opens Calendar" : "Opens task details")
    }
}

struct TodayBackdrop: View {
    var subtle = false
    var body: some View {
        ZStack {
            Color(uiColor: subtle ? .systemBackground : .systemGroupedBackground)
            LinearGradient(colors: [Color.nexdoBlue.opacity(0.10), Color.nexdoMagenta.opacity(0.08), Color.clear], startPoint: .topLeading, endPoint: .center)
            Circle().fill(Color.nexdoBlue.opacity(0.12)).frame(width: 280).blur(radius: 18).offset(x: -170, y: -360).opacity(subtle ? 0.25 : 1)
            Circle().fill(Color.nexdoMagenta.opacity(0.10)).frame(width: 260).blur(radius: 18).offset(x: 190, y: -250).opacity(subtle ? 0.25 : 1)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

private struct TaskRow: View {
    @EnvironmentObject var model: AppModel
    let task: NexdoTask

    private var taskZone: String { task.timeZone ?? model.profile?.timeZone ?? TimeZone.current.identifier }

    private var priorityColor: Color {
        switch task.priority {
        case "CRITICAL": return .red
        case "HIGH": return .orange
        case "LOW": return .nexdoBlue
        default: return .nexdoIndigo
        }
    }

    private var scheduleLabel: String? {
        guard let value = task.startAt ?? task.dueAt else { return nil }
        return ServerDate.time(value, timeZone: taskZone)
    }

    var body: some View {
        HStack(spacing: 14) {
            Button {
                Task { await model.complete(task) }
            } label: {
                ZStack {
                    Circle()
                        .stroke(task.isDone ? Color.clear : priorityColor.opacity(0.55), lineWidth: 2)
                        .background(Circle().fill(task.isDone ? AnyShapeStyle(NexdoTheme.gradient) : AnyShapeStyle(Color.white.opacity(0.65))))
                    if task.isDone {
                        Image(systemName: "checkmark")
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .disabled(model.busy)
            .accessibilityLabel(task.isDone ? "Restore \(task.title)" : "Complete \(task.title)")

            NavigationLink { TaskEditor(task: task) } label: {
                VStack(alignment: .leading, spacing: 10) {
                    Text(task.title)
                        .font(.headline)
                        .foregroundStyle(Color.nexdoInk)
                        .strikethrough(task.isDone, color: Color.nexdoSecondary)
                        .lineLimit(2)

                    HStack(spacing: 8) {
                        if let lifeReminderLabel = task.lifeReminderLabel {
                            TaskBadge(title: lifeReminderLabel.uppercased(), icon: "sparkles", color: .nexdoMagenta)
                        }
                        TaskBadge(title: task.isDone ? "DONE" : task.priority, icon: task.isDone ? "checkmark" : "flag.fill", color: task.isDone ? .green : priorityColor)
                        TaskBadge(title: "\(task.durationMin) MIN", icon: "clock", color: .nexdoIndigo)
                        if let scheduleLabel {
                            TaskBadge(title: scheduleLabel.uppercased(), icon: "calendar", color: .nexdoBlue)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            Image(systemName: "chevron.right")
                .font(.caption.bold())
                .foregroundStyle(Color.nexdoSecondary.opacity(0.6))
        }
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.85)))
        .shadow(color: Color.nexdoIndigo.opacity(0.08), radius: 18, y: 8)
    }
}

struct TasksView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var showingProjects = false
    @State private var adding = false
    @State private var account = false
    @State private var filters = false
    @State private var voice = false
    @State private var searching = false
    @FocusState private var searchFocused: Bool
    @State private var editing: NexdoTask?

    private var zone: String { model.profile?.timeZone ?? model.agenda?.timeZone ?? TimeZone.current.identifier }
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: zone) ?? .current
        value.firstWeekday = 2
        return value
    }
    private let accent = LinearGradient(colors: [.nexdoIndigo, .nexdoBlue], startPoint: .leading, endPoint: .trailing)

    var body: some View {
        let snapshot = model.taskQuery.snapshot(model.tasks, timeZone: zone)
        NavigationStack {
            ZStack {
                TodayBackdrop(subtle: true)
                VStack(alignment: .leading, spacing: 20) {
                    TodayTopBar(name: model.profile?.name ?? "", temperature: nil, showsWeather: false, add: nil, account: { account = true })
                        .padding(.top, 8)
                    header
                    Picker("Tasks or Projects", selection: $showingProjects) {
                        Text("Tasks").tag(false)
                        Text("Projects").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: showingProjects) { _, _ in searchFocused = false }

                    if showingProjects {
                        ProjectsView()
                    } else {
                        List {
                            Group {
                                if searching || !model.taskQuery.search.isEmpty { searchField }
                                creationActions
                                ViewThatFits(in: .horizontal) {
                                    datePills(snapshot)
                                    ScrollView(.horizontal) { datePills(snapshot) }.scrollIndicators(.hidden)
                                }
                                if model.taskQuery.date == .all {
                                    VStack(alignment: .leading, spacing: 6) {
                                        HStack {
                                            Text("History range").font(.subheadline.bold())
                                            Spacer()
                                            Picker("History range", selection: $model.taskQuery.historyRange) {
                                                ForEach(TaskHistoryRange.allCases) { Text($0.rawValue).tag($0) }
                                            }.pickerStyle(.menu).labelsHidden().tint(.nexdoIndigo)
                                        }
                                        Text(model.taskQuery.historyRange == .thisMonth ? "Tasks scheduled within this calendar month." : model.taskQuery.historyRange == .lastMonth ? "Previous calendar month, plus upcoming open tasks." : "History through today, plus upcoming open tasks.")
                                            .font(.caption).foregroundStyle(Color.nexdoSecondary)
                                    }
                                }
                                taskSections(snapshot)
                            }
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                        }
                        .listStyle(.plain)
                        .scrollContentBackground(.hidden)
                        .environment(\.defaultMinListRowHeight, 0)
                        .buttonStyle(.plain)
                        .scrollIndicators(.hidden)
                        .scrollDismissesKeyboard(.interactively)
                        .refreshable { await model.refreshTasks() }
                    }
                }
                .padding(.horizontal, 20)
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $adding) { NavigationStack { TaskEditor(task: nil) } }
            .fullScreenCover(isPresented: $voice) { AddTaskByVoiceView() }
            .sheet(isPresented: $account) { AccountView() }
            .sheet(item: $editing) { task in
                NavigationStack { TaskEditor(task: task) }
                    .presentationDetents([.large])
                    .presentationCornerRadius(30)
            }
            .sheet(isPresented: $filters) {
                NavigationStack {
                    Form {
                        Picker("Status", selection: $model.taskQuery.status) {
                            ForEach(["Open", "Completed", "All"], id: \.self) { Text($0) }
                        }
                        Picker("Priority", selection: $model.taskQuery.priority) {
                            Text("All").tag("All")
                            ForEach(Array(Set(model.tasks.map(\.priority))).sorted(), id: \.self) { Text($0.capitalized).tag($0) }
                        }
                        if model.taskQuery.date != .all { Toggle("Earliest due first", isOn: $model.taskQuery.earliestFirst) }
                        Button("Reset filters") { model.taskQuery.status = "Open"; model.taskQuery.priority = "All"; model.taskQuery.earliestFirst = true }
                    }
                    .navigationTitle("Task filters")
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { closeFilters() } } }
                }.presentationDetents([.medium, .large])
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Tasks").font(.system(.largeTitle, design: .default, weight: .bold))
                    .foregroundStyle(Color.nexdoInk).accessibilityHeading(.h1)
                Text("Turn intent into action.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
            }
            Spacer(minLength: 0)
            if !showingProjects {
                headerButton("slider.horizontal.3", label: "Task filters") { filters = true }
                headerButton("magnifyingglass", label: "Search tasks") {
                    searching.toggle()
                    searchFocused = searching
                }
            }
        }
    }

    private func headerButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.title3)
                .frame(width: 44, height: 44)
                .background(Color.nexdoIndigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 15))
                .overlay(RoundedRectangle(cornerRadius: 15).stroke(Color.nexdoIndigo.opacity(0.14)))
        }.buttonStyle(.plain).foregroundStyle(Color.nexdoIndigo).accessibilityLabel(label)
    }

    private var searchField: some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundStyle(Color.nexdoSecondary)
            TextField("Search your tasks", text: $model.taskQuery.search)
                .focused($searchFocused).submitLabel(.search).autocorrectionDisabled()
                .accessibilityLabel("Search tasks")
            Button { model.taskQuery.search = ""; searching = false; searchFocused = false } label: {
                Image(systemName: "xmark.circle.fill").frame(width: 44, height: 44)
            }.accessibilityLabel("Close search")
        }.padding(.leading, 14).background(.background.opacity(0.85), in: RoundedRectangle(cornerRadius: 16))
    }

    private var creationActions: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            creationCard(title: "Add by Voice", subtitle: "Tap and speak", icon: "mic.fill", isVoice: true) { voice = true }
            creationCard(title: "Add Manually", subtitle: "Type a task", icon: "plus", isVoice: false) { adding = true }
        }
    }

    private func creationCard(title: String, subtitle: String, icon: String, isVoice: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon).font(.system(size: 24, weight: .medium))
                    .foregroundStyle(isVoice ? Color.white : Color.nexdoIndigo)
                    .frame(width: 42, height: 42)
                    .background(isVoice ? AnyShapeStyle(accent) : AnyShapeStyle(Color.nexdoMagenta.opacity(0.08)), in: Circle())
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(.system(.footnote, design: .default, weight: .semibold)).foregroundStyle(Color.nexdoInk)
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 1).minimumScaleFactor(0.85)
                    Text(subtitle).font(.caption).foregroundStyle(Color.nexdoSecondary)
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 1).minimumScaleFactor(0.85)
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(12).frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .background(isVoice ? Color.nexdoIndigo.opacity(0.05) : Color(uiColor: .systemBackground).opacity(0.7), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.nexdoIndigo.opacity(0.16)))
        }.buttonStyle(.plain).accessibilityLabel(title).accessibilityHint(subtitle)
    }

    private func datePills(_ snapshot: TaskListSnapshot) -> some View {
        HStack(spacing: 7) {
            ForEach([TaskDateFilter.today, .tomorrow, .week, .all]) { filter in
                let selected = model.taskQuery.date == filter
                Button {
                    searchFocused = false
                    if filter == .all && model.taskQuery.date != .all { model.taskQuery.historyRange = .thisMonth; model.taskQuery.status = "Open" }
                    model.taskQuery.date = filter
                } label: {
                    HStack(spacing: 5) {
                        Text(filter.rawValue)
                        if filter != .all {
                            Text("\(snapshot.counts[filter, default: 0])").font(.caption)
                                .padding(.horizontal, 5).padding(.vertical, 2)
                                .background(selected ? Color.white.opacity(0.25) : Color.nexdoIndigo.opacity(0.08), in: Capsule())
                        }
                    }
                    .font(.system(.footnote, design: .default)).foregroundStyle(selected ? Color.white : Color.nexdoSecondary)
                    .padding(.horizontal, 8).frame(minHeight: 44)
                    .background(selected ? AnyShapeStyle(accent) : AnyShapeStyle(Color(uiColor: .systemBackground).opacity(0.8)), in: Capsule())
                    .overlay(Capsule().stroke(selected ? Color.clear : Color.nexdoIndigo.opacity(0.16)))
                }.buttonStyle(.plain).accessibilityLabel("\(filter.rawValue), \(snapshot.counts[filter, default: 0]) tasks")
                    .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    @ViewBuilder private func taskSections(_ snapshot: TaskListSnapshot) -> some View {
        if model.tasksLoading && model.tasks.isEmpty {
            ProgressView("Loading tasks…").frame(maxWidth: .infinity).padding(30)
        } else {
            if model.tasksLoadFailed {
                VStack(spacing: 8) {
                    Text("Couldn’t load your tasks.")
                    Button("Retry") { Task { await model.refreshTasks() } }.frame(minHeight: 44)
                }.frame(maxWidth: .infinity).padding()
            }
            if snapshot.tasks.isEmpty && !model.tasksLoadFailed && !model.tasksLoading {
                ContentUnavailableView {
                    Label(model.taskQuery.search.isEmpty ? model.taskQuery.date.emptyTitle : "No matching tasks", systemImage: "checklist")
                } description: { Text("Try another filter or add a task.") } actions: {
                    Button("Add Manually") { adding = true }.buttonStyle(.bordered)
                }
            }
            ForEach(snapshot.sections) { group in
                    Group {
                        HStack {
                            Text(group.isDone && model.taskQuery.status == "All" ? "Completed · \(sectionTitle(group.date))" : sectionTitle(group.date)).font(.title3.bold()).foregroundStyle(Color.nexdoInk).accessibilityHeading(.h2)
                            Spacer()
                            Text("\(group.tasks.count) \(group.tasks.count == 1 ? "task" : "tasks")").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        }.padding(.bottom, 2)
                        ForEach(group.tasks) { task in taskCard(task) }
                    }
            }
        }
    }

    private func taskCard(_ task: NexdoTask) -> some View {
        HStack(spacing: 8) {
            Button { Task { await model.complete(task) } } label: {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 25, weight: .regular)).foregroundStyle(task.isDone ? Color.nexdoIndigo : Color.nexdoSecondary)
                    .frame(width: 44, height: 44)
            }.buttonStyle(.plain).disabled(model.busy)
                .accessibilityLabel("\(task.isDone ? "Restore" : "Complete") \(task.title)")
            Button { editing = task } label: {
                HStack(spacing: 8) {
                    let category = TaskCategoryAppearance.resolve(title: task.title, categoryName: task.category?.name)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(task.title).font(.body).foregroundStyle(Color.nexdoInk).strikethrough(task.isDone)
                        Label(taskSubtitle(task), systemImage: "clock").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        if let project = model.projects.first(where: { $0.id == task.projectId }) {
                            Label(project.name, systemImage: "folder.fill").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        }
                        if typeSize.isAccessibilitySize { TaskCategoryBadge(appearance: category) }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    if !typeSize.isAccessibilitySize {
                        TaskCategoryBadge(appearance: category).frame(maxWidth: 120)
                    }
                    Image(systemName: "chevron.right").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                }.frame(minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityHint("Opens task editor")
        }.padding(.horizontal, 10).padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 66)
            .background(.background.opacity(0.8), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.nexdoSecondary.opacity(0.16)))
    }

    private func sectionTitle(_ date: Date) -> String {
        if date == .distantFuture { return "Unscheduled" }
        if calendar.isDate(date, inSameDayAs: Date()) { return "Today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: Date()), calendar.isDate(date, inSameDayAs: yesterday) { return "Yesterday" }
        if let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date()), calendar.isDate(date, inSameDayAs: tomorrow) { return "Tomorrow" }
        let formatter = DateFormatter()
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: date)
    }
    private func taskSubtitle(_ task: NexdoTask) -> String {
        var parts: [String] = []
        if let value = task.startAt ?? task.dueAt {
            parts.append(ServerDate.time(value, timeZone: task.timeZone ?? zone))
        } else { parts.append("Unscheduled") }
        if task.durationMin > 0 {
            parts.append(task.durationMin % 60 == 0 ? "\(task.durationMin / 60) hr" : "\(task.durationMin) min")
        }
        return parts.joined(separator: " · ")
    }
    private func closeFilters() { filters = false }
}

struct TaskEditor: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    let task: NexdoTask?
    var initialProjectID: String? = nil
    @State private var projectID: String?
    @State private var projectInitialized = false
    @State private var title = ""
    @State private var checkingAvailability = false
    @State private var notes = ""
    @State private var duration = 30
    @State private var notesExpanded = false
    @State private var dateChoice: TaskCreationDate = .today
    @State private var dateExplicitlyChosen = false
    @State private var customDate = Date()
    @State private var showingDatePicker = false
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var focusedField: Field?

    private enum Field { case title, notes }
    private let commonDurations = [15, 30, 45, 60]

    var body: some View {
        if let task {
            TaskDetailsView(task: task).toolbar(.hidden, for: .navigationBar)
        } else {
            creationForm
        }
    }

    private var creationForm: some View {
        ZStack {
            NexdoTaskBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    TaskEditorLabel(title: "TASK NAME", icon: "checklist")
                    TextField("Task name", text: $title, prompt: Text(focusedField == .title ? "" : "What needs to get done?").foregroundStyle(Color(uiColor: .secondaryLabel)), axis: .vertical)
                        .font(.title3.weight(.semibold)).lineLimit(1...3)
                        .focused($focusedField, equals: .title)
                        .accessibilityLabel("Task name")
                        .padding(16)
                        .background(TaskCreationStyle.input, in: RoundedRectangle(cornerRadius: 15))
                        .overlay(RoundedRectangle(cornerRadius: 15).stroke(focusedField == .title ? TaskCreationStyle.accent : TaskCreationStyle.border, lineWidth: focusedField == .title ? 2 : 1))

                    Divider().opacity(0.45)
                    DisclosureGroup(isExpanded: $notesExpanded) {
                        TextField("Task notes", text: $notes, prompt: Text("Add context, links, or a definition of done…").foregroundStyle(Color(uiColor: .secondaryLabel)), axis: .vertical)
                            .lineLimit(3...12).focused($focusedField, equals: .notes)
                            .accessibilityLabel("Task notes")
                            .padding(16)
                            .background(TaskCreationStyle.input, in: RoundedRectangle(cornerRadius: 15))
                            .overlay(RoundedRectangle(cornerRadius: 15).stroke(TaskCreationStyle.border))
                            .padding(.top, 12)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            TaskEditorLabel(title: "NOTES", icon: "text.alignleft")
                            if !notesExpanded {
                                Text(notes.isEmpty ? "Add a note (optional)" : notes)
                                    .font(.subheadline).foregroundStyle(Color.nexdoSecondary).lineLimit(1)
                            }
                        }.frame(minHeight: 44, alignment: .leading)
                    }
                    .onChange(of: notesExpanded) { _, expanded in
                        if !expanded && focusedField == .notes { focusedField = nil }
                    }
                    .transaction { if reduceMotion { $0.animation = nil } }

                    Divider().opacity(0.45)
                    TaskEditorLabel(title: "PROJECT", icon: "folder")
                    ProjectAssignmentField(projectID: $projectID)

                    Divider().opacity(0.45)
                    TaskEditorLabel(title: "DATE", icon: "calendar")
                    dateButtons
                    if let detected = DeterministicTaskActionDetector().detect(title: title) {
                        Text("Nexdo Action: contact \(detected.contactName). Schedule: \(resolvedCreationDate.formatted(date: .abbreviated, time: .shortened)).")
                            .font(.caption).foregroundStyle(Color.nexdoSecondary)
                    }

                    Divider().opacity(0.45)
                    TaskEditorLabel(title: "TIME ESTIMATE", icon: "clock")
                    HStack(spacing: 9) {
                        ForEach(commonDurations, id: \.self) { minutes in
                            Button("\(minutes)m") { duration = minutes }
                                .buttonStyle(TaskDurationButtonStyle(selected: duration == minutes))
                        }
                    }
                    Stepper(value: $duration, in: 5...480, step: 5) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Custom estimate").foregroundStyle(Color.nexdoSecondary)
                            Text("\(duration) min").fontWeight(.semibold).foregroundStyle(Color.nexdoInk)
                        }
                    }
                    .padding(15)
                    .background(TaskCreationStyle.input, in: RoundedRectangle(cornerRadius: 15))
                }
                .padding(20)
                .background(TaskCreationStyle.card, in: RoundedRectangle(cornerRadius: 26))
                .overlay(RoundedRectangle(cornerRadius: 26).stroke(TaskCreationStyle.border))
                .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 20)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button(action: save) {
                HStack(spacing: 10) {
                    if model.busy { ProgressView().tint(.white) }
                    Text(model.busy ? "Creating…" : "Create Task")
                    if !model.busy { Image(systemName: "arrow.right") }
                }
                .font(.headline).foregroundStyle(canSave ? Color.white : Color(uiColor: .secondaryLabel))
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(canSave ? AnyShapeStyle(TaskCreationStyle.selectedGradient) : AnyShapeStyle(TaskCreationStyle.input), in: RoundedRectangle(cornerRadius: 17))
            }
            .buttonStyle(.plain).disabled(!canSave || checkingAvailability)
            .padding(.horizontal, 20).padding(.vertical, 12).background(.regularMaterial)
        }
        .foregroundStyle(Color.primary)
        .tint(TaskCreationStyle.accent)
        .onAppear { if !projectInitialized { projectID = initialProjectID; projectInitialized = true } }
        .navigationTitle("New Task")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close") { closeTaskEditor() }.tint(TaskCreationStyle.accent).foregroundStyle(TaskCreationStyle.accent).disabled(model.busy) }
            ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focusedField = nil } }
        }
        .onDisappear { focusedField = nil }
        .interactiveDismissDisabled(model.busy || checkingAvailability)
        .disabled(checkingAvailability)
        .sheet(isPresented: $showingDatePicker) {
            NavigationStack {
                DatePicker("Task date", selection: $customDate, displayedComponents: .date)
                    .datePickerStyle(.graphical).padding()
                    .navigationTitle("Select Date").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showingDatePicker = false } } }
            }
            .environment(\.timeZone, accountTimeZone)
            .presentationDetents([.medium, .large])
        }
    }

    private var accountTimeZone: TimeZone {
        TimeZone(identifier: model.profile?.timeZone ?? "") ?? .current
    }

    private var dateButtons: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 9)) : AnyLayout(HStackLayout(spacing: 9))
        return layout {
            ForEach(TaskCreationDate.allCases) { choice in
                Button {
                    focusedField = nil
                    dateChoice = choice
                    dateExplicitlyChosen = true
                    if choice == .custom { showingDatePicker = true }
                } label: {
                    Text(choice == .custom && dateChoice == .custom ? customDateLabel : choice.rawValue)
                        .padding(.horizontal, 6).padding(.vertical, 4)
                }
                .buttonStyle(TaskDurationButtonStyle(selected: dateChoice == choice))
                .accessibilityLabel(choice.rawValue)
                .accessibilityValue(choice == .custom && dateChoice == .custom ? customDateLabel : "")
                .accessibilityAddTraits(dateChoice == choice ? .isSelected : [])
            }
        }
    }

    private var customDateLabel: String {
        let formatter = DateFormatter()
        formatter.timeZone = accountTimeZone
        formatter.dateFormat = "MMM d, yyyy"
        return formatter.string(from: customDate)
    }

    private var canSave: Bool {
        !model.busy && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var resolvedCreationDate: Date {
        if !dateExplicitlyChosen, let date = DeterministicTaskActionDetector().detect(title: title)?.scheduledAt { return date }
        return dateChoice.resolve(customDate: customDate, timeZone: accountTimeZone)
    }

    private func save() {
        guard canSave, !checkingAvailability else { return }
        focusedField = nil
        checkingAvailability = true
        Task {
            defer { checkingAvailability = false }

            if await model.saveTask(id: task?.id, title: title.trimmingCharacters(in: .whitespacesAndNewlines), notes: notes, duration: duration, scheduledAt: resolvedCreationDate, projectId: projectID) {
                dismiss()
            }
        }
    }

    private func closeTaskEditor() {
        focusedField = nil
        dismiss()
    }
}

private enum TaskFilter: String, CaseIterable, Identifiable {
    case open, completed, all
    var id: String { rawValue }
    var title: String { switch self { case .open: "Open"; case .completed: "Done"; case .all: "All" } }
    var emptyTitle: String { self == .completed ? "No completed tasks yet" : "You’re all clear" }
    var emptyMessage: String { self == .completed ? "Completed work will appear here." : "Create a task when something new comes up." }
}

enum NexdoTheme {
    static let gradient = LinearGradient(colors: [.nexdoMagenta, .nexdoIndigo, .nexdoBlue], startPoint: .leading, endPoint: .trailing)
    static let saveGradient = LinearGradient(colors: [.nexdoBlue, .nexdoIndigo, .nexdoMagenta], startPoint: .leading, endPoint: .trailing)
}

private struct TaskBadge: View {
    let title: String
    let icon: String
    let color: Color
    var body: some View {
        Label(title, systemImage: icon)
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(color)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(color.opacity(0.09), in: Capsule())
    }
}

private struct TasksHero: View {
    let openCount: Int
    let completedCount: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("MAKE SPACE FOR WHAT MATTERS")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1.3)
                        .foregroundStyle(Color.nexdoIndigo)
                    Text("Your tasks,\nin clear focus.")
                        .font(.system(size: 31, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.nexdoInk)
                }
                Spacer()
                ZStack {
                    Circle().fill(NexdoTheme.gradient).frame(width: 58, height: 58)
                    Image(systemName: "checklist")
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                }
                .shadow(color: Color.nexdoIndigo.opacity(0.2), radius: 14, y: 6)
            }

            HStack(spacing: 12) {
                TaskMetric(value: openCount, label: "Open", icon: "circle.dotted")
                TaskMetric(value: completedCount, label: "Done", icon: "checkmark.circle.fill")
            }
        }
        .padding(22)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.white.opacity(0.9)))
        .shadow(color: Color.nexdoIndigo.opacity(0.08), radius: 22, y: 10)
    }
}

private struct TaskMetric: View {
    let value: Int
    let label: String
    let icon: String
    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: icon).foregroundStyle(Color.nexdoIndigo)
            Text("\(value)").font(.headline.bold()).foregroundStyle(Color.nexdoInk)
            Text(label).font(.caption).foregroundStyle(Color.nexdoSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color.white.opacity(0.65), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

enum TaskCreationStyle {
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
    static let input = Color(uiColor: .tertiarySystemGroupedBackground)
    static let border = Color(uiColor: .separator)
    static let accent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.72, green: 0.68, blue: 1, alpha: 1)
            : UIColor(red: 0.24, green: 0.16, blue: 0.78, alpha: 1)
    })
    static let selectedGradient = LinearGradient(colors: [
        Color(red: 0.57, green: 0.10, blue: 0.54),
        Color(red: 0.35, green: 0.19, blue: 0.75),
        Color(red: 0.08, green: 0.30, blue: 0.68)
    ], startPoint: .leading, endPoint: .trailing)
}

struct TaskEditorLabel: View {
    let title: String
    let icon: String
    var body: some View {
        Label(title, systemImage: icon)
            .font(.caption.weight(.semibold))
            .tracking(0.8)
            .foregroundStyle(TaskCreationStyle.accent)
    }
}

private struct TaskDurationButtonStyle: ButtonStyle {
    let selected: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(selected ? Color.white : Color.primary)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(selected ? AnyShapeStyle(TaskCreationStyle.selectedGradient) : AnyShapeStyle(TaskCreationStyle.input), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(selected ? Color.clear : TaskCreationStyle.border))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}

struct NexdoTaskBackdrop: View {
    var body: some View {
        ZStack {
            Color(uiColor: .systemGroupedBackground)
            Circle().fill(Color.nexdoBlue.opacity(0.13)).frame(width: 310).blur(radius: 8).offset(x: -185, y: -330)
            Circle().fill(Color.nexdoMagenta.opacity(0.11)).frame(width: 270).blur(radius: 10).offset(x: 190, y: -170)
            Circle().fill(Color.nexdoIndigo.opacity(0.10)).frame(width: 330).blur(radius: 14).offset(x: 170, y: 420)
        }
        .ignoresSafeArea()
    }
}

private struct EventRow: View {
    let event: CalendarEvent
    let timeZone: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(event.title, systemImage: "calendar")
            if event.allDay == true { Text("All day").font(.caption) }
            else {
                Text(ServerDate.time(event.startAt, timeZone: timeZone)).font(.caption).foregroundStyle(.secondary)
            }
        }.padding(.vertical, 4)
    }
}
