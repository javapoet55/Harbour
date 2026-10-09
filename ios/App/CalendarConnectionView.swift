import SwiftUI
import EventKit

/// Provider selection and consent guidance. Authentication still uses the server's OAuth flow.
struct CalendarConnectionView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var appleAccess = EKEventStore.authorizationStatus(for: .event) == .fullAccess
    @State private var provider: CalendarConnectProvider?
    private let ink = Color(red: 0.06, green: 0.05, blue: 0.25)

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                CalendarConnectIllustration().padding(.vertical, 12).accessibilityHidden(true)
                VStack(spacing: 10) {
                    Text("Connect Your Calendar").font(.largeTitle.bold()).multilineTextAlignment(.center)
                    Text("Keep your events, reminders, and important moments together in NexDo.")
                        .font(.subheadline).foregroundStyle(ink.opacity(0.7)).multilineTextAlignment(.center)
                }
                VStack(spacing: 12) {
                    ForEach(CalendarConnectProvider.allCases) { item in
                        Button { provider = item } label: {
                            HStack(spacing: 16) {
                                CalendarProviderIcon(provider: item, size: 46)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(item.title).font(.headline)
                                    Text(item == .apple ? "Connect your iPhone calendars" : "Connect your \(item.name) account")
                                        .font(.caption).foregroundStyle(ink.opacity(0.7))
                                    if isConnected(item) {
                                        Label("Connected", systemImage: "checkmark.circle.fill")
                                            .font(.caption.weight(.medium)).foregroundStyle(Color(red: 0.02, green: 0.42, blue: 0.20))
                                    } else if model.calendarConnections.contains(where: { $0.provider.lowercased() == item.rawValue && $0.needsReconnect }) {
                                        Label("Needs reconnecting", systemImage: "exclamationmark.circle").font(.caption).foregroundStyle(.orange)
                                    }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.body.weight(.semibold))
                            }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
                                .background(.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 24))
                        }.buttonStyle(.plain).accessibilityIdentifier("calendar-provider-\(item.rawValue)")
                    }
                }
                if let error = model.calendarConnectionsError {
                    Text(error).font(.footnote).foregroundStyle(.red)
                    Button("Retry connection status") { Task { await model.loadCalendarConnections() } }
                        .frame(minHeight: 44)
                }
                Label {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Your data stays private").font(.subheadline.bold())
                        Text("We only access the calendar information you allow. You can disconnect anytime.").font(.footnote)
                    }
                } icon: { Image(systemName: "lock.shield.fill") }
                .foregroundStyle(ink.opacity(0.7)).padding(.vertical, 10)
            }.padding(22).frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
        .foregroundStyle(ink).background(CalendarConnectBackground(accent: .purple))
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $provider) { CalendarProviderConnectionView(provider: $0) }
        .task {
            appleAccess = EKEventStore.authorizationStatus(for: .event) == .fullAccess
            if !ProcessInfo.processInfo.arguments.contains("-calendar-connect-preview") { await model.loadCalendarConnections() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { appleAccess = EKEventStore.authorizationStatus(for: .event) == .fullAccess }
        }
        .environment(\.colorScheme, .light)
    }
    private func isConnected(_ provider: CalendarConnectProvider) -> Bool {
        provider == .apple ? appleAccess : model.calendarConnections.contains { $0.provider.lowercased() == provider.rawValue && !$0.needsReconnect }
    }
}

enum CalendarConnectProvider: String, CaseIterable, Identifiable, Hashable {
    case google, apple, microsoft
    var id: String { rawValue }
    var name: String { switch self { case .google: "Google"; case .apple: "Apple"; case .microsoft: "Microsoft" } }
    var title: String { "\(name) Calendar" }
    var accent: Color { self == .apple ? .pink : .blue }
    var artwork: CalendarConnectionArtwork.Kind {
        switch self { case .google: .google; case .apple: .apple; case .microsoft: .microsoft }
    }
}

private struct CalendarProviderConnectionView: View {
    let provider: CalendarConnectProvider
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .title2) private var stepBadgeSize = 36
    @StateObject private var oauth = CalendarOAuthCoordinator()
    @State private var connecting = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var appleAccess = EKEventStore.authorizationStatus(for: .event) == .fullAccess
    @State private var confirmedConnection = false
    @State private var connectionTask: Task<Void, Never>?
    @State private var statusMessage: String?
    private let appleCalendars = MomentCalendarService()
    private var connected: Bool {
        provider == .apple ? appleAccess : confirmedConnection || model.calendarConnections.contains { $0.provider.lowercased() == provider.rawValue && !$0.needsReconnect }
    }
    @State private var failure: String?
    @State private var showingAppleCalendars = false
    private let ink = Color(red: 0.06, green: 0.05, blue: 0.25)

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Capsule().fill(provider.accent.opacity(0.15)).frame(width: 100, height: 4)
                    .overlay(alignment: .leading) { Capsule().fill(provider.accent).frame(width: connected ? 100 : 30, height: 4) }
                    .accessibilityHidden(true)
                CalendarProviderIcon(provider: provider, size: 66).padding(.top, 10)
                VStack(spacing: 8) {
                    Text("Connect \(provider.title)").font(.title.bold()).multilineTextAlignment(.center)
                    Text(provider == .apple
                         ? "Use calendars already added to your iPhone to find birthdays and anniversaries."
                         : "Connect your \(provider.title) to organize your schedule and important events.")
                        .font(.subheadline).foregroundStyle(ink.opacity(0.7)).multilineTextAlignment(.center)
                }
                VStack(spacing: 0) {
                    step(1, title: provider == .apple ? "Use your Apple Calendar" : "Sign in to \(provider.name)",
                         detail: provider == .apple ? "Add your iCloud account in iPhone Settings if it isn't already there. No Apple password is entered in NexDo." : "Tap Connect Now and choose the \(provider.name) account you want to use.")
                    Divider().padding(.horizontal, 18)
                    step(2, title: "Review permissions",
                         detail: provider == .apple ? "Allow calendar access when iOS asks. NexDo reads the calendar you choose to suggest moments. It does not edit those events." : "Your provider requests access to read and manage events. NexDo can add your scheduled tasks and events. You can turn this off in Calendars & Privacy.")
                    Divider().padding(.horizontal, 18)
                    step(3, title: provider == .apple ? "Choose and review" : "You're all set!",
                         detail: provider == .apple ? "Choose a calendar, then review birthday and anniversary suggestions before saving them as Moments." : "We'll synchronize your calendar so your events appear alongside your plans.")
                }.background(.white.opacity(0.87), in: RoundedRectangle(cornerRadius: 24))
                Label(provider == .apple ? "Calendar reading happens on this device. Change access in iPhone Settings." : "You control access. Disconnect this calendar in NexDo Settings at any time.", systemImage: "lock.shield.fill")
                    .font(.footnote).foregroundStyle(ink.opacity(0.7)).padding(16)
                    .frame(maxWidth: .infinity).background(provider.accent.opacity(0.06), in: RoundedRectangle(cornerRadius: 20))
                if connected {
                    Label("\(provider.title) connected.", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green).accessibilityIdentifier("calendar-connect-success")
                    Text(provider == .apple ? "Calendar access is allowed on this iPhone. Choose calendars to review suggested Moments." : "This provider is already connected. Manage accounts in Calendars & Privacy.").font(.footnote)
                    ForEach(model.calendarConnections.filter { $0.provider.lowercased() == provider.rawValue }) { connection in
                        VStack(spacing: 4) {
                            Text(connection.displayName).font(.subheadline.bold())
                            Text(connection.lastSyncedText()).font(.caption)
                        }
                    }
                }
                if connected && provider != .apple {
                    Button("Connect another account") { beginConnection() }
                        .frame(minHeight: 44).disabled(connecting)
                        .accessibilityIdentifier("calendar-connect-another")
                }
                if let failure { Text(failure).font(.footnote).foregroundStyle(.red).accessibilityIdentifier("calendar-connect-error") }
                if let statusMessage { Text(statusMessage).font(.footnote).accessibilityAddTraits(.updatesFrequently) }
                if provider == .apple && (EKEventStore.authorizationStatus(for: .event) == .denied || EKEventStore.authorizationStatus(for: .event) == .restricted) {
                    Button("Open iPhone Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }.frame(minHeight: 44)
                }
                Button(action: primaryAction) {
                    HStack {
                        if connecting { ProgressView().tint(.white) }
                        Text(connecting ? "Connecting…" : connected ? (provider == .apple ? "Choose calendars" : "Done") : "Connect Now").font(.headline)
                    }.frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.plain).foregroundStyle(.white)
                .background(provider == .apple ? Color.black : Color.blue, in: Capsule())
                .disabled(connecting).accessibilityIdentifier("calendar-connect-\(provider.rawValue)")
                Link("Learn more", destination: LegalLinks.privacyPolicy).font(.footnote).underline().frame(minHeight: 44)
            }.padding(20).frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
        .foregroundStyle(ink).background(CalendarConnectBackground(accent: provider.accent))
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if connecting { Button("Cancel") { cancelConnection() } }
                else { NavigationLink("Need help?") { HelpView() } }
            }
        }
        .navigationBarBackButtonHidden(connecting)
        .interactiveDismissDisabled(connecting)
        .navigationDestination(isPresented: $showingAppleCalendars) { MomentCalendarImportView() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { appleAccess = EKEventStore.authorizationStatus(for: .event) == .fullAccess }
        }
        .onDisappear { cancelConnection() }
        .environment(\.colorScheme, .light)
    }

    private func step(_ number: Int, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)").font(.title2.bold()).foregroundStyle(provider.accent)
                .frame(width: stepBadgeSize, height: stepBadgeSize).background(provider.accent.opacity(0.10), in: Circle())
            VStack(alignment: .leading, spacing: 7) {
                Text(title).font(.subheadline.bold())
                Text(detail).font(.footnote).foregroundStyle(ink.opacity(0.7)).fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, alignment: .leading)
            if !typeSize.isAccessibilitySize {
                if number == 1 && provider == .apple {
                    // Apple uses EventKit permission, not Sign in with Apple.
                    VStack(spacing: 5) {
                        CalendarProviderIcon(provider: .apple, size: 32)
                        Text("Allow access").font(.system(size: 10, weight: .medium))
                    }.frame(width: 62, height: 70).accessibilityHidden(true)
                } else {
                    CalendarConnectionArtwork(kind: stepArtwork(number))
                        .frame(width: 68, height: 76)
                }
            }
        }.padding(18)
    }

    private func stepArtwork(_ number: Int) -> CalendarConnectionArtwork.Kind {
        switch number {
        case 1: provider == .google ? .googleSignIn : .microsoftSignIn
        case 2: provider == .apple ? .applePermissions : .permissions
        default: .complete
        }
    }

    private func primaryAction() {
        guard !connecting else { return }
        if connected {
            if provider == .apple { showingAppleCalendars = true } else { dismiss() }
            return
        }
        beginConnection()
    }

    private func beginConnection() {
        guard !connecting else { return }
        connecting = true; failure = nil; statusMessage = nil
        let owner = model.profile?.id
        connectionTask = Task { @MainActor in
            defer { connecting = false; connectionTask = nil }
            do {
                if provider == .apple {
                    _ = try await appleCalendars.calendars()
                    guard !Task.isCancelled, model.profile?.id == owner else { return }
                    appleAccess = EKEventStore.authorizationStatus(for: .event) == .fullAccess
                    statusMessage = "Calendar access allowed. Choose a calendar to review suggested Moments."
                    return
                }
                let url = try await model.calendarConnectURL(provider: provider.rawValue)
                guard !Task.isCancelled, model.profile?.id == owner else { return }
                let result = await withCheckedContinuation { (continuation: CheckedContinuation<CalendarOAuthResult, Never>) in
                    oauth.connect(url: url, providerName: provider.name) { continuation.resume(returning: $0) }
                }
                guard !Task.isCancelled, model.profile?.id == owner else { return }
                switch result {
                case .cancelled: statusMessage = "Connection cancelled. Your existing calendars are unchanged."; return
                case .failed(let detail): failure = detail; return
                case .connected:
                    confirmedConnection = true
                    if !(await model.loadCalendarConnections()) {
                        statusMessage = "Calendar connected, but its latest status could not be loaded. Retry from Calendars & Privacy."
                    }
                    guard !Task.isCancelled, model.profile?.id == owner else { return }
                    try? await model.reloadProfile()
                    guard !Task.isCancelled, model.profile?.id == owner else { return }
                    await model.refresh()
                }
            } catch {
                guard !Task.isCancelled, model.profile?.id == owner else { return }
                failure = provider == .apple ? "Calendar access is unavailable. Allow Calendar access for NexDo in iPhone Settings, then try again." : error.localizedDescription
            }
        }
    }

    private func cancelConnection() {
        guard connecting else { return }
        connectionTask?.cancel()
        oauth.cancel()
        statusMessage = "Connection cancelled."
    }

}

private struct CalendarConnectBackground: View {
    let accent: Color
    var body: some View {
        LinearGradient(colors: [accent.opacity(0.10), .white, accent.opacity(0.12)], startPoint: .topLeading, endPoint: .bottomTrailing)
            .overlay(alignment: .topTrailing) { Circle().fill(accent.opacity(0.04)).frame(width: 280, height: 280).offset(x: 140, y: -130) }
            .ignoresSafeArea()
    }
}

private struct CalendarProviderIcon: View {
    let provider: CalendarConnectProvider
    let size: CGFloat
    var body: some View {
        CalendarConnectionArtwork(kind: provider.artwork).frame(width: size, height: size)
    }
}

private struct CalendarConnectIllustration: View {
    var body: some View {
        CalendarConnectionArtwork(kind: .hero).frame(height: 180)
    }
}

/// Artwork isolated from the approved calendar image pack, bundled locally and cached per region.
/// This uses the same asset-sheet rendering approach as the existing Wellness module guides.
struct CalendarConnectionArtwork: View {
    enum Kind: Int, CaseIterable {
        case google, apple, microsoft, hero, googleSignIn, microsoftSignIn, permissions, applePermissions, complete
        // Pixel bounds in the bundled 1254 × 1254 sheet; exclude inter-cell padding.
        var rect: CGRect {
            switch self {
            case .google: CGRect(x: 72, y: 82, width: 322, height: 318)
            case .apple: CGRect(x: 462, y: 82, width: 334, height: 325)
            case .microsoft: CGRect(x: 844, y: 82, width: 380, height: 329)
            case .hero: CGRect(x: 24, y: 443, width: 401, height: 392)
            case .googleSignIn: CGRect(x: 452, y: 467, width: 344, height: 358)
            case .microsoftSignIn: CGRect(x: 864, y: 467, width: 353, height: 359)
            case .permissions: CGRect(x: 73, y: 873, width: 332, height: 333)
            case .applePermissions: CGRect(x: 477, y: 872, width: 330, height: 334)
            case .complete: CGRect(x: 830, y: 856, width: 389, height: 350)
            }
        }
    }
    let kind: Kind
    private static let images: [Kind: CGImage] = {
        guard let source = UIImage(named: "calendar-connect-pack")?.cgImage else { return [:] }
        return Dictionary(uniqueKeysWithValues: Kind.allCases.compactMap { kind in
            guard let image = source.cropping(to: kind.rect) else { return nil }
            return (kind, image)
        })
    }()
    var body: some View {
        if let image = Self.images[kind] {
            Image(decorative: image, scale: 1).resizable().interpolation(.high).scaledToFit()
                // As on the Wellness artwork, white blends into the fixed light surfaces.
                .blendMode(.multiply).accessibilityHidden(true)
        }
    }
}
