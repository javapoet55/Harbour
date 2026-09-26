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
        case .denied: return "Wish reminders are off in your phone's Settings"
        case .notDetermined: return "Allow notifications to enable wish reminders"
        @unknown default: return "Check notification permission in your phone's Settings"
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
    @Published var showingNotificationInbox = false
    var routedPlanID: String?
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
        if owner != key { owner = key; generation = UUID(); snapshot = nil; route = nil; showingNotificationInbox = false; routedPlanID = nil; error = nil; lastSynced = nil; cardCache.removeAll(); await clearNotifications() }
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
        guard let id = pending.pending, let owner, pending.owner == owner else { return }
        // A foreground refresh or cold launch may still be loading. Never consume the tap early.
        guard snapshot != nil else { return }
        pending.pending = nil
        routedPlanID = id
        if let moment = moments.first(where: { $0.id == id || $0.drafts.contains { $0.plans?.contains { $0.id == id } == true } }) {
            route = moment
        } else {
            showingNotificationInbox = true
        }
    }
    func request<T: Encodable, R: Decodable & Sendable>(_ operation: String, _ input: T, id: String? = nil) async throws -> R {
        guard owner != nil else { throw APIError.signedOut }
        let token = generation
        let result: R = try await api.request("/api/moments", method: "POST", body: JSONEncoder().encode(MomentEnvelope(operation: operation, input: input, id: id)), timeout: operation == "greetingArtwork" ? 150 : 50)
        guard token == generation else { throw APIError.signedOut }
        return result
    }
    /// One live Manage Moment model per moment, so Manage Moment and every greeting card section edit the same
    /// wish instead of separate snapshots. Held weakly: once no screen shows it, the next one starts from fresh data.
    private final class WeakFestivalModel { weak var value: ManageFestivalModel?; init(_ value: ManageFestivalModel) { self.value = value } }
    private var festivalModels: [String: WeakFestivalModel] = [:]
    func festivalModel(for group: MomentDisplayGroup) -> ManageFestivalModel {
        if let live = group.moments.lazy.compactMap({ self.festivalModels[$0.id]?.value }).first { return live }
        let fresh = group.moments.map { moment in moments.first { $0.id == moment.id } ?? moment }
        let current = MomentDisplayGroup.groups(fresh).first { $0.moments.contains { $0.id == group.moments[0].id } } ?? group
        let model = ManageFestivalModel(group: current, store: self)
        festivalModels = festivalModels.filter { $0.value.value != nil }
        for moment in group.moments { festivalModels[moment.id] = WeakFestivalModel(model) }
        return model
    }
    // The saved greeting card that automatic emails include (PUT/GET/DELETE /api/moments/{id}/card).
    private let cardCache = GreetingCardCache()
    func uploadCard(momentIDs: [String], encode: @Sendable (GreetingCardEncoding) async throws -> Data) async throws {
        guard owner != nil else { throw APIError.signedOut }
        let token = generation
        _ = try await GreetingCardClient(api: api).upload(momentIDs: momentIDs, encode: encode)
        guard token == generation else { throw APIError.signedOut }
    }
    func deleteCard(momentIDs: [String]) async throws {
        guard owner != nil else { throw APIError.signedOut }
        let token = generation
        for id in momentIDs { try await GreetingCardClient(api: api).delete(momentID: id) }
        guard token == generation else { throw APIError.signedOut }
    }
    /// The moment's saved card image, from the cache when its sha256 is unchanged.
    func storedCard(for moment: ImportantMoment) async -> Data? {
        guard owner != nil, let card = moment.card else { return nil }
        let token = generation
        let data = try? await cardCache.image(for: card, momentID: moment.id, client: GreetingCardClient(api: api))
        return token == generation ? data : nil
    }
    func perform(_ action: () async throws -> Void) async {
        guard !busy else { return }; busy = true; error = nil; defer { busy = false }
        do { try await action(); await refresh() } catch { self.error = error.localizedDescription }
    }
    @discardableResult func save(_ input: MomentInput, id: String? = nil) async throws -> String {
        struct Saved: Decodable, Sendable { let moment: ImportantMoment }
        let result: Saved = try await request("save", input, id: id)
        // Publish the authoritative save result before any list refresh or notification work.
        var updated = moments.filter { $0.id != result.moment.id }
        updated.append(result.moment)
        snapshot = MomentsSnapshot(moments: updated, emailAccount: snapshot?.emailAccount,
            emailConfigured: snapshot?.emailConfigured ?? false,
            automaticEmailEnabled: snapshot?.automaticEmailEnabled ?? false)
        return result.moment.id
    }
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
        for moment in moments where moment.enabled {
            if let settings = FestivalSettings.read(moment.festivalSettings), settings.preparationMinutes > 0, preparedGroups.insert(settings.groupID).inserted {
                let draftTime = settings.draftSendDate.flatMap { ISO8601DateFormatter().date(from: $0) }
                let sameDayDraft = draftTime.flatMap { MomentDates.day($0, zone: moment.timeZoneID) == moment.nextOccurrence ? $0 : nil }
                if let occurrenceTime = moment.upcomingDelivery?.date ?? sameDayDraft ?? FestivalValidation.instant(day: moment.nextOccurrence, hour: 8, minute: 0, zone: moment.timeZoneID),
                   let when = settings.preparationDate(occurrence: occurrenceTime, zone: moment.timeZoneID), when > Date() {
                    requests.append((moment.id, when, "Review your upcoming wish."))
                }
            }
        }
        for plan in plans where plan.editable && enabledDrafts.contains(plan.draftID) {
            if !plan.automaticDelivery && plan.date > Date() { requests.append((plan.id,plan.date,plan.channel == "messages" ? "Your wish is ready. Open Nexdo, then tap Send in Messages." : "Your wish is ready. Open Nexdo to send it.")) }
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
