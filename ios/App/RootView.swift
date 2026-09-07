import SwiftUI
import AuthenticationServices
import CryptoKit

struct RootView: View {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var phase
    @State private var selectedTab: NexdoTab = .today
    var body: some View {
        Group {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-today-design-preview") {
                TodayDesignPreview()
            } else if ProcessInfo.processInfo.arguments.contains("-task-design-preview") {
                TaskDesignPreview()
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
        .tint(.nexdoIndigo)
        .overlay(alignment: .top) { if model.busy { ProgressView("Updating…").padding(8).background(.regularMaterial, in: Capsule()).accessibilityAddTraits(.updatesFrequently) } }
        .alert("Unable to complete request", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK") { model.error = nil }
        } message: { Text(model.error ?? "") }
        .onChange(of: phase) { _, value in
            if value == .active && model.profile != nil { Task { await model.refresh() } }
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
    @State private var voiceInfo = false

    var body: some View {
        ZStack {
            Group {
                switch selection {
                case .today:
                    TodayView(onAsk: { selection = .askAI }, onCalendar: { selection = .calendar })
                case .tasks: TasksView()
                case .askAI: AskView()
                case .calendar: CalendarView()
                }
            }
            .id(selection)
            .transition(.opacity.combined(with: .scale(scale: 0.985)))
        }
        .animation(reduceMotion ? nil : .snappy(duration: 0.28), value: selection)
        .alert("Voice input", isPresented: $voiceInfo) { Button("OK", role: .cancel) {} } message: { Text("Voice input isn’t available in the native app yet. Tap Ask Nexdo to type your question.") }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if selection != .askAI {
                    HStack(spacing: 0) {
                        Button { selection = .askAI } label: {
                            Text("Ask Nexdo…").font(.body).foregroundStyle(Color.nexdoSecondary)
                                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                                .contentShape(Rectangle())
                        }.accessibilityLabel("Ask Nexdo")
                        Button { voiceInfo = true } label: {
                            Image(systemName: "mic.fill").font(.title3).foregroundStyle(.white)
                                .frame(width: 46, height: 46)
                                .background(Color(red: 0.17, green: 0.36, blue: 0.58), in: Circle())
                        }.accessibilityLabel("Voice input unavailable")
                    }
                    .buttonStyle(.plain)
                    .padding(.leading, 18).padding(.trailing, 4)
                    .background(.regularMaterial, in: Capsule())
                    .overlay(Capsule().stroke(Color.nexdoIndigo.opacity(0.16)))
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)
                }

                HStack(spacing: 4) {
                    ForEach(NexdoTab.allCases) { tab in
                        Button { selection = tab } label: {
                            VStack(spacing: 4) {
                                Image(systemName: tab.icon)
                                    .font(.system(size: 19, weight: selection == tab ? .semibold : .regular))
                                Text(tab.title).font(.caption2.weight(selection == tab ? .semibold : .regular))
                            }
                            .foregroundStyle(selection == tab ? Color.nexdoIndigo : Color.nexdoSecondary)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(selection == tab ? Color.nexdoIndigo.opacity(0.10) : .clear, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(tab.title)
                        .accessibilityAddTraits(selection == tab ? .isSelected : [])
                    }
                }
                .padding(.horizontal, 8)
                .padding(.top, 6)
                .background(.ultraThinMaterial)
                .overlay(alignment: .top) { Divider().opacity(0.45) }
            }
        }
    }
}

#if DEBUG
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
                model.agenda = Agenda(timeZone: "America/Los_Angeles", range: .init(days: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]), tasks: tasks, events: [], overdue: [tasks[2]])
            }
    }
}

private struct TaskDesignPreview: View {
    @StateObject private var model = AppModel()
    @State private var loaded = false

    var body: some View {
        Group {
            if ProcessInfo.processInfo.arguments.contains("-task-editor-preview") {
                NavigationStack { TaskEditor(task: nil) }
            } else {
                NexdoTabShell(selection: .constant(.tasks))
            }
        }
            .environmentObject(model)
            .onAppear {
                guard !loaded else { return }
                loaded = true
                model.profile = Profile(id: "preview", name: "Sri", email: "sri@example.com", timeZone: "America/Los_Angeles")
                model.tasks = [
                    NexdoTask(id: "proposal", title: "Finish the launch proposal", status: "PLANNED", priority: "CRITICAL", durationMin: 45, notes: "Share the final draft with the launch team.", startAt: "2026-09-06T17:45:00Z", dueAt: "2026-09-06T23:59:00Z"),
                    NexdoTask(id: "notes", title: "Review product launch notes", status: "PLANNED", priority: "HIGH", durationMin: 30, notes: "Confirm open questions before the afternoon review.", startAt: nil, dueAt: "2026-09-07T19:00:00Z"),
                    NexdoTask(id: "followup", title: "Send client follow-up", status: "PLANNED", priority: "MEDIUM", durationMin: 15, notes: "Include the revised timeline.", startAt: nil, dueAt: nil),
                    NexdoTask(id: "briefing", title: "Prepare tomorrow’s executive briefing", status: "PLANNED", priority: "LOW", durationMin: 60, notes: "Summarize progress, risks, and decisions.", startAt: "2026-09-07T16:00:00Z", dueAt: nil),
                    NexdoTask(id: "done", title: "Confirm design review", status: "COMPLETED", priority: "MEDIUM", durationMin: 15, notes: nil, startAt: nil, dueAt: nil)
                ]
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

                    Text(model.lastSignedInFirstName.map { "Welcome back, \($0)" } ?? "Welcome back")
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

                    Text("Your day is clearer with Nexdo.")
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
    }

    private var canSignIn: Bool {
        !model.busy && email.contains("@") && !password.isEmpty
    }

    private func signIn() {
        guard canSignIn else { return }
        focusedField = nil
        let submittedPassword = password
        password = ""
        Task { await model.login(email: email, password: submittedPassword) }
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
            Form {
                Section {
                    TextField("Full name", text: $name).textContentType(.name)
                    TextField("Email address", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Password", text: $password).textContentType(.newPassword)
                    SecureField("Confirm password", text: $confirmation).textContentType(.newPassword)
                } header: { Text("Your account") } footer: {
                    Text("Use at least 12 characters. Your password is sent securely to Nexdo and stored only as a one-way hash.")
                }
                if let localError { Section { Text(localError).foregroundStyle(.red) } }
                Section {
                    Button(model.busy ? "Creating Account…" : "Create Account") { create() }
                        .disabled(model.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !email.contains("@") || password.count < 12)
                }
            }
            .navigationTitle("Create your account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .presentationDetents([.large])
    }

    private func create() {
        guard password == confirmation else { localError = "The passwords do not match."; return }
        localError = nil
        Task { await model.register(name: name, email: email, password: password) }
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
                } footer: { Text("We’ll email a six-digit verification code if an account exists.") }
                if codeSent {
                    Section("Verification") {
                        TextField("6-digit code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                        SecureField("New password", text: $password).textContentType(.newPassword)
                        SecureField("Confirm new password", text: $confirmation).textContentType(.newPassword)
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
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .alert("Password updated", isPresented: $complete) {
                Button("Sign In") { dismiss() }
            } message: { Text("You can now sign in with your new password.") }
        }
        .presentationDetents([.large])
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

private struct NexdoLogoMark: View {
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

private extension Color {
    static let nexdoInk = Color(red: 0.03, green: 0.06, blue: 0.18)
    static let nexdoSecondary = Color(red: 0.34, green: 0.36, blue: 0.50)
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
    @EnvironmentObject private var model: AppModel
    let onAsk: () -> Void
    let onCalendar: () -> Void
    @State private var range: TodayRange = .today
    @State private var adding = false
    @State private var showingAccount = false

    private var timeZone: String { model.agenda?.timeZone ?? model.profile?.timeZone ?? TimeZone.current.identifier }
    private var selectedDays: Set<String> { Set(model.agenda?.range.days.prefix(range.rawValue) ?? []) }

    private var schedule: [TodayScheduleItem] {
        guard let agenda = model.agenda else { return [] }
        if range == .today, let snapshot = model.scheduleIntelligence?.today {
            return snapshot.timeline.map { item in
                TodayScheduleItem(
                    id: item.id,
                    sourceId: item.sourceId,
                    title: item.title,
                    dateValue: item.startAt,
                    timeLabel: item.allDay ? "All day" : (item.deadlineOnly ? "Due \(ServerDate.time(item.startAt, timeZone: snapshot.timeZone))" : ServerDate.time(item.startAt, timeZone: snapshot.timeZone)),
                    detail: item.kind == "task" ? (item.deadlineOnly ? "Task deadline" : "Planned task") : "Calendar appointment",
                    task: item.kind == "task" ? model.tasks.first(where: { $0.id == item.sourceId }) : nil,
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
            return selectedDays.contains(ServerDate.day(date, timeZone: agenda.timeZone) ?? "")
        }.map { task in
            let value = task.startAt ?? task.dueAt!
            return TodayScheduleItem(id: "task:\(task.id)", sourceId: task.id, title: task.title, dateValue: value,
                                     timeLabel: task.startAt == nil ? "Due \(ServerDate.time(value, timeZone: agenda.timeZone))" : ServerDate.time(value, timeZone: agenda.timeZone),
                                     detail: task.startAt == nil ? "Task deadline" : "Planned task", task: task, isPast: false)
        }
        return (eventItems + taskItems).sorted {
            (ServerDate.parse($0.dateValue) ?? .distantFuture) < (ServerDate.parse($1.dateValue) ?? .distantFuture)
        }
    }

    private var counts: (appointments: Int, tasks: Int) {
        let events = schedule.filter { $0.task == nil }.count
        return (events, schedule.count - events)
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

                        TodayIntelligenceCard(
                            range: range,
                            appointments: counts.appointments,
                            taskCount: counts.tasks,
                            availableMinutes: range == .today ? model.scheduleIntelligence?.today.availableMinutes : nil,
                            attentionCount: range == .today ? (model.scheduleIntelligence?.today.attention.count ?? model.agenda?.overdue.count ?? 0) : (model.agenda?.overdue.count ?? 0),
                            schedule: schedule,
                            recommendation: range == .today ? model.scheduleIntelligence?.today.recommendation : nil,
                            onAsk: onAsk,
                            onCalendar: onCalendar
                        )

                        if range == .today, let attention = model.scheduleIntelligence?.today.attention, !attention.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Label("Needs your attention", systemImage: "exclamationmark.triangle.fill")
                                    .font(.headline).foregroundStyle(Color.nexdoInk)
                                ForEach(attention) { item in
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(item.label.uppercased()).font(.caption2.bold()).foregroundStyle(.orange)
                                        Text(item.title).font(.headline).foregroundStyle(Color.nexdoInk)
                                        Text(item.explanation).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(16)
                                    .background(Color.white.opacity(0.64), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    .accessibilityElement(children: .combine)
                                }
                            }
                            .padding(18)
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.white.opacity(0.82)))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .refreshable { await model.refresh() }
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $adding) { NavigationStack { TaskEditor(task: nil) } }
            .sheet(isPresented: $showingAccount) { AccountView() }
        }
    }
}

private struct TodayTopBar: View {
    let name: String
    let temperature: Int?
    let add: () -> Void
    let account: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 7) {
                NexdoLogoMark().frame(width: 40, height: 30)
                VStack(alignment: .leading, spacing: -2) {
                    HStack(spacing: 3) {
                        Text("Nexdo").font(.system(size: 20, weight: .bold, design: .rounded)).foregroundStyle(Color.nexdoInk)
                        Image(systemName: "sparkles").font(.caption).foregroundStyle(Color.nexdoIndigo)
                    }
                    Text("GET MORE DONE WITH AI").font(.system(size: 5, weight: .bold)).tracking(0.6).foregroundStyle(Color.nexdoSecondary)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Nexdo")

            Spacer(minLength: 6)
            TodayHeaderButton(icon: "plus", label: "Add a task", action: add)
            ZStack {
                Circle().fill(NexdoTheme.gradient)
                Text(temperature.map { "\($0)°" } ?? "–°")
                    .font(.subheadline.bold()).foregroundStyle(.white).minimumScaleFactor(0.75)
            }
            .frame(width: 44, height: 44)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(temperature.map { "San Ramon weather, \($0) degrees Fahrenheit" } ?? "Weather temporarily unavailable")

            Button(action: account) {
                Text(ProfileName.firstName(from: name)?.prefix(1).uppercased() ?? "U")
                    .font(.headline.bold()).foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(LinearGradient(colors: [.nexdoBlue, .nexdoIndigo], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                    .overlay(Circle().stroke(Color.white, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open account for \(name)")
        }
        .frame(minHeight: 50)
    }
}

private struct TodayHeaderButton: View {
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
    let availableMinutes: Int?
    let attentionCount: Int
    let schedule: [TodayScheduleItem]
    let recommendation: ScheduleIntelligenceResponse.Today.Recommendation?
    let onAsk: () -> Void
    let onCalendar: () -> Void

    private var commitmentCount: Int { appointments + taskCount }
    private var freeLabel: String? {
        guard let availableMinutes else { return nil }
        if availableMinutes >= 60 { return "\(availableMinutes / 60)h \(availableMinutes % 60)m free in work hours" }
        return "\(availableMinutes)m free in work hours"
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                Label(range == .today ? "Your day, in focus" : "Your next \(range.rawValue) days", systemImage: "sparkles")
                    .font(.subheadline.bold()).foregroundStyle(Color.nexdoIndigo)
                Text("\(commitmentCount) commitment\(commitmentCount == 1 ? "" : "s") \(range == .today ? "today" : "ahead")")
                    .font(.system(.title, design: .rounded, weight: .bold)).foregroundStyle(Color.nexdoInk)
                    .accessibilityHeading(.h2)
                Text("\(appointments) calendar appointment\(appointments == 1 ? "" : "s") · \(taskCount) task\(taskCount == 1 ? "" : "s")")
                    .font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                HStack(spacing: 10) {
                    if attentionCount > 0 {
                        Label("\(attentionCount) thing\(attentionCount == 1 ? " needs" : "s need") attention", systemImage: "exclamationmark.circle")
                            .font(.caption.bold()).foregroundStyle(Color(red: 0.66, green: 0.18, blue: 0.12))
                            .padding(.horizontal, 10).padding(.vertical, 7)
                            .background(Color(red: 1, green: 0.88, blue: 0.82), in: Capsule())
                    } else {
                        Label("Nothing needs attention", systemImage: "checkmark.circle")
                            .font(.caption.bold()).foregroundStyle(.green)
                    }
                    if let freeLabel { Label(freeLabel, systemImage: "clock").font(.caption).foregroundStyle(Color.nexdoSecondary) }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(LinearGradient(colors: [Color.nexdoBlue.opacity(0.08), Color.nexdoMagenta.opacity(0.09)], startPoint: .topLeading, endPoint: .bottomTrailing))

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("On your schedule").font(.headline).foregroundStyle(Color.nexdoInk)
                    Spacer()
                    Button(action: onCalendar) { Label("View day", systemImage: "chevron.down").labelStyle(.titleAndIcon).font(.caption) }
                        .accessibilityLabel("Open Calendar")
                }
                .padding(.bottom, 10)

                if schedule.isEmpty {
                    VStack(spacing: 9) {
                        Image(systemName: "calendar.badge.checkmark").font(.title2).foregroundStyle(Color.nexdoIndigo)
                        Text("Your schedule is clear").font(.headline).foregroundStyle(Color.nexdoInk)
                        Text("Add a task or enjoy the open space.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 28)
                    .accessibilityElement(children: .combine)
                } else {
                    ForEach(Array(schedule.prefix(7).enumerated()), id: \.element.id) { index, item in
                        if index > 0 { Divider().opacity(0.55) }
                        if let task = item.task {
                            NavigationLink { TaskEditor(task: task) } label: { TodayScheduleRow(item: item) }.buttonStyle(.plain)
                        } else {
                            Button(action: onCalendar) { TodayScheduleRow(item: item) }.buttonStyle(.plain)
                        }
                    }
                    if schedule.count > 7 {
                        Button("View \(schedule.count - 7) more") { onCalendar() }
                            .font(.subheadline.weight(.semibold)).padding(.top, 12)
                    }
                }

                Button(action: onAsk) {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("What should I do next?", systemImage: "sparkles").font(.subheadline.bold()).foregroundStyle(Color.nexdoIndigo)
                        Text(recommendation?.explanation ?? "Ask Nexdo to prioritize your actual tasks and calendar commitments.")
                            .font(.subheadline).foregroundStyle(Color.nexdoSecondary).multilineTextAlignment(.leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(Color.nexdoBlue.opacity(0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.nexdoBlue.opacity(0.16)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ask Nexdo what to do next")
                .padding(.top, 16)
            }
            .padding(18)
            .background(Color.white.opacity(0.70))
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.nexdoIndigo.opacity(0.11)))
        .shadow(color: Color.nexdoIndigo.opacity(0.09), radius: 24, y: 10)
        .accessibilityElement(children: .contain)
    }
}

private struct TodayScheduleRow: View {
    let item: TodayScheduleItem
    var body: some View {
        HStack(spacing: 12) {
            Text(item.timeLabel)
                .font(.caption.weight(.semibold)).foregroundStyle(Color(red: 0.15, green: 0.34, blue: 0.56))
                .frame(width: 64, alignment: .leading).lineLimit(2).minimumScaleFactor(0.8)
            Image(systemName: item.task == nil ? "calendar" : "checkmark.square.fill")
                .font(.headline).foregroundStyle(item.task == nil ? Color.nexdoIndigo : Color(red: 0.30, green: 0.50, blue: 0.36))
                .frame(width: 28, height: 28)
                .background((item.task == nil ? Color.nexdoIndigo : Color.green).opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.nexdoInk).lineLimit(2)
                Text(item.detail).font(.caption2).foregroundStyle(Color.nexdoSecondary)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Color.nexdoSecondary.opacity(0.45))
        }
        .padding(.vertical, 12)
        .opacity(item.isPast ? 0.62 : 1)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.timeLabel), \(item.title), \(item.detail)")
        .accessibilityHint(item.task == nil ? "Opens Calendar" : "Opens task details")
    }
}

private struct TodayBackdrop: View {
    var body: some View {
        ZStack {
            Color(uiColor: .systemGroupedBackground)
            LinearGradient(colors: [Color.nexdoBlue.opacity(0.10), Color.nexdoMagenta.opacity(0.08), Color.clear], startPoint: .topLeading, endPoint: .center)
            Circle().fill(Color.nexdoBlue.opacity(0.12)).frame(width: 280).blur(radius: 18).offset(x: -170, y: -360)
            Circle().fill(Color.nexdoMagenta.opacity(0.10)).frame(width: 260).blur(radius: 18).offset(x: 190, y: -250)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

private struct TaskRow: View {
    @EnvironmentObject var model: AppModel
    let task: NexdoTask

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
        return ServerDate.time(value, timeZone: model.profile?.timeZone ?? TimeZone.current.identifier)
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

private struct TasksView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var adding = false
    @State private var account = false
    @State private var filters = false
    @State private var selectionInfo = false
    private var visibleTasks: [NexdoTask] {
        model.taskQuery.results(model.tasks, timeZone: model.profile?.timeZone ?? model.agenda?.timeZone ?? TimeZone.current.identifier)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                TodayBackdrop()
                VStack(alignment: .leading, spacing: 16) {
                    TodayTopBar(name: model.profile?.name ?? "", temperature: model.weather.map { Int($0.current.temperature.rounded()) }, add: { adding = true }, account: { account = true })
                        .padding(.top, 8)
                    Text("Tasks").font(.largeTitle.bold()).foregroundStyle(Color.nexdoInk).accessibilityHeading(.h1)
                    HStack(spacing: 10) {
                        HStack(spacing: 10) {
                            Image(systemName: "magnifyingglass").foregroundStyle(Color.nexdoSecondary).accessibilityHidden(true)
                            TextField("Search your tasks", text: $model.taskQuery.search)
                                .accessibilityLabel("Search tasks")
                                .submitLabel(.search)
                                .autocorrectionDisabled()
                            if !model.taskQuery.search.isEmpty {
                                Button { model.taskQuery.search = "" } label: { Image(systemName: "xmark.circle.fill") }
                                    .accessibilityLabel("Clear search").frame(minWidth: 44, minHeight: 44)
                            }
                        }
                        .padding(.horizontal, 14).frame(minHeight: 50)
                        .background(.background.opacity(0.9), in: RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.nexdoIndigo.opacity(0.16)))
                        Button { filters = true } label: {
                            Image(systemName: "slider.horizontal.3").font(.title3)
                                .frame(width: 48, height: 50)
                                .background(Color.nexdoIndigo.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
                                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.nexdoIndigo.opacity(0.16)))
                        }.accessibilityLabel("Task filters")
                    }
                    ViewThatFits(in: .horizontal) {
                        datePills
                        ScrollView(.horizontal) { datePills }.scrollIndicators(.hidden)
                    }
                    HStack {
                        Text("\(visibleTasks.count) \(visibleTasks.count == 1 ? "task" : "tasks")").foregroundStyle(Color.nexdoSecondary)
                        Spacer()
                        Button("Select tasks") { selectionInfo = true }.fontWeight(.semibold).frame(minHeight: 44)
                    }.font(.caption)
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            if model.tasksLoading && model.tasks.isEmpty {
                                ForEach(0..<3) { _ in
                                    HStack { Circle().frame(width: 24, height: 24); VStack(alignment: .leading) { Capsule().frame(width: 140, height: 12); Capsule().frame(width: 100, height: 8) }; Spacer() }
                                        .foregroundStyle(Color.nexdoSecondary.opacity(0.12)).padding(20)
                                        .background(.background.opacity(0.7), in: RoundedRectangle(cornerRadius: 17))
                                }.accessibilityHidden(true)
                                Text("Loading tasks…").font(.caption).foregroundStyle(Color.nexdoSecondary)
                            } else {
                                if model.tasksLoadFailed {
                                    VStack(spacing: 8) {
                                        Text("Couldn’t load your tasks.")
                                        Button("Retry") { Task { await model.refresh() } }.frame(minHeight: 44)
                                    }.frame(maxWidth: .infinity).padding()
                                }
                                if visibleTasks.isEmpty && !model.tasksLoadFailed {
                                    VStack(spacing: 12) {
                                        Image(systemName: "checklist").font(.largeTitle).foregroundStyle(Color.nexdoIndigo)
                                        Text(model.taskQuery.search.isEmpty ? model.taskQuery.date.emptyTitle : "No matching tasks").font(.headline)
                                        Text("Try another filter or add a task.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                                        Button("Add a task") { adding = true }.frame(minHeight: 44)
                                    }.multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.vertical, 36)
                                }
                                ForEach(visibleTasks) { task in taskCard(task) }
                            }
                        }.padding(.bottom, 16)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .refreshable { await model.refresh() }
                    .scrollIndicators(.hidden)
                }.padding(.horizontal, 20)
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $adding) { NavigationStack { TaskEditor(task: nil) } }
            .sheet(isPresented: $account) { AccountView() }
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
                        Toggle("Earliest due first", isOn: $model.taskQuery.earliestFirst)
                        Button("Reset filters") { model.taskQuery.status = "Open"; model.taskQuery.priority = "All"; model.taskQuery.earliestFirst = true }
                    }.navigationTitle("Task filters")
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { filters = false } } }
                }.presentationDetents([.medium, .large])
            }
            .alert("Select tasks", isPresented: $selectionInfo) {
                Button("OK", role: .cancel) {}
            } message: { Text("Bulk actions aren’t available yet. Use a task’s completion circle or open it to edit.") }
        }
    }

    private var datePills: some View {
        HStack(spacing: 8) {
            ForEach(TaskDateFilter.allCases) { filter in
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) { model.taskQuery.date = filter }
                } label: {
                    Text(filter.rawValue).font(.subheadline)
                        .foregroundStyle(model.taskQuery.date == filter ? Color.nexdoIndigo : Color.nexdoSecondary)
                        .padding(.horizontal, 15).frame(minHeight: 44)
                        .background(model.taskQuery.date == filter ? Color.nexdoIndigo.opacity(0.10) : Color(uiColor: .systemBackground).opacity(0.85), in: Capsule())
                        .overlay(Capsule().stroke(Color.nexdoIndigo.opacity(0.16)))
                }.buttonStyle(.plain).accessibilityLabel("\(filter.rawValue) filter")
                    .accessibilityAddTraits(model.taskQuery.date == filter ? .isSelected : [])
            }
        }
    }

    private func taskCard(_ task: NexdoTask) -> some View {
        HStack(spacing: 8) {
            Button { Task { await model.complete(task) } } label: {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 23, weight: .ultraLight))
                    .foregroundStyle(task.isDone ? Color.nexdoIndigo : Color.nexdoSecondary)
                    .frame(width: 44, height: 44)
            }.buttonStyle(.plain).disabled(model.busy)
                .accessibilityLabel("\(task.isDone ? "Restore" : "Complete") \(task.title)")
                .accessibilityValue(task.isDone ? "Completed" : "Open")
            NavigationLink { TaskEditor(task: task).toolbar(.visible, for: .navigationBar) } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(task.title).font(.body).foregroundStyle(Color.nexdoInk).strikethrough(task.isDone)
                        Text(taskSubtitle(task)).font(.caption).foregroundStyle(Color.nexdoSecondary)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.nexdoSecondary).accessibilityHidden(true)
                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityElement(children: .combine).accessibilityHint("Opens task details")
        }
        .padding(.vertical, 12).padding(.leading, 8).padding(.trailing, 18)
        .background(.background.opacity(0.88), in: RoundedRectangle(cornerRadius: 17))
        .overlay(RoundedRectangle(cornerRadius: 17).stroke(Color.nexdoSecondary.opacity(0.16)))
        .shadow(color: Color.nexdoSecondary.opacity(0.04), radius: 3, y: 2)
    }

    private func taskSubtitle(_ task: NexdoTask) -> String {
        var parts: [String] = []
        if let value = task.dueAt ?? task.startAt, let date = ServerDate.parse(value) {
            let formatter = DateFormatter()
            formatter.timeZone = TimeZone(identifier: model.profile?.timeZone ?? "") ?? .current
            formatter.dateStyle = model.taskQuery.date == .today || model.taskQuery.date == .tomorrow ? .none : .short
            formatter.timeStyle = .short
            parts.append("\(task.dueAt == nil ? "Scheduled" : "Due") \(formatter.string(from: date))")
        }
        if task.durationMin > 0 { parts.append("\(task.durationMin) min") }
        return parts.joined(separator: " · ")
    }
}

private struct TaskEditor: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    let task: NexdoTask?
    @State private var title = ""
    @State private var notes = ""
    @State private var duration = 30
    @FocusState private var focusedField: Field?

    private enum Field { case title, notes }
    private let commonDurations = [15, 30, 45, 60]

    var body: some View {
        ZStack {
            NexdoTaskBackdrop()

            ScrollView {
                VStack(spacing: 22) {
                    VStack(spacing: 12) {
                        ZStack {
                            Circle().fill(NexdoTheme.gradient).frame(width: 68, height: 68)
                            Image(systemName: task == nil ? "plus" : "checkmark")
                                .font(.title2.bold())
                                .foregroundStyle(.white)
                        }
                        .shadow(color: Color.nexdoIndigo.opacity(0.22), radius: 16, y: 7)

                        Text(task == nil ? "Create a task" : "Task details")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.nexdoInk)
                        Text(task == nil ? "Capture it now. Nexdo will help you make time." : "Keep the outcome clear and the estimate realistic.")
                            .font(.subheadline)
                            .foregroundStyle(Color.nexdoSecondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 12)

                    VStack(alignment: .leading, spacing: 20) {
                        TaskEditorLabel(title: "TASK NAME", icon: "checklist")
                        TextField("What needs to get done?", text: $title, axis: .vertical)
                            .font(.title3.weight(.semibold))
                            .lineLimit(1...3)
                            .focused($focusedField, equals: .title)
                            .padding(16)
                            .background(Color.white.opacity(0.8), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(focusedField == .title ? Color.nexdoIndigo : Color.nexdoIndigo.opacity(0.12), lineWidth: focusedField == .title ? 2 : 1))

                        Divider().opacity(0.45)

                        TaskEditorLabel(title: "NOTES", icon: "text.alignleft")
                        ZStack(alignment: .topLeading) {
                            if notes.isEmpty {
                                Text("Add context, links, or a definition of done…")
                                    .foregroundStyle(Color.nexdoSecondary.opacity(0.65))
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 19)
                            }
                            TextEditor(text: $notes)
                                .focused($focusedField, equals: .notes)
                                .frame(minHeight: 120)
                                .scrollContentBackground(.hidden)
                                .padding(12)
                                .background(Color.clear)
                        }
                        .background(Color.white.opacity(0.8), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(Color.nexdoIndigo.opacity(0.12)))

                        Divider().opacity(0.45)

                        TaskEditorLabel(title: "TIME ESTIMATE", icon: "clock")
                        HStack(spacing: 9) {
                            ForEach(commonDurations, id: \.self) { minutes in
                                Button("\(minutes)m") { duration = minutes }
                                    .buttonStyle(TaskDurationButtonStyle(selected: duration == minutes))
                            }
                        }

                        Stepper(value: $duration, in: 5...480, step: 5) {
                            HStack {
                                Text("Custom estimate").foregroundStyle(Color.nexdoSecondary)
                                Spacer()
                                Text("\(duration) min").fontWeight(.semibold).foregroundStyle(Color.nexdoInk)
                            }
                        }
                        .padding(15)
                        .background(Color.white.opacity(0.68), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    }
                    .padding(22)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Color.white.opacity(0.88)))
                    .shadow(color: Color.nexdoIndigo.opacity(0.09), radius: 22, y: 10)

                    Button {
                        save()
                    } label: {
                        HStack(spacing: 10) {
                            if model.busy { ProgressView().tint(.white) }
                            Text(model.busy ? "Saving…" : task == nil ? "Create Task" : "Save Changes")
                            if !model.busy { Image(systemName: "arrow.right") }
                        }
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 60)
                        .background(NexdoTheme.gradient, in: RoundedRectangle(cornerRadius: 19, style: .continuous))
                        .shadow(color: Color.nexdoIndigo.opacity(0.22), radius: 16, y: 7)
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSave)
                    .opacity(canSave ? 1 : 0.5)

                    if let task {
                        Button {
                            Task { await model.complete(task); dismiss() }
                        } label: {
                            Label(task.isDone ? "Restore task" : "Mark as complete", systemImage: task.isDone ? "arrow.uturn.backward.circle" : "checkmark.circle")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.nexdoIndigo)
                                .frame(maxWidth: .infinity, minHeight: 52)
                        }
                        .buttonStyle(.plain)
                        .disabled(model.busy)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationTitle(task == nil ? "New Task" : "Edit Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(model.busy) } }
            .onAppear { title = task?.title ?? ""; notes = task?.notes ?? ""; duration = task?.durationMin ?? 30 }
            .interactiveDismissDisabled(model.busy)
    }

    private var canSave: Bool {
        !model.busy && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func save() {
        guard canSave else { return }
        focusedField = nil
        Task {
            if await model.saveTask(id: task?.id, title: title.trimmingCharacters(in: .whitespacesAndNewlines), notes: notes, duration: duration) {
                dismiss()
            }
        }
    }
}

private enum TaskFilter: String, CaseIterable, Identifiable {
    case open, completed, all
    var id: String { rawValue }
    var title: String { switch self { case .open: "Open"; case .completed: "Done"; case .all: "All" } }
    var emptyTitle: String { self == .completed ? "No completed tasks yet" : "You’re all clear" }
    var emptyMessage: String { self == .completed ? "Completed work will appear here." : "Create a task when something new comes up." }
}

private enum NexdoTheme {
    static let gradient = LinearGradient(colors: [.nexdoMagenta, .nexdoIndigo, .nexdoBlue], startPoint: .leading, endPoint: .trailing)
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

private struct TaskEditorLabel: View {
    let title: String
    let icon: String
    var body: some View {
        Label(title, systemImage: icon)
            .font(.system(size: 10, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(Color.nexdoIndigo)
    }
}

private struct TaskDurationButtonStyle: ButtonStyle {
    let selected: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(selected ? Color.white : Color.nexdoInk)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(selected ? AnyShapeStyle(NexdoTheme.gradient) : AnyShapeStyle(Color.white.opacity(0.7)), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}

private struct NexdoTaskBackdrop: View {
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

private struct CalendarView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        NavigationStack {
            List {
                if let agenda = model.agenda {
                    Section { Text("Next 3 days · \(agenda.timeZone)").font(.subheadline).foregroundStyle(.secondary) }
                    ForEach(agenda.range.days, id: \.self) { day in
                        Section(day) {
                            let events = agenda.events.filter { ServerDate.occurs($0, on: day, timeZone: agenda.timeZone) }
                            let tasks = agenda.tasks.filter { !$0.isDone && $0.status != "CANCELLED" && ServerDate.day($0.startAt ?? $0.dueAt ?? "", timeZone: agenda.timeZone) == day }
                            if events.isEmpty && tasks.isEmpty { Text("Nothing scheduled.").foregroundStyle(.secondary) }
                            ForEach(events) { event in EventRow(event: event, timeZone: agenda.timeZone) }
                            ForEach(tasks) { task in TaskRow(task: task) }
                        }
                    }
                    Section { Text("Connected calendar data comes from Nexdo’s server. Calendar connection and synchronization controls remain on the web in this first native build.").font(.footnote).foregroundStyle(.secondary) }
                } else { Text("Pull down to load your calendar.") }
            }.navigationTitle("Calendar").refreshable { await model.refresh() }
        }
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

private struct AskView: View {
    @EnvironmentObject var model: AppModel
    @State private var prompt = ""
    private let suggestions = ["What’s my day looking like?", "Do I have any conflicts?", "What should I focus on today?", "Fix my afternoon.", "I have 45 minutes free. What should I do?"]
    var body: some View {
        NavigationStack {
            List {
                if !model.aiConsent {
                    Section("Before using Ask AI") {
                        Text("Nexdo sends your question and relevant task and calendar information—including titles, notes, times, preferences, and conversation context—to OpenAI to generate answers. Do not include information you do not want shared. AI can make mistakes; review proposed changes before approving them.")
                        Link("OpenAI data privacy information", destination: URL(string: "https://openai.com/policies/privacy-policy/")!)
                        Button("Allow sharing with OpenAI") { model.aiConsent = true }
                        Text("Optional. Tasks and Calendar work without AI. You can withdraw permission in Account; withdrawal stops future requests, not previous processing.").font(.footnote).foregroundStyle(.secondary)
                    }
                } else {
                    if let turn = model.turn {
                        Section { Text(turn.visual.summary) }
                        if let sections = turn.visual.sections, !sections.isEmpty {
                            ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                                Section(section.title) { ForEach(Array(section.items.enumerated()), id: \.offset) { _, item in Text(item) } }
                            }
                        } else { Section { Text(turn.spoken) } }
                        if let confirmation = turn.confirmation {
                            Section("Review proposed changes") {
                                Text(confirmation.prompt)
                                ForEach(Array((turn.visual.tasks ?? []).enumerated()), id: \.offset) { _, detail in Text(detail) }
                                ForEach(Array((turn.executive?.proposedScheduleChanges ?? []).enumerated()), id: \.offset) { _, change in
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(change.title).bold()
                                        Text("From: \(change.before ?? "Unscheduled")")
                                        Text("To: \(change.after) · \(change.durationMin) min")
                                        Text(change.reason).font(.footnote)
                                    }
                                }
                                Button("Approve changes") { Task { await model.ask("yes", accept: true) } }.disabled(model.busy)
                                Button("Keep my current plan", role: .cancel) { Task { await model.ask("no", accept: false) } }.disabled(model.busy)
                            }
                        }
                    } else {
                        Section("Start with a question") {
                            ForEach(suggestions, id: \.self) { text in Button(text) { Task { await model.ask(text) } }.disabled(model.busy) }
                        }
                    }
                    Section("Follow up") {
                        TextField("Ask Nexdo…", text: $prompt, axis: .vertical).lineLimit(1...6)
                        Button("Send") { let text = prompt; prompt = ""; Task { await model.ask(text) } }
                            .disabled(model.busy || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || prompt.count > 4000)
                    }
                }
            }.navigationTitle("Ask Nexdo")
        }
    }
}

private struct AccountView: View {
    @EnvironmentObject var model: AppModel
    @State private var confirmsDeletion = false
    var body: some View {
        NavigationStack {
            Form {
                Section("Your account") { Text(model.profile?.name ?? ""); Text(model.profile?.email ?? ""); Text(model.profile?.timeZone ?? "") }
                Section("AI privacy") {
                    Text(model.aiConsent ? "OpenAI sharing is allowed for this session." : "OpenAI sharing is off.")
                    if model.aiConsent { Button("Withdraw AI permission") { model.withdrawConsent() }.disabled(model.busy) }
                }
                Section {
                    Button("Sign out") { Task { await model.logout() } }.disabled(model.busy)
                    Button("Delete account", role: .destructive) { confirmsDeletion = true }.disabled(model.busy)
                } footer: {
                    Text("Deleting your account permanently removes your Nexdo data and revokes Sign in with Apple when connected.")
                }
            }.navigationTitle("Account")
                .confirmationDialog("Permanently delete this account?", isPresented: $confirmsDeletion, titleVisibility: .visible) {
                    Button("Delete Account", role: .destructive) { Task { await model.deleteAccount() } }
                    Button("Cancel", role: .cancel) {}
                } message: { Text("This cannot be undone.") }
        }
    }
}
