import SwiftUI
import PhotosUI
import ImageIO
import AuthenticationServices

@MainActor
private final class CalendarOAuthCoordinator: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor() }
    // The URL already carries a short-lived connect token: the web session
    // cookie is not available to ASWebAuthenticationSession.
    func connectGoogle(url: URL, model: AppModel, completion: @escaping (String) -> Void) {
        session = ASWebAuthenticationSession(url: url, callbackURLScheme: "nexdo") { callback, error in
            Task { @MainActor in
                defer { self.session = nil }
                if let error { completion(Self.describe(error)); return }
                guard let callback else { completion("Google Calendar authorization was cancelled."); return }
                let query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
                if query.first(where: { $0.name == "calendar" })?.value == "error" || query.contains(where: { $0.name == "detail" }) {
                    let detail = query.first(where: { $0.name == "detail" })?.value ?? "authorization failed"
                    completion("Google Calendar connection failed: \(detail)"); return
                }
                do { try await model.reloadProfile(); completion("Google Calendar connected and synchronized.") }
                catch { completion("Google Calendar connected, but Nexdo could not refresh it yet.") }
            }
        }
        session?.presentationContextProvider = self
        session?.prefersEphemeralWebBrowserSession = false
        session?.start()
    }

    private static func describe(_ error: Error) -> String {
        if let sessionError = error as? ASWebAuthenticationSessionError, sessionError.code == .canceledLogin {
            return "Google Calendar connection failed: sign-in was cancelled or blocked. If Google showed “OAuth client was disabled”, enable that Web client in Google Cloud Console → APIs & Services → Credentials, and keep the redirect URI https://harbour-production-f8a0.up.railway.app/api/calendar/oauth/google/callback."
        }
        return "Google Calendar connection failed: \(error.localizedDescription)"
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
                    NavigationLink { ProfileSettingsView() } label: { menuRow("Edit profile and settings", "person.crop.circle") }
                    VStack(spacing: 0) {
                        webRow("Inbox", "tray", "/inbox")
                        webRow("Waiting For", "stopwatch", "/waiting")
                        webRow("AI Planner", "sparkles", "/planner")
                        webRow("Insights", "chart.bar", "/insights")
                        webRow("Notifications", "bell", "/notifications")
                        NavigationLink { ProfileSettingsView() } label: { menuRow("Settings", "slider.horizontal.3") }
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
            .task { await model.refreshVoiceUsage() }
        }.tint(.nexdoIndigo)
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
        guard let month,let date=DateFormatter.voiceMonth.date(from:month) else{return "This month · updated today"}
        return date.formatted(.dateTime.month(.wide))+" · updated today"
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
        Button { openURL(URL(string: "https://harbour-production-f8a0.up.railway.app" + path)!) } label: { menuRow(title, icon, web: true) }
            .accessibilityHint("Opens Nexdo in your browser")
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

private extension DateFormatter {
    static let voiceMonth:DateFormatter={let value=DateFormatter();value.locale=Locale(identifier:"en_US_POSIX");value.timeZone=TimeZone(secondsFromGMT:0);value.dateFormat="yyyy-MM";return value}()
}

struct ProfileSettingsView: View {
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system
    @AppStorage(AppVoice.volumeStorageKey) private var appVoiceVolume = AppVoice.defaultVolume
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
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
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                card("Appearance") {
                    Picker("Appearance", selection: $appearance) {
                        ForEach(AppAppearance.allCases) { choice in
                            Text(choice.title).tag(choice)
                        }
                    }.pickerStyle(.segmented)
                    Text("Day uses a light view. Night uses a dark view. System follows your iPhone. Changes apply immediately and are saved on this device.")
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
                        Toggle("Morning summary", isOn: pref(\.morningSummary))
                        Toggle("Evening summary", isOn: pref(\.eveningSummary))
                        Text("Manage delivery permissions and send tests in Notification Center.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        Button("Open Notification Center") { website("/notifications") }
                    }
                    card("Calendars and privacy") {
                        Text("Connect Google Calendar securely. You may need to sign in with Google.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        connectionList
                        Button(connecting ? "Connecting…" : (model.calendarConnections.isEmpty ? "Connect Google Calendar" : "Connect another calendar"), systemImage: "calendar.badge.plus") { connect() }
                        Button("Synchronize now", systemImage: "arrow.triangle.2.circlepath") { run { message = try await model.syncProfileCalendars() } }
                        Divider()
                        Text(model.aiConsent ? "OpenAI sharing is allowed for this session." : "OpenAI sharing is off.").font(.caption)
                        if model.aiConsent { Button("Withdraw AI permission") { model.withdrawConsent() } }
                        Button("Delete account", role: .destructive) { confirmsDeletion = true }
                    }
                    Button { save() } label: {
                        HStack { if saving { ProgressView().tint(.white) }; Text(saving ? "Saving…" : "Save settings").bold() }.frame(maxWidth: .infinity, minHeight: 50)
                    }.foregroundStyle(.white).background(NexdoTheme.saveGradient, in: Capsule())
                } else { Button("Retry loading settings") { Task { await load() } } }
                if let failure { Text(failure).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) }
                if let message { Label(message, systemImage: "checkmark.circle").foregroundStyle(Color.nexdoIndigo).accessibilityAddTraits(.updatesFrequently) }
            }.padding(20).disabled(saving || connecting)
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
    private enum OAuthError: LocalizedError { case message(String); var errorDescription: String? { if case .message(let value) = self { return value }; return "Calendar connection failed." } }
    @ViewBuilder private var connectionList: some View {
        if !model.calendarConnections.isEmpty {
            VStack(spacing: 10) {
                ForEach(model.calendarConnections) { connection in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: connection.isHealthy ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                .foregroundStyle(connection.isHealthy ? Color.nexdoIndigo : .orange)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(connection.displayName).font(.subheadline).bold()
                                Text(connection.detail).font(.caption).foregroundStyle(Color.nexdoSecondary)
                                if let synced = connection.lastSyncedDescription {
                                    Text(synced).font(.caption2).foregroundStyle(Color.nexdoSecondary)
                                }
                            }
                            .accessibilityElement(children: .combine)
                            Spacer(minLength: 8)
                            Button("Disconnect", role: .destructive) { disconnecting = connection }
                                .font(.caption).buttonStyle(.borderless)
                        }
                        Divider()
                        // Writes default to off on the server, so without this toggle the
                        // app only ever reads: scheduled tasks never reach the calendar.
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
        } else if model.calendarConnectionsLoaded {
            Text("No calendars connected yet.").font(.caption).foregroundStyle(Color.nexdoSecondary)
        }
    }
    private func connect() {
        guard !saving, !connecting else { return }
        connecting = true; failure = nil; message = nil
        Task {
            defer { connecting = false }
            do {
                let url = try await model.calendarConnectURL()
                message = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
                    calendarOAuth.connectGoogle(url: url, model: model) { result in
                        if result.contains("connected") { continuation.resume(returning: result) }
                        else { continuation.resume(throwing: OAuthError.message(result)) }
                    }
                }
                await model.loadCalendarConnections()
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
    private func website(_ path: String) { openURL(URL(string: "https://harbour-production-f8a0.up.railway.app" + path)!) }
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
