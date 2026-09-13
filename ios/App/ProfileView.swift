import SwiftUI
import PhotosUI
import ImageIO
import AuthenticationServices

@MainActor
private final class CalendarOAuthCoordinator: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor() }
    func connectGoogle(model: AppModel, completion: @escaping (String) -> Void) {
        guard let url = URL(string: "https://harbour-production-f8a0.up.railway.app/api/calendar/oauth/google/start?native=1") else { completion("Invalid calendar connection URL."); return }
        session = ASWebAuthenticationSession(url: url, callbackURLScheme: "nexdo") { callback, error in
            Task { @MainActor in
                defer { self.session = nil }
                if let error { completion(error.localizedDescription); return }
                guard let callback else { completion("Google Calendar authorization was cancelled."); return }
                let query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
                if let detail = query.first(where: { $0.name == "detail" })?.value { completion("Google Calendar connection failed: \(detail)"); return }
                do { try await model.reloadProfile(); completion("Google Calendar connected and synchronized.") }
                catch { completion("Google Calendar connected, but Nexdo could not refresh it yet.") }
            }
        }
        session?.presentationContextProvider = self
        session?.prefersEphemeralWebBrowserSession = false
        session?.start()
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
                    NavigationLink { ProfileSettingsView() } label: { menuRow("Edit profile and settings", "person.crop.circle") }
                    VStack(spacing: 0) {
                        webRow("Inbox", "tray", "/inbox")
                        NavigationLink { TasksView() } label: { menuRow("Tasks", "checkmark.circle") }
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
            .background(ProfileBackground()).navigationTitle("More").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close", systemImage: "xmark") { closeAccount() }.labelStyle(.iconOnly) } }
            .confirmationDialog("Sign out of Nexdo?", isPresented: $confirmsSignOut) {
                Button("Sign out", role: .destructive) { Task { await model.logout(); if model.profile == nil { dismiss() } } }
            }
        }.tint(.nexdoIndigo)
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

struct ProfileSettingsView: View {
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system
    @EnvironmentObject private var model: AppModel
    @Environment(\.openURL) private var openURL
    @State private var name = ""
    @State private var zone = ""
    @State private var preferences: ProfilePreferences?
    @State private var next = NextActionPreference(enabled: false, switchingThreshold: 10)
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var savingPhoto = false
    @State private var photoMessage: String?
    @State private var saving = false
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
                            Picker("Time zone", selection: $zone) { ForEach(TimeZone.knownTimeZoneIdentifiers, id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ")).tag($0) } }.pickerStyle(.navigationLink)
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
                        Toggle("SMS notifications", isOn: pref(\.smsEnabled))
                        Toggle("Morning summary", isOn: pref(\.morningSummary))
                        Toggle("Evening summary", isOn: pref(\.eveningSummary))
                        field("SMS phone number", text: Binding(get: { preferences?.phoneNumber ?? "" }, set: { preferences?.phoneNumber = $0 }), placeholder: "+15551234567").keyboardType(.phonePad)
                        Text("Manage delivery permissions and send tests in Notification Center.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        Button("Open Notification Center") { website("/notifications") }
                    }
                    card("Calendars and privacy") {
                        Text("Connect Google Calendar securely. You may need to sign in with Google.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        Button("Connect Google Calendar", systemImage: "calendar.badge.plus") {
                            run { try await withCheckedThrowingContinuation { continuation in
                                calendarOAuth.connectGoogle(model: model) { result in
                                    if result.contains("failed") || result.contains("cancelled") { continuation.resume(throwing: OAuthError.message(result)) }
                                    else { message = result; continuation.resume(returning: ()) }
                                }
                            }}
                        }
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
            }.padding(20).disabled(saving)
        }
        .background(ProfileBackground()).navigationTitle("Settings").navigationBarTitleDisplayMode(.large)
        .task { if loading { await load() } }
        .interactiveDismissDisabled(saving)
        .navigationBarBackButtonHidden(saving)
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
        .confirmationDialog("Permanently delete this account?", isPresented: $confirmsDeletion, titleVisibility: .visible) {
            Button("Delete account", role: .destructive) { Task { await model.deleteAccount() } }
        } message: { Text("This removes your Nexdo data permanently and cannot be undone.") }
    }
    private enum OAuthError: LocalizedError { case message(String); var errorDescription: String? { if case .message(let value) = self { return value }; return "Calendar connection failed." } }
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
        do { try await model.reloadProfile(); name = model.profile?.name ?? ""; zone = model.profile?.timeZone ?? ""; preferences = model.profile?.preference; next = model.profile?.nextAction ?? next
            if preferences == nil { failure = "Settings are unavailable. Please retry." }
        } catch { failure = error.localizedDescription }
    }
    private func run(_ operation: @escaping @MainActor () async throws -> Void) {
        guard !saving else { return }; saving = true; failure = nil; message = nil
        Task { defer { saving = false }; do { try await operation() } catch { failure = error.localizedDescription } }
    }
    private func save() {
        guard let preferences else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 80 else { failure = "Enter a display name of 1–80 characters."; return }
        guard preferences.workStart < preferences.workEnd else { failure = "Working hours must end after they start."; return }
        let phone = normalizePhone(preferences.phoneNumber)
        guard phone != nil || preferences.phoneNumber?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false else {
            failure = "Enter a valid phone number, including country code (for example, +15551234567)."
            return
        }
        var normalizedPreferences = preferences
        normalizedPreferences.phoneNumber = phone
        self.preferences = normalizedPreferences
        run {
            try await model.saveProfileSettings(ProfileSettingsInput(name: trimmed, timeZone: zone, preference: normalizedPreferences, nextAction: next))
            message = "Settings saved."
        }
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
