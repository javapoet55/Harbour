import SwiftUI
import UserNotifications
import AuthenticationServices

struct MomentsSnapshot: Decodable, Sendable {
    struct Account: Decodable, Sendable { let email, status: String }
    let moments: [ImportantMoment]
    let emailAccount: Account?
    let emailConfigured, automaticEmailEnabled: Bool
}
struct MomentEnvelope<T: Encodable>: Encodable { let operation: String; var input: T?; var id: String? }
struct MomentOK: Decodable, Sendable {}
@MainActor final class MomentNotificationRoute: ObservableObject {
    static let shared = MomentNotificationRoute()
    @Published var pending: String?
    var owner: String?
    func receive(_ id: String, owner: String) { self.owner = owner; pending = id }
}
@MainActor final class ImportantMomentsStore: ObservableObject {
    @Published var snapshot: MomentsSnapshot?
    @Published var error: String?
    @Published var loading = false
    @Published var busy = false
    @Published var lastSynced: Date?
    @Published var reminderAuthorization: UNAuthorizationStatus = .notDetermined
    @Published var reminderStatusLoaded = false
    @Published var enablingReminders = false
    var reminderStatusText: String {
        guard reminderStatusLoaded else { return "Checking notification permission…" }
        switch reminderAuthorization {
        case .authorized: return "Wish reminders are enabled"
        case .provisional: return "Wish reminders are enabled quietly"
        case .ephemeral: return "Wish reminders are temporarily enabled"
        case .denied: return "Wish reminders are off in iOS Settings"
        case .notDetermined: return "Allow notifications to enable wish reminders"
        @unknown default: return "Check notification permission in iOS Settings"
        }
    }
    func updateReminderStatus() async {
        reminderAuthorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        reminderStatusLoaded = true
    }
    /// Request once, contextually on the Moments screen; never override a denial.
    func prepareDefaultReminders() async {
        await updateReminderStatus()
        if reminderAuthorization == .notDetermined { await enableWishReminders() }
    }
    func enableWishReminders() async {
        guard !enablingReminders else { return }
        enablingReminders = true
        defer { enablingReminders = false }
        do {
            try await authorizeNotifications()
            await replaceNotifications()
        } catch { self.error = error.localizedDescription }
    }
    @Published var route: ImportantMoment?
    private let notificationAuthorization: (@Sendable () async throws -> Void)?
    private let api: APIClient
    private var owner: String?
    private var generation = UUID()
    init(api: APIClient, notificationAuthorization: (@Sendable () async throws -> Void)? = nil) { self.api = api; self.notificationAuthorization = notificationAuthorization }
    var moments: [ImportantMoment] { snapshot?.moments ?? [] }
    var plans: [WishDeliveryPlan] { moments.flatMap { $0.drafts.flatMap { $0.plans ?? [] } }.sorted { $0.date < $1.date } }
    var today: [ImportantMoment] { moments.filter { m in
        m.enabled && m.nextOccurrence == MomentDates.day(Date(), zone: m.timeZoneID) && (MomentDates.parseInstant(m.snoozedUntil ?? "") ?? .distantPast) <= Date() && !m.drafts.flatMap({$0.plans ?? []}).contains(where: { $0.status == "SENT" && MomentDates.day($0.date, zone: $0.timeZoneID) == m.nextOccurrence })
    } }
    func activate(_ userID: String?) async {
        let key = userID.map(TaskActionCoordinator.ownerKey)
        if owner != key { owner = key; generation = UUID(); snapshot = nil; route = nil; error = nil; lastSynced = nil; await clearNotifications() }
        if key != nil { await refresh() }
    }
    func refresh() async {
        guard owner != nil, !loading else { return }; let token = generation
        loading = true; defer { loading = false }
        await updateReminderStatus()
        do {
            let result: MomentsSnapshot = try await api.request("/api/moments", timeout: 20)
            guard token == generation else { return }; snapshot = result; lastSynced = Date(); error = nil
            await replaceNotifications()
            resolveRoute()
        } catch { if token == generation { self.error = "Couldn’t refresh Important Moments. \(error.localizedDescription)" } }
    }
    func resolveRoute() {
        let pending = MomentNotificationRoute.shared
        guard let id = pending.pending, pending.owner == owner else { return }
        pending.pending = nil
        if let moment = moments.first(where: { $0.enabled && ($0.id == id || $0.drafts.contains { $0.plans?.contains { $0.id == id && $0.editable } == true }) }) { route = moment }
    }
    func request<T: Encodable, R: Decodable & Sendable>(_ operation: String, _ input: T, id: String? = nil) async throws -> R {
        guard owner != nil else { throw APIError.signedOut }
        let token = generation
        let result: R = try await api.request("/api/moments", method: "POST", body: JSONEncoder().encode(MomentEnvelope(operation: operation, input: input, id: id)), timeout: operation == "greetingArtwork" ? 150 : 50)
        guard token == generation else { throw APIError.signedOut }
        return result
    }
    func perform(_ action: () async throws -> Void) async {
        guard !busy else { return }; busy = true; error = nil; defer { busy = false }
        do { try await action(); await refresh() } catch { self.error = error.localizedDescription }
    }
    func save(_ input: MomentInput, id: String? = nil) async throws { let _: MomentOK = try await request("save", input, id: id) }
    func planAction(_ plan: WishDeliveryPlan, action: String, date: Date? = nil, zone: String? = nil) async throws {
        var input = ["id":plan.id,"action":action]
        if let date { input["scheduledAtUTC"] = ISO8601DateFormatter().string(from: date) }; if let zone { input["timeZoneID"] = zone }
        let _: MomentOK = try await request("plan", input)
    }
    func visibility(_ moment: ImportantMoment, enabled: Bool, snooze: Bool = false) async throws {
        struct Input: Encodable { let id: String; let enabled: Bool; let snoozedUntil: String? }
        let _: MomentOK = try await request("visibility", Input(id: moment.id, enabled: enabled, snoozedUntil: snooze ? ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600)) : nil))
    }
    func deleteData() async throws { let _: MomentOK = try await api.request("/api/moments", method: "DELETE"); snapshot = nil; await clearNotifications() }
    func authorizeNotifications() async throws {
        if let notificationAuthorization {
            try await notificationAuthorization()
            reminderAuthorization = .authorized
            reminderStatusLoaded = true
            return
        }
        let center = UNUserNotificationCenter.current()
        await updateReminderStatus()
        if reminderAuthorization == .notDetermined {
            _ = try await center.requestAuthorization(options: [.alert, .sound])
            await updateReminderStatus()
        }
        guard [.authorized, .provisional, .ephemeral].contains(reminderAuthorization) else {
            throw TaskActionServiceError.notificationsDenied
        }
    }
    private func clearNotifications() async {
        let c = UNUserNotificationCenter.current()
        c.removePendingNotificationRequests(withIdentifiers: await c.pendingNotificationRequests().filter { $0.identifier.hasPrefix("nexdo.moment.") }.map(\.identifier))
        c.removeDeliveredNotifications(withIdentifiers: await c.deliveredNotifications().filter { $0.request.identifier.hasPrefix("nexdo.moment.") }.map { $0.request.identifier })
    }
    private func replaceNotifications() async {
        guard let owner else { return }; let token = generation
        await clearNotifications()
        let center = UNUserNotificationCenter.current()
        let authorization = await center.notificationSettings().authorizationStatus
        guard authorization == .authorized || authorization == .provisional else { return }
        // Reserve space for existing task reminders; iOS permits only 64 pending requests.
        let available = max(0, 60 - (await center.pendingNotificationRequests()).count)
        var requests: [(String,Date,String)] = []
        let enabledDrafts = Set(moments.filter(\.enabled).flatMap { $0.drafts.map(\.id) })
        var preparedGroups = Set<String>()
        for moment in moments where moment.enabled && moment.type == "festival" {
            if let settings = FestivalSettings.read(moment.festivalSettings), settings.prepareDays > 0, preparedGroups.insert(settings.groupID).inserted {
                var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: moment.timeZoneID) ?? .current
                if let occurrenceTime = FestivalValidation.instant(day: moment.nextOccurrence, hour: 8, minute: 0, zone: moment.timeZoneID),
                   let when = calendar.date(byAdding: .day, value: -settings.prepareDays, to: occurrenceTime), when > Date() {
                    requests.append((moment.id, when, "Review your festival wish."))
                }
            }
        }
        for plan in plans where plan.editable && enabledDrafts.contains(plan.draftID) {
            if !plan.automaticDelivery && plan.date > Date() { requests.append((plan.id,plan.date,"Your wish is ready. Open Nexdo to review and confirm delivery.")) }
            if plan.reminderOffset == 60 && plan.date.addingTimeInterval(-3600) > Date() { requests.append((plan.id,plan.date.addingTimeInterval(-3600),"Your scheduled wish is due in one hour.")) }
        }
        for (index,item) in requests.sorted(by: { $0.1 < $1.1 }).prefix(available).enumerated() {
            guard token == generation else { return }
            let content = UNMutableNotificationContent(); content.title = "Important Moment"; content.body = item.2; content.sound = .default; content.userInfo = ["momentID":item.0,"momentOwner":owner]
            do { try await center.add(UNNotificationRequest(identifier: "nexdo.moment.\(index)", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1,item.1.timeIntervalSinceNow), repeats: false))) }
            catch { self.error = "A wish reminder could not be scheduled. Enable notifications and refresh." }
        }
        if requests.count > available { error = "Only the next \(available) wish reminders fit on this device. Reopen Nexdo to refresh later reminders." }
    }
}
@MainActor final class MomentEmailOAuth: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor() }
    func connect(_ store: ImportantMomentsStore) async throws {
        struct Link: Decodable, Sendable { let url: String }
        let link: Link = try await store.request("connectEmail", [String:String]())
        guard let url = URL(string: link.url) else { throw APIError.invalidResponse }
        session = ASWebAuthenticationSession(url: url, callbackURLScheme: "nexdo") { callback, _ in
            Task { @MainActor in
                if callback?.host != "moments-email" || URLComponents(url: callback!, resolvingAgainstBaseURL: false)?.queryItems?.first(where: {$0.name == "status"})?.value != "connected" { store.error = "Email connection cancelled or failed. Try connecting again." }
                else { await store.refresh() }
                self.session = nil
            }
        }
        session?.presentationContextProvider = self; session?.prefersEphemeralWebBrowserSession = true
        if session?.start() != true { throw TaskActionServiceError.unavailable }
    }
}
