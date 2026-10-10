import SwiftUI
import PhotosUI
import EventKit
import ImageIO
import AuthenticationServices

@MainActor
final class CalendarOAuthCoordinator: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private var completion: ((CalendarOAuthResult) -> Void)?
    private var generation = UUID()
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
    // Reuse the authenticated server's short-lived start URL; no provider tokens live in the UI.
    func connect(url: URL, providerName: String = "Google", completion: @escaping (CalendarOAuthResult) -> Void) {
        guard session == nil else { completion(.failed("A calendar connection is already in progress.")); return }
        self.completion = completion
        let generation = UUID()
        self.generation = generation
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "nexdo") { [weak self] callback, error in
            Task { @MainActor in
                guard let self, self.generation == generation else { return }
                let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                self.finish(CalendarOAuthResult(callback: callback, cancelled: cancelled,
                    error: cancelled ? nil : error?.localizedDescription, providerName: providerName))
            }
        }
        self.session = session
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        if !session.start() { finish(.failed("Could not open sign-in. Please try again.")) }
    }
    func cancel() {
        session?.cancel()
        finish(.cancelled)
    }
    private func finish(_ result: CalendarOAuthResult) {
        let callback = completion
        completion = nil; session = nil; generation = UUID()
        callback?(result)
    }
}

struct ProfileAvatar: View {
    @EnvironmentObject private var model: AppModel
    let name: String
    var size: CGFloat = 76
    private var photo: UIImage? {
        guard let value = model.profile?.photo, let payload = value.split(separator: ",").last,
              let data = Data(base64Encoded: String(payload)) else { return nil }
        return UIImage(data: data)
    }
    var body: some View {
        ZStack {
            Circle().fill(NexdoTheme.gradient)
            if let photo { Image(uiImage: photo).resizable().scaledToFill() }
            else { Text(ProfileName.firstName(from: name)?.prefix(1).uppercased() ?? "U").font(.system(size: size * 0.4, weight: .bold)).foregroundStyle(.white) }
        }
        .frame(width: size, height: size).clipShape(Circle())
        .overlay(Circle().stroke(.white, lineWidth: 2))
        .accessibilityLabel("Profile picture")
    }
}

struct AccountView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var confirmsSignOut = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 14) {
                        ProfileAvatar(name: model.profile?.name ?? "")
                        VStack(alignment: .leading, spacing: 4) {
                            Text(model.profile?.name ?? "Your profile").font(.title3.bold())
                            Text(model.profile?.email ?? "").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        }
                    }.padding(.vertical, 8)
                    voiceUsageCard
                    // Keep account actions together in one card.
                    VStack(spacing: 0) {
                        NavigationLink { ProfileSettingsView() } label: { menuRow("Edit profile and settings", "person.crop.circle") }
                        NavigationLink { FeedbackView() } label: { menuRow("Feedback", "bubble.left.and.text.bubble.right") }
                        NavigationLink { HelpView() } label: { menuRow("Help", "questionmark.circle") }
                        Button { BugReportCoordinator.shared.open(from: "settings") } label: { menuRow("Report Bugs", "ladybug") }
                        NavigationLink { ChangePasswordView() } label: { menuRow("Change password", "lock.rotation") }
                    }.padding(8).profileCard()
                    Button("Sign out", role: .destructive) { confirmsSignOut = true }
                        .frame(maxWidth: .infinity, minHeight: 46).background(.background, in: RoundedRectangle(cornerRadius: 14))
                        .disabled(model.busy)
                }.padding(20)
            }
            .background(ProfileBackground()).navigationTitle("My Page").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close", systemImage: "xmark") { closeAccount() }.labelStyle(.iconOnly) } }
            .confirmationDialog("Sign out of Nexdo?", isPresented: $confirmsSignOut) {
                Button("Sign out", role: .destructive) { Task { await model.logout(); if model.profile == nil { dismiss() } } }
            }
            .task {
                try? await model.reloadProfile()
                await model.refreshVoiceUsage()
            }
        }.tint(.nexdoIndigo).bugReportScreen("settings")
    }

    private var voiceUsageCard:some View {
        let usage=model.voiceUsage
        let used=usage?.usedSeconds ?? 0
        let limit=usage?.limitMinutes ?? 100
        let remaining=usage?.remainingSeconds ?? limit*60
        return VStack(alignment:.leading,spacing:14){
            HStack(alignment:.top,spacing:12){
                Image(systemName:"waveform.circle.fill").font(.title2).foregroundStyle(Color.white)
                    .frame(width:44,height:44).background(NexdoTheme.gradient,in:Circle())
                VStack(alignment:.leading,spacing:3){
                    Text("Real-time Voice").font(.headline).foregroundStyle(Color.nexdoInk)
                    Text("Monthly usage").font(.caption).foregroundStyle(Color.nexdoSecondary)
                }
                Spacer()
                Text(voiceMinutes(used)).font(.title3.bold()).foregroundStyle(Color.nexdoIndigo).monospacedDigit()
            }
            ProgressView(value:usage?.progress ?? 0)
                .tint(.nexdoBlue).scaleEffect(x:1,y:1.8,anchor:.center)
                .accessibilityLabel("Real-time voice usage")
                .accessibilityValue("\(voiceMinutes(used)) used out of \(limit) minutes this month")
            HStack{
                Text("\(voiceMinutes(used)) used")
                Spacer()
                Text("\(voiceMinutes(remaining)) remaining")
            }.font(.caption.weight(.medium)).foregroundStyle(Color.nexdoSecondary).monospacedDigit()
            HStack{
                Label(monthLabel(usage?.month),systemImage:"calendar")
                Spacer()
                Text("\(limit) min / month")
            }.font(.caption2).foregroundStyle(Color.nexdoSecondary)
        }.padding(16).profileCard()
    }

    private func voiceMinutes(_ seconds:Int)->String {
        if seconds==0{return "0 min"}
        if seconds<60{return "<1 min"}
        let minutes=Double(seconds)/60
        return minutes<10 ? String(format:"%.1f min",minutes):"\(Int(minutes.rounded())) min"
    }

    private func monthLabel(_ month:String?)->String {
        guard let month, let name = VoiceUsage.monthName(month) else { return "This month · updated today" }
        return name + " · updated today"
    }

    private func closeAccount() {
        dismiss()
    }

    private func menuRow(_ title: String, _ icon: String, web: Bool = false) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon).frame(width: 24).foregroundStyle(Color.nexdoIndigo)
            Text(title).foregroundStyle(Color.nexdoInk)
            Spacer()
            Image(systemName: web ? "arrow.up.right" : "chevron.right").font(.caption).foregroundStyle(Color.nexdoSecondary)
        }.padding(.horizontal, 12).frame(minHeight: 50).contentShape(Rectangle())
    }
    private func webRow(_ title: String, _ icon: String, _ path: String) -> some View {
        Button { openURL(AppEnvironment.web(path)) } label: { menuRow(title, icon, web: true) }
            .accessibilityHint("Opens Nexdo in your browser")
    }
}

private struct ChangePasswordView: View {
    @EnvironmentObject private var model: AppModel
    @State private var current = ""
    @State private var new = ""
    @State private var confirmation = ""
    @State private var confirming = false
    @State private var showsPasswordReset = false
    @State private var saving = false
    @State private var failure: String?
    @State private var resettingPassword = false
    private var valid: Bool {
        !current.isEmpty && new.count >= 12 && new.utf8.count <= 72 && new == confirmation && new != current
    }
    var body: some View {
        Form {
            Section {
                SecureField("Current password", text: $current).textContentType(.password)
                SecureField("New password", text: $new).textContentType(.newPassword)
                SecureField("Confirm new password", text: $confirmation).textContentType(.newPassword)
            } footer: {
                Text("Use at least 12 characters (72 bytes maximum). You’ll need to sign in again after changing your password.")
            }
            Section {
                Button("Forgot password?") { showsPasswordReset = true }
                    .accessibilityIdentifier("change-password-forgot")
            }
            if !confirmation.isEmpty && new != confirmation {
                Text("The new passwords do not match.").foregroundStyle(.red)
            }
            if let failure { Text(failure).foregroundStyle(.red) }
            Button { confirming = true } label: {
                Text(saving ? "Changing password…" : "Change password").frame(maxWidth: .infinity)
            }.buttonStyle(NexdoGradientButtonStyle()).disabled(!valid || saving)
            Section {
                Button("Forgot password?") { resettingPassword = true }
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
            } footer: {
                Text("We’ll email you a code to set a new password. You’ll need to sign in again afterwards.")
            }
        }
        .sheet(isPresented: $showsPasswordReset) {
            PasswordResetView(initialEmail: model.profile?.email ?? "")
        }
        .disabled(saving)
        .sheet(isPresented: $resettingPassword) {
            PasswordResetView(initialEmail: model.profile?.email ?? "") { Task { await model.reset() } }
        }
        .navigationTitle("Change password").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(saving)
        .interactiveDismissDisabled(saving)
        .alert("Change password and sign out?", isPresented: $confirming) {
            Button("Cancel", role: .cancel) {}
            Button("Change password") { Task { await save() } }
        } message: {
            Text("After your password is changed, you’ll be signed out and must sign in again using your new password. Continue?")
        }
    }
    @MainActor private func save() async {
        guard valid, !saving else { return }
        saving = true; failure = nil
        defer { saving = false }
        do {
            try await model.changePassword(current: current, new: new, confirmation: confirmation)
            current = ""; new = ""; confirmation = ""
        } catch { failure = error.localizedDescription }
    }
}

private struct ProfileBackground: View {
    var body: some View { LinearGradient(colors: [Color.nexdoBlue.opacity(0.09), Color.nexdoMagenta.opacity(0.06), Color(uiColor: .systemBackground)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea() }
}
private extension View {
    func profileCard() -> some View {
        self.background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.nexdoIndigo.opacity(0.13)))
    }
}


struct ProfileSettingsView: View {
    var openCalendarSettings = false
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system
    @AppStorage(AppVoice.volumeStorageKey) private var appVoiceVolume = AppVoice.defaultVolume
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var appleCalendarAccess = false
    @State private var appleCalendarCount = 0
    @Environment(\.openURL) private var openURL
    @State private var name = ""
    @State private var zone = ""
    @State private var preferences: ProfilePreferences?
    @State private var next = NextActionPreference(enabled: false, switchingThreshold: 10)
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var savingPhoto = false
    @State private var photoMessage: String?
    @State private var saving = false
    // Kept apart from `saving` so the OAuth sheet never leaves Save stuck on "Saving…".
    @State private var connecting = false
    @State private var disconnecting: CalendarConnection?
    @State private var loading = true
    @State private var message: String?
    @State private var failure: String?
    @State private var confirmsDeletion = false
    @StateObject private var calendarOAuth = CalendarOAuthCoordinator()

    var body: some View {
        ScrollViewReader { scrollProxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                card("Appearance") {
                    Picker("Appearance", selection: $appearance) {
                        ForEach(AppAppearance.allCases) { choice in
                            Text(choice.title).tag(choice)
                        }
                    }.pickerStyle(.segmented)
                    Text("Day uses a light view. Night uses a dark view. System follows your phone. Changes apply immediately and are saved on this device.")
                        .font(.caption).foregroundStyle(Color.nexdoSecondary)
                }
                card("App Voice") {
                    HStack {
                        Label("AI speaking volume", systemImage: "speaker.wave.2")
                        Spacer()
                        Text("\(Int((appVoiceVolume * 100).rounded()))%")
                            .foregroundStyle(Color.nexdoSecondary).monospacedDigit()
                    }
                    Slider(value: $appVoiceVolume, in: 0...1, step: 0.05) {
                        Text("AI speaking volume")
                    } minimumValueLabel: {
                        Image(systemName: "speaker.fill")
                    } maximumValueLabel: {
                        Image(systemName: "speaker.wave.3.fill")
                    }
                    .accessibilityValue("\(Int((appVoiceVolume * 100).rounded())) percent")
                    Text("Adjusts Nexdo’s spoken responses immediately. This setting is saved on this device.")
                        .font(.caption).foregroundStyle(Color.nexdoSecondary)
                }
                card("Profile picture") {
                    HStack(spacing: 18) {
                        ProfileAvatar(name: name)
                        VStack(alignment: .leading, spacing: 12) {
                            PhotosPicker(selection: $selectedPhoto, matching: .images, preferredItemEncoding: .compatible) { Label("Change photo", systemImage: "photo") }
                                .disabled(loading)
                            if model.profile?.photo != nil { Button("Remove photo", role: .destructive) { run { try await model.saveProfilePhoto(nil); message = "Profile picture removed." } } }
                        }
                    }
                    Text("Choose a photo from your library. Your picture is saved to your Nexdo account.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    if savingPhoto { ProgressView("Saving profile photo…") }
                    if let photoMessage { Text(photoMessage).font(.caption).foregroundStyle(Color.nexdoIndigo).accessibilityAddTraits(.updatesFrequently) }
                }
                if loading { ProgressView("Loading settings…").frame(maxWidth: .infinity) }
                else if preferences != nil {
                    card("Profile and time") {
                        field("Display name", text: $name)
                        VStack(alignment: .leading, spacing: 8) {
                            LabeledContent("Time zone (Automatic)", value: TimeZone.autoupdatingCurrent.identifier.replacingOccurrences(of: "_", with: " "))
                        }
                        hours("Working hours", start: pref(\.workStart), end: pref(\.workEnd))
                        hours("Quiet hours", start: pref(\.quietStart), end: pref(\.quietEnd))
                    }
                    card("Voice and confirmation") {
                        Picker("AI confirmation", selection: pref(\.confirmationLevel)) {
                            Text("Always confirm").tag("ALWAYS")
                            Text("Confirm changes and deletions").tag("CHANGES_AND_DELETES")
                            Text("Execute routine actions").tag("ROUTINE_AUTO")
                        }.pickerStyle(.menu)
                        Toggle("Enable spoken replies", isOn: pref(\.voiceEnabled))
                        Divider()
                        Toggle("Personalized predictions", isOn: pref(\.personalizationEnabled))
                        Text("Learn from task timing, completion, postponements, and reminder outcomes. Off by default.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    }
                    card("Notifications and focus") {
                        Toggle("Suggest my next action", isOn: $next.enabled)
                        Picker("Protect my current focus", selection: $next.switchingThreshold) {
                            Text("Flexible").tag(5); Text("Balanced").tag(10); Text("Strong").tag(25)
                        }
                        Text("Suggestions respect your working hours, quiet hours, and active focus.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        Toggle("Push notifications", isOn: pref(\.pushEnabled))
                        Toggle("Email notifications", isOn: pref(\.emailEnabled))
                        Toggle("Daily morning email · 6:00 a.m.", isOn: pref(\.morningSummary))
                        Text("Today’s tasks, calendar events and conflicts, sent to \(model.profile?.email ?? "your profile email") at 6:00 a.m. in \(model.profile?.timeZone ?? TimeZone.current.identifier). Email notifications must also be enabled.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        Toggle("Evening summary", isOn: pref(\.eveningSummary))
                        Text("Manage delivery permissions and send tests in Notification Center.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        Button("Open Notification Center") { website("/notifications") }
                    }
                    card("Calendars & Privacy") {
                        Text("Connect your calendar to keep your plans and important moments together.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        connectionList
                        if appleCalendarAccess { appleCalendarCard }
                        if let error = model.calendarConnectionsError {
                            Text(error).font(.caption).foregroundStyle(.red)
                            Button("Retry connection status") { Task { await model.loadCalendarConnections() } }
                        }
                        NavigationLink { CalendarConnectionView() } label: {
                            Label("Connect Calendar", systemImage: "calendar.badge.plus")
                        }.accessibilityIdentifier("settings-connect-calendar")
                        Button("Synchronize now", systemImage: "arrow.triangle.2.circlepath") { run { message = try await model.syncProfileCalendars() } }
                        Divider()
                        Text(model.aiConsent ? "OpenAI sharing is allowed for this session." : "OpenAI sharing is off.").font(.caption)
                        if model.aiConsent { Button("Withdraw AI permission") { model.withdrawConsent() } }
                        Link(destination: LegalLinks.privacyPolicy) { Label(LegalLinks.privacyPolicyTitle, systemImage: "hand.raised") }
                            .accessibilityIdentifier("settings-privacy-policy")
                        Link(destination: LegalLinks.termsOfService) { Label(LegalLinks.termsOfServiceTitle, systemImage: "doc.text") }
                            .accessibilityIdentifier("settings-terms-of-service")
                        Button("Delete account", role: .destructive) { confirmsDeletion = true }
                    }.id("calendar-settings")
                    Button { save() } label: {
                        HStack { if saving { ProgressView().tint(.white) }; Text(saving ? "Saving…" : "Save settings").bold() }.frame(maxWidth: .infinity, minHeight: 50)
                    }.foregroundStyle(.white).background(NexdoTheme.saveGradient, in: Capsule())
                } else { Button("Retry loading settings") { Task { await load() } } }
                if let failure { Text(failure).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) }
                if let message { Label(message, systemImage: "checkmark.circle").foregroundStyle(Color.nexdoIndigo).accessibilityAddTraits(.updatesFrequently) }
            }.padding(20).disabled(saving || connecting)
        }
        .onChange(of: loading) { _, isLoading in
            if !isLoading && openCalendarSettings { scrollProxy.scrollTo("calendar-settings", anchor: .top) }
        }
        }
        .background(ProfileBackground()).navigationTitle("Settings").navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { saveAndDismiss() } label: {
                    Image(systemName: "chevron.backward")
                }
                .accessibilityLabel("Save settings and go back")
                .disabled(loading || saving || connecting)
            }
        }
        .task { if loading { await load() } }
        .task(id: model.profile?.id) { await refreshAppleCalendarStatus() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await refreshAppleCalendarStatus() } }
        }
        .onReceive(NotificationCenter.default.publisher(for: AppleCalendarSelection.changed)) { _ in
            Task { await refreshAppleCalendarStatus() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged)) { _ in
            Task { await refreshAppleCalendarStatus() }
        }
        .interactiveDismissDisabled(saving || connecting)
        .navigationBarBackButtonHidden(true)
        .alert("Could not update profile", isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
            Button("OK", role: .cancel) { failure = nil }
        } message: { Text(failure ?? "") }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            run {
                savingPhoto = true
                photoMessage = nil
                defer { savingPhoto = false; selectedPhoto = nil }
                guard let data = try await item.loadTransferable(type: Data.self) else { throw ProfilePhotoEncoder.Failure.invalid }
                try await model.saveProfilePhoto(ProfilePhotoEncoder.encode(data))
                photoMessage = "Profile picture saved."
            }
        }
        .onChange(of: appVoiceVolume) { _, _ in AppVoice.notifyVolumeChanged() }
        .confirmationDialog(
            "Disconnect \(disconnecting?.displayName ?? "this calendar")?",
            isPresented: Binding(get: { disconnecting != nil }, set: { if !$0 { disconnecting = nil } }),
            titleVisibility: .visible
        ) {
            Button("Disconnect", role: .destructive) {
                guard let connection = disconnecting else { return }
                disconnecting = nil
                run { message = try await model.disconnectCalendar(id: connection.id) }
            }
            Button("Keep it", role: .cancel) { disconnecting = nil }
        } message: { Text("Events imported from this calendar are removed with the connection.") }
        .confirmationDialog("Permanently delete this account?", isPresented: $confirmsDeletion, titleVisibility: .visible) {
            Button("Delete account", role: .destructive) { Task { await model.deleteAccount() } }
        } message: { Text("This removes your Nexdo data permanently and cannot be undone.") }
    }
    private var appleCalendarCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                CalendarEventProviderIcon(source: "apple-device")
                VStack(alignment: .leading, spacing: 2) {
                    Text("Apple Calendar").font(.subheadline.bold())
                    Text("Connected on this iPhone").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    Text(appleCalendarCount == 0 ? "No calendars selected" : "\(appleCalendarCount) calendar\(appleCalendarCount == 1 ? "" : "s") selected")
                        .font(.caption2).foregroundStyle(Color.nexdoSecondary)
                }
                Spacer(minLength: 8)
            }
            Divider()
            NavigationLink { AppleCalendarSelectionView() } label: {
                Label("Manage Apple calendars", systemImage: "slider.horizontal.3")
            }.font(.subheadline)
            Text("Selected events appear in NexDo. Manage calendar access in iPhone Settings. NexDo does not add tasks or events to Apple Calendar.")
                .font(.caption2).foregroundStyle(Color.nexdoSecondary)
        }
        .padding(12)
        .background(Color.nexdoIndigo.opacity(0.035), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.nexdoIndigo.opacity(0.16)))
        .accessibilityIdentifier("settings-apple-calendar")
    }
    private func refreshAppleCalendarStatus() async {
        let owner = model.profile?.id
        let choices = await AppleCalendarService.shared.calendars()
        guard owner == model.profile?.id, !Task.isCancelled else { return }
        appleCalendarAccess = EKEventStore.authorizationStatus(for: .event) == .fullAccess
        let selected = owner.flatMap { AppleCalendarSelection.selectedIDs(owner: $0) }
        appleCalendarCount = choices.filter { selected?.contains($0.id) ?? true }.count
    }
    @ViewBuilder private var connectionList: some View {
        if !model.calendarConnections.isEmpty {
            VStack(spacing: 10) {
                ForEach(model.calendarConnections) { connection in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top, spacing: 12) {
                            CalendarEventProviderIcon(source: connection.provider)
                                .overlay(alignment: .bottomTrailing) {
                                    if !connection.isHealthy {
                                        Image(systemName: "exclamationmark.triangle.fill")
                                            .font(.caption2).foregroundStyle(.orange)
                                    }
                                }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(connection.displayName).font(.subheadline).bold()
                                Text(connection.detail).font(.caption).foregroundStyle(Color.nexdoSecondary)
                                // Re-rendered every minute, and when Synchronize now reloads the connections.
                                TimelineView(.everyMinute) { context in
                                    Text(connection.lastSyncedText(now: context.date)).font(.caption2).foregroundStyle(Color.nexdoSecondary)
                                }
                            }
                            .accessibilityElement(children: .combine)
                            Spacer(minLength: 8)
                            VStack(alignment: .trailing, spacing: 8) {
                                if connection.needsReconnect {
                                    Button("Reconnect") { connect(reconnecting: connection) }
                                        .font(.caption.bold()).buttonStyle(.borderless)
                                        .accessibilityLabel("Reconnect \(connection.displayName)")
                                        .accessibilityIdentifier("calendar-reconnect-\(connection.id)")
                                }
                                Button("Disconnect", role: .destructive) { disconnecting = connection }
                                    .font(.caption).buttonStyle(.borderless)
                            }
                        }
                        Divider()
                        // Reflect the stored write preference; users can disable calendar writes here.
                        Toggle("Add my scheduled tasks and events here", isOn: Binding(
                            get: { connection.writeEnabled },
                            set: { enabled in run { message = try await model.setCalendarWrites(id: connection.id, enabled: enabled) } }
                        )).font(.subheadline)
                        if !connection.writeEnabled {
                            Text("Read-only: events come into Nexdo, but tasks and events you create in Nexdo are not added to this calendar.")
                                .font(.caption2).foregroundStyle(Color.nexdoSecondary)
                        }
                    }
                    .padding(12)
                    .background(Color.nexdoIndigo.opacity(0.035), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.nexdoIndigo.opacity(0.16)))
                }
            }
        } else if model.calendarConnectionsLoaded && !appleCalendarAccess {
            Text("No calendars connected yet.").font(.caption).foregroundStyle(Color.nexdoSecondary)
        }
    }
    /// Starts Google sign-in. With `reconnecting`, the same flow renews that row's account:
    /// the server updates the existing connection when the same Google account signs in.
    private func connect(reconnecting connection: CalendarConnection? = nil) {
        guard !saving, !connecting else { return }
        connecting = true; failure = nil; message = nil
        Task {
            defer { connecting = false }
            do {
                let provider = connection?.provider.lowercased() ?? "google"
                let providerName = provider == "microsoft" ? "Microsoft" : "Google"
                let url = try await model.calendarConnectURL(provider: provider)
                let result = await withCheckedContinuation { (continuation: CheckedContinuation<CalendarOAuthResult, Never>) in
                    calendarOAuth.connect(url: url, providerName: providerName) { continuation.resume(returning: $0) }
                }
                switch result {
                case .cancelled: return
                case .failed(let detail): failure = detail; return
                case .connected: break
                }
                let refreshed = (try? await model.reloadProfile()) != nil
                await model.loadCalendarConnections()
                if let connection, model.calendarConnections.first(where: { $0.id == connection.id })?.needsReconnect ?? false {
                    failure = "\(connection.displayName) still needs reconnecting. Choose \(connection.accountEmail ?? "the same account") on \(providerName)’s sign-in page."
                } else if connection != nil {
                    message = "\(providerName) Calendar reconnected and synchronized."
                } else {
                    message = refreshed ? "\(providerName) Calendar connected and synchronized." : "\(providerName) Calendar connected, but Nexdo could not refresh it yet."
                }
            } catch { failure = error.localizedDescription }
        }
    }
    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 16) { Text(title).font(.headline); content() }.frame(maxWidth: .infinity, alignment: .leading).padding(18).profileCard()
    }
    private func field(_ title: String, text: Binding<String>, placeholder: String = "") -> some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.subheadline); TextField(placeholder, text: text).textInputAutocapitalization(title == "Display name" ? .words : .never).autocorrectionDisabled().padding(12).background(Color.nexdoIndigo.opacity(0.035), in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.nexdoIndigo.opacity(0.16))) }
    }
    private func pref<T>(_ key: WritableKeyPath<ProfilePreferences, T>) -> Binding<T> { Binding(get: { preferences![keyPath: key] }, set: { preferences?[keyPath: key] = $0 }) }
    private func clock(_ value: Binding<String>) -> Binding<Date> {
        Binding(get: {
            let parts = value.wrappedValue.split(separator: ":").compactMap { Int($0) }
            return Calendar.current.date(from: DateComponents(year: 2001, month: 1, day: 1, hour: parts.first ?? 9, minute: parts.last ?? 0)) ?? Date()
        }, set: { let c = Calendar.current.dateComponents([.hour, .minute], from: $0); value.wrappedValue = String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0) })
    }
    private func hours(_ title: String, start: Binding<String>, end: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.subheadline); HStack { DatePicker("Start", selection: clock(start), displayedComponents: .hourAndMinute); DatePicker("End", selection: clock(end), displayedComponents: .hourAndMinute) }.font(.caption) }
    }
    private func website(_ path: String) { openURL(AppEnvironment.web(path)) }
    private func load() async {
        loading = true; failure = nil
        defer { loading = false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-profile-design-preview") {
            name = model.profile?.name ?? "Preview"; zone = "America/Los_Angeles"
            preferences = try? JSONDecoder().decode(ProfilePreferences.self, from: Data(#"{"workStart":"08:00","workEnd":"17:00","quietStart":"21:00","quietEnd":"07:00","confirmationLevel":"CHANGES_AND_DELETES","voiceEnabled":true,"personalizationEnabled":false,"pushEnabled":true,"emailEnabled":true,"smsEnabled":false,"morningSummary":true,"eveningSummary":true}"#.utf8))
            return
        }
        #endif
        await model.loadCalendarConnections()
        do { try await model.reloadProfile(); name = model.profile?.name ?? ""; zone = model.profile?.timeZone ?? ""; preferences = model.profile?.preference; next = model.profile?.nextAction ?? next
            if preferences == nil { failure = "Settings are unavailable. Please retry." }
        } catch { failure = error.localizedDescription }
    }
    private func run(_ operation: @escaping @MainActor () async throws -> Void) {
        guard !saving else { return }; saving = true; failure = nil; message = nil
        Task { defer { saving = false }; do { try await operation() } catch { failure = error.localizedDescription } }
    }
    private func save() {
        guard let input = settingsInput() else { return }
        run {
            try await model.saveProfileSettings(input)
            message = "Settings saved."
        }
    }

    private func saveAndDismiss() {
        guard let input = settingsInput(), !saving else { return }
        saving = true
        failure = nil
        Task {
            defer { saving = false }
            do {
                try await model.saveProfileSettings(input)
                dismiss()
            } catch {
                failure = error.localizedDescription
            }
        }
    }

    private func settingsInput() -> ProfileSettingsInput? {
        guard let preferences else { return nil }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 80 else { failure = "Enter a display name of 1–80 characters."; return nil }
        guard preferences.workStart < preferences.workEnd else { failure = "Working hours must end after they start."; return nil }
        let phone = normalizePhone(preferences.phoneNumber)
        guard phone != nil || preferences.phoneNumber?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false else {
            failure = "Enter a valid phone number, including country code (for example, +15551234567)."
            return nil
        }
        var normalizedPreferences = preferences
        normalizedPreferences.phoneNumber = phone
        self.preferences = normalizedPreferences
        return ProfileSettingsInput(name: trimmed, timeZone: TimeZone.autoupdatingCurrent.identifier, preference: normalizedPreferences, nextAction: next)
    }

    /// Accept friendly punctuation and US 10-digit numbers, while sending the
    /// E.164 form required by the server and SMS providers.
    private func normalizePhone(_ raw: String?) -> String? {
        let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if value.isEmpty { return nil }
        let digits = value.filter(\.isNumber)
        if value.hasPrefix("+") {
            guard digits.count >= 8, digits.count <= 15, digits.first != "0" else { return nil }
            return "+" + digits
        }
        guard digits.count == 10 else { return nil }
        return "+1" + digits
    }
}
