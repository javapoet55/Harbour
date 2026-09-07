import SwiftUI

@main
struct NexdoApp: App {
    var body: some Scene { WindowGroup { RootView() } }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var profile: Profile?
    @Published var tasks: [NexdoTask] = []
    @Published var taskQuery = TaskQuery()
    @Published var tasksLoading = false
    @Published var tasksLoadFailed = false
    @Published var agenda: Agenda?
    @Published var scheduleIntelligence: ScheduleIntelligenceResponse?
    @Published var weather: WeatherResponse?
    @Published var turn: AssistantTurn?
    @Published var focusSession: NativeFocusSession?
    @Published var busy = false
    @Published var error: String?
    @Published var aiConsent = false
    @Published private(set) var lastSignedInFirstName = UserDefaults.standard.string(forKey: "nexdo.lastSignedInFirstName")
    private var contextID: String?
    private var focusCompletion: Task<Void, Never>?
    // Ephemeral cookie session: credentials are never written to preferences, files, or logs.
    private let api = try! APIClient(baseURL: URL(string: "https://harbour-production-f8a0.up.railway.app")!)
    private struct Ignore: Decodable, Sendable {}

    func perform(errorMessage: String? = nil, _ action: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await action() }
        catch APIError.signedOut { await reset(); error = "Please sign in again. Your session ended or the credentials were incorrect." }
        catch { self.error = errorMessage ?? (tasksLoadFailed ? "Couldn’t load your tasks. Please refresh to try again." : error.localizedDescription) }
    }
    func login(email: String, password: String) async {
        await perform {
            let _: Ignore = try await api.request("/api/auth/login", method: "POST", body: JSONEncoder().encode(["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password]), treatUnauthorizedAsSignedOut: false)
            try await finishAuthentication()
        }
    }
    func register(name: String, email: String, password: String) async {
        await perform {
            struct Input: Encodable { let name: String; let email: String; let password: String }
            let input = Input(name: name, email: email, password: password)
            let _: Ignore = try await api.request("/api/auth/register", method: "POST", body: JSONEncoder().encode(input), treatUnauthorizedAsSignedOut: false)
            try await finishAuthentication()
        }
    }
    func requestPasswordReset(email: String) async -> Bool {
        var sent = false
        await perform {
            let _: PasswordResetResponse = try await api.request("/api/auth/password-reset/request", method: "POST", body: JSONEncoder().encode(["email": email]), treatUnauthorizedAsSignedOut: false)
            sent = true
        }
        return sent
    }
    func confirmPasswordReset(email: String, code: String, password: String) async -> Bool {
        var changed = false
        await perform {
            struct Input: Encodable { let email: String; let code: String; let password: String }
            let _: Ignore = try await api.request("/api/auth/password-reset/confirm", method: "POST", body: JSONEncoder().encode(Input(email: email, code: code, password: password)), treatUnauthorizedAsSignedOut: false)
            changed = true
        }
        return changed
    }
    func loginWithApple(authorizationCode: String, rawNonce: String, givenName: String?, familyName: String?) async {
        await perform {
            struct Input: Encodable { let authorizationCode: String; let rawNonce: String; let givenName: String?; let familyName: String? }
            let input = Input(authorizationCode: authorizationCode, rawNonce: rawNonce, givenName: givenName, familyName: familyName)
            let _: Ignore = try await api.request("/api/auth/apple", method: "POST", body: JSONEncoder().encode(input), treatUnauthorizedAsSignedOut: false)
            try await finishAuthentication()
        }
    }
    private func finishAuthentication() async throws {
        let response: ProfileResponse = try await api.request("/api/me")
        profile = response.user
        lastSignedInFirstName = ProfileName.firstName(from: response.user.name)
        if let lastSignedInFirstName {
            UserDefaults.standard.set(lastSignedInFirstName, forKey: "nexdo.lastSignedInFirstName")
        } else {
            UserDefaults.standard.removeObject(forKey: "nexdo.lastSignedInFirstName")
        }
        try await load()
    }
    func load() async throws {
        tasksLoading = true
        defer { tasksLoading = false }
        // Retain previously loaded data when a refresh fails.
        async let taskResponse: TasksResponse = api.request("/api/tasks")
        async let agendaResponse: Agenda = api.request("/api/agenda?days=5")
        async let intelligenceResponse: ScheduleIntelligenceResponse? = try? api.request("/api/schedule-intelligence?scope=today")
        // Matches the existing web experience: live weather for the configured San Ramon prototype location.
        async let weatherResponse: WeatherResponse? = try? api.request("/api/weather?lat=37.7547&lon=-121.8997")
        let taskData: TasksResponse
        do { taskData = try await taskResponse; tasksLoadFailed = false }
        catch { tasksLoadFailed = true; throw error }
        tasks = taskData.tasks
        let (agendaData, intelligenceData, weatherData) = try await (agendaResponse, intelligenceResponse, weatherResponse)
        agenda = agendaData
        scheduleIntelligence = intelligenceData
        weather = weatherData
    }
    func refresh() async { await perform(errorMessage: "Couldn’t refresh your data. Please try again.") { try await load() } }
    func saveTask(id: String?, title: String, notes: String, duration: Int) async -> Bool {
        var saved = false
        await perform(errorMessage: "Couldn’t update your task. Refresh to check its current state before retrying.") {
            struct Input: Encodable { let title: String; let notes: String; let durationMin: Int }
            let _: Ignore = try await api.request(id.map { "/api/tasks/\($0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!)" } ?? "/api/tasks", method: id == nil ? "POST" : "PATCH", body: JSONEncoder().encode(Input(title: title, notes: notes, durationMin: duration)))
            saved = true
            try await load()
        }
        return saved
    }
    func complete(_ task: NexdoTask) async {
        await perform(errorMessage: "Couldn’t update your task. Refresh to check its current state before retrying.") {
            let _: Ignore = try await api.request("/api/tasks/\(task.id)", method: "PATCH", body: JSONEncoder().encode(["status": task.isDone ? "PLANNED" : "COMPLETED"]))
            try await load()
        }
    }
    private struct TaskResponse: Decodable, Sendable {
        let task: NexdoTask
        var focus: FocusReceipt?
    }
    private struct FocusReceipt: Decodable, Sendable {
        let minutes: Int
        let workSessionId: String?
        let focusToken: String
    }

    private func replaceTask(_ incoming: NexdoTask) {
        var updated = incoming
        if let old = tasks.first(where: { $0.id == incoming.id }) {
            // Mutation responses omit relations; keep them until canonical retrieval.
            if updated.subtasks == nil { updated.subtasks = old.subtasks }
            if updated.recurrence == nil { updated.recurrence = old.recurrence }
        }
        if let index = tasks.firstIndex(where: { $0.id == updated.id }) { tasks[index] = updated }
        else { tasks.append(updated) }
        if let old = agenda {
            agenda = Agenda(timeZone: old.timeZone, range: old.range,
                tasks: old.tasks.map { $0.id == updated.id ? updated : $0 }, events: old.events,
                overdue: old.overdue.compactMap { $0.id == updated.id ? (updated.isDone ? nil : updated) : $0 })
        }
        scheduleIntelligence = nil
    }

    func saveTaskDetails(task: NexdoTask, draft: TaskDraft, original: TaskDraft) async throws {
        guard !busy else { throw TaskEditError.busy }
        guard draft.isValid else { throw TaskEditError.invalid }
        busy = true
        defer { busy = false }
        let body = try draft.detailsBody(comparedTo: original)
        if body != Data("{}".utf8) {
            let response: TaskResponse = try await api.request("/api/tasks/\(task.id)", method: "PATCH", body: body)
            replaceTask(response.task)
            // The PATCH returns the task before updating its relations. Reconcile just
            // this task from the existing retrieval endpoint, without replacing query state.
            if draft.steps != original.steps || draft.recurrence != original.recurrence {
                let response: TasksResponse = try await api.request("/api/tasks")
                if let canonical = response.tasks.first(where: { $0.id == task.id }),
                   let index = tasks.firstIndex(where: { $0.id == task.id }) { tasks[index] = canonical }
            }
        }
        if let schedule = try draft.scheduleBody(comparedTo: original) {
            do {
                let response: TaskResponse = try await api.request("/api/tasks/\(task.id)", method: "PATCH", body: schedule)
                replaceTask(response.task)
            } catch { throw TaskEditError.schedule }
        }
    }

    func changeTaskStatus(_ task: NexdoTask, status: String) async throws {
        guard !busy else { throw TaskEditError.busy }
        if focusSession?.taskID == task.id && status == "COMPLETED" { try await finishFocus() }
        busy = true
        defer { busy = false }
        let response: TaskResponse = try await api.request("/api/tasks/\(task.id)", method: "PATCH", body: JSONEncoder().encode(["status": status]))
        replaceTask(response.task)
        // Completion can create the next occurrence; use the existing task retrieval.
        if task.recurrence != nil && status == "COMPLETED" {
            if let response: TasksResponse = try? await api.request("/api/tasks") { tasks = response.tasks }
        }
    }

    func startFocus(_ task: NexdoTask) async throws {
        guard !busy else { throw TaskEditError.busy }
        if focusSession != nil { try await finishFocus() }
        busy = true
        defer { busy = false }
        let started = Date()
        let body = try JSONSerialization.data(withJSONObject: ["status": "IN_PROGRESS", "focusMinutes": 25])
        let response: TaskResponse = try await api.request("/api/tasks/\(task.id)", method: "PATCH", body: body)
        guard let receipt = response.focus else { throw APIError.invalidResponse }
        replaceTask(response.task)
        focusSession = NativeFocusSession(taskID: task.id, title: task.title,
            endsAt: started.addingTimeInterval(Double(receipt.minutes * 60)), workSessionID: receipt.workSessionId, token: receipt.focusToken)
        focusCompletion?.cancel()
        let token = receipt.focusToken
        let delay = max(0, started.addingTimeInterval(Double(receipt.minutes * 60)).timeIntervalSinceNow)
        focusCompletion = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            // Wait for any user mutation; never overlap two writes in the shared store.
            while self?.busy == true {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
            }
            guard let self, self.focusSession?.token == token else { return }
            do { try await self.finishFocus() }
            catch { self.error = "Couldn’t save your focus time. Use Finish to retry." }
        }
    }

    func finishFocus() async throws {
        guard !busy else { throw TaskEditError.busy }
        guard let session = focusSession else { return }
        busy = true
        defer { busy = false }
        var body: [String: Any] = ["focusAction": "finish", "focusToken": session.token,
            "endedAt": ISO8601DateFormatter().string(from: min(Date(), session.endsAt))]
        if let id = session.workSessionID { body["workSessionId"] = id }
        let _: Ignore = try await api.request("/api/tasks/\(session.taskID)", method: "PATCH", body: JSONSerialization.data(withJSONObject: body))
        focusSession = nil
    }

    @discardableResult
    @discardableResult
    func ask(_ text: String, accept: Bool? = nil) async -> Bool {
        guard aiConsent, !busy, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= 4000 else { return false }
        let proposal = turn?.confirmation?.actionId
        if accept != nil && proposal == nil { return false }
        var succeeded = false
        await perform(errorMessage: "Nexdo couldn’t complete that request. Please try again.") {
            let request = AssistantRequest(transcript: text, contextActionId: contextID, confirmActionId: accept == true ? proposal : nil, rejectActionId: accept == false ? proposal : nil)
            let result: AssistantTurn = try await api.request("/api/assistant", method: "POST", body: JSONEncoder().encode(request))
            turn = result; contextID = result.contextActionId
            succeeded = true
            if accept == true { try await load() }
        }
        return succeeded
    }
    func withdrawConsent() { aiConsent = false; turn = nil; contextID = nil }
    func reset() async {
        await api.clearSession()
        focusCompletion?.cancel(); focusCompletion = nil
        focusSession = nil
        taskQuery = TaskQuery(); tasksLoadFailed = false; profile = nil; tasks = []; agenda = nil; scheduleIntelligence = nil; weather = nil; withdrawConsent()
    }
    func logout() async {
        guard !busy else { return }
        busy = true
        // Local logout succeeds even without connectivity. The server session expires independently.
        let _: Ignore? = try? await api.request("/api/auth/logout", method: "POST")
        await reset(); busy = false
    }
    func deleteAccount() async {
        await perform {
            let _: Ignore = try await api.request("/api/account", method: "DELETE")
            await reset()
        }
    }
}
