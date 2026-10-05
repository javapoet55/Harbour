import SwiftUI
import UserNotifications
import AudioToolbox

@MainActor final class PomodoroNotificationRoute: ObservableObject {
    static let shared = PomodoroNotificationRoute()
    @Published var owner: String?
}

@MainActor final class PomodoroStore: ObservableObject {
    @Published private(set) var sessions: [PomodoroSession] = []
    @Published private(set) var currentID: String?
    @Published var syncMessage: String?
    @Published private(set) var syncing = false
    @Published private(set) var loadingHistory = false
    private var scheduling = false
    private var reschedule = false
    private var synced: [String: Int] = [:]
    private let api: APIClient
    private let owner: String
    private let preview: Bool
    private var key: String { "nexdo.pomodoro.v1." + owner }
    private struct Cache: Codable { var sessions: [PomodoroSession]; var currentID: String?; var synced: [String: Int] }
    private struct SaveRequest: Encodable { let ownerID: String; let session: PomodoroSession }
    private struct ListResponse: Decodable, Sendable { let sessions: [PomodoroSession]; let nextCursor: String? }
    private struct SaveResponse: Decodable, Sendable { let session: PomodoroSession }
    var current: PomodoroSession? { sessions.first { $0.id == currentID } }
    init(api: APIClient, owner: String, preview: Bool = false) {
        self.api = api; self.owner = owner; self.preview = preview
        if !preview, let data = UserDefaults.standard.data(forKey: "nexdo.pomodoro.v1." + owner),
           let cache = try? JSONDecoder().decode(Cache.self, from: data) {
            sessions = cache.sessions; currentID = cache.currentID; synced = cache.synced
        }
        #if DEBUG
        if preview && ProcessInfo.processInfo.arguments.contains("-pomodoro-dashboard-preview") && !ProcessInfo.processInfo.arguments.contains("-pomodoro-empty-preview") {
            for (index, category) in PomodoroCategory.allCases.enumerated() {
                let start = Date().addingTimeInterval(-Double(3600 + index * 1800))
                var session = PomodoroSession(category: category, name: index == 0 ? "Read a chapter" : "", durationMinutes: 25, autoBreak: true, playSound: false, now: start)
                if index == 5 { session.stop(at: start.addingTimeInterval(600)) } else { session.advance(at: start.addingTimeInterval(1800)) }
                sessions.append(session)
            }
            var older = PomodoroSession(category: .reading, name: "Yesterday’s reading", durationMinutes: 25, autoBreak: false, playSound: false, now: Date().addingTimeInterval(-86400))
            older.advance(at: Date()); sessions.append(older)
        }
        if preview && ProcessInfo.processInfo.arguments.contains("-pomodoro-break-preview") {
            var session = PomodoroSession(category: .focus, name: "Work on project proposal", durationMinutes: 25, autoBreak: true, playSound: false, now: Date().addingTimeInterval(-1505))
            session.advance(at: Date()); sessions = [session]; currentID = session.id
        }
        #endif
    }
    private func persist() {
        guard !preview, let data = try? JSONEncoder().encode(Cache(sessions: sessions, currentID: currentID, synced: synced)) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
    func start(category: PomodoroCategory, name: String, minutes: Int, autoBreak: Bool, sound: Bool) {
        guard current?.active != true else { return }
        let session = PomodoroSession(category: category, name: name, durationMinutes: minutes, autoBreak: autoBreak, playSound: sound)
        sessions.insert(session, at: 0); currentID = session.id; persist()
        Task { await scheduleAlerts(); await sync() }
    }
    func mutate(_ action: (inout PomodoroSession) -> Void) {
        guard let index = sessions.firstIndex(where: { $0.id == currentID }) else { return }
        action(&sessions[index]); persist()
        Task { await scheduleAlerts(); await sync() }
    }
    func tick() {
        guard let index = sessions.firstIndex(where: { $0.id == currentID }) else { return }
        let previous = sessions[index].phase
        guard sessions[index].advance(at: Date()) else { return }
        if previous != sessions[index].phase, sessions[index].playSound { AudioServicesPlaySystemSound(1005) }
        persist(); Task { await scheduleAlerts(); await sync() }
    }
    func newSession() { guard current?.active != true else { return }; currentID = nil; persist() }
    func restore() async {
        tick()
        guard !preview, !loadingHistory else { return }
        loadingHistory = true; defer { loadingHistory = false }
        await scheduleAlerts()
        do {
            var positions = [String: Int](minimumCapacity: sessions.count)
            for (index, session) in sessions.enumerated() { positions[session.id] = index }
            var cursor: String?
            repeat {
            let path = "/api/pomodoro?owner=" + owner.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)! + (cursor.map { "&cursor=" + $0 } ?? "")
            let response: ListResponse = try await api.request(path)
            for remote in response.sessions {
                if let index = positions[remote.id] {
                    if remote.revision >= sessions[index].revision { sessions[index] = remote }
                } else { positions[remote.id] = sessions.count; sessions.append(remote) }
                synced[remote.id] = remote.revision
            }
            cursor = response.nextCursor
            persist()
            } while cursor != nil
            sessions.sort { $0.startedAt > $1.startedAt }
            if currentID == nil { currentID = sessions.first(where: { $0.active })?.id }
            persist(); tick(); await scheduleAlerts(); await sync()
        } catch { syncMessage = "Saved on this device. Connect to sync your sessions." }
    }
    func sync() async {
        guard !syncing, !preview else { return }
        syncing = true; defer { syncing = false }
        do {
            while let session = sessions.first(where: { $0.revision > (synced[$0.id] ?? 0) }) {
                let response: SaveResponse = try await api.request("/api/pomodoro", method: "PUT", body: JSONEncoder().encode(SaveRequest(ownerID: owner, session: session)))
                synced[session.id] = response.session.revision
                if let index = sessions.firstIndex(where: { $0.id == session.id }), response.session.revision >= sessions[index].revision {
                    sessions[index] = response.session
                }
                persist()
            }
            syncMessage = nil
        } catch { syncMessage = "Saved on this device. Connect to sync your sessions." }
    }
    private func scheduleAlerts() async {
        if scheduling { reschedule = true; return }
        scheduling = true
        repeat { reschedule = false; await replaceAlerts() } while reschedule
        scheduling = false
    }
    private func replaceAlerts() async {
        guard !preview else { return }
        let center = UNUserNotificationCenter.current()
        let prefix = "pomodoro." + owner + "."
        let requests = await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(withIdentifiers: requests.filter { $0.identifier.hasPrefix(prefix) }.map(\.identifier))
        guard let session = current, session.active, !session.paused, let deadline = session.deadline else { return }
        guard (try? await center.requestAuthorization(options: [.alert, .sound])) == true else { return }
        func add(_ time: Double, suffix: String, body: String) async {
            guard time > Date().timeIntervalSince1970 else { return }
            let content = UNMutableNotificationContent(); content.title = "Pomodoro"; content.body = body
            content.userInfo = ["pomodoroOwner": TaskActionCoordinator.ownerKey(owner)]
            if session.playSound { content.sound = .default }
            let request = UNNotificationRequest(identifier: prefix + session.id + suffix, content: content,
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, time - Date().timeIntervalSince1970), repeats: false))
            try? await center.add(request)
        }
        await add(deadline, suffix: ".phase", body: session.phase == .focus ? (session.autoBreak ? "Focus complete. Time for a five-minute break!" : "Great job! Your focus session is complete.") : "Your break is complete. Ready for another session?")
        if session.phase == .focus && session.autoBreak { await add(deadline + 300, suffix: ".complete", body: "Your break is complete. Ready for another session?") }
    }
    static func cancelAlerts(owner: String) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(withIdentifiers: pending.filter { $0.identifier.hasPrefix("pomodoro." + owner + ".") }.map(\.identifier))
    }
}
