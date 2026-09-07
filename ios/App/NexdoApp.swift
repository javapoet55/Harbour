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
    @Published var busy = false
    @Published var error: String?
    @Published var aiConsent = false
    @Published private(set) var lastSignedInFirstName = UserDefaults.standard.string(forKey: "nexdo.lastSignedInFirstName")
    private var contextID: String?
    // Ephemeral cookie session: credentials are never written to preferences, files, or logs.
    private let api = try! APIClient(baseURL: URL(string: "https://harbour-production-f8a0.up.railway.app")!)
    private struct Ignore: Decodable, Sendable {}

    func perform(_ action: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { try await action() }
        catch APIError.signedOut { await reset(); error = "Please sign in again. Your session ended or the credentials were incorrect." }
        catch { self.error = "Couldn’t complete the request. Refresh to check the current state before retrying." }
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
        tasks = taskData.tasks
        agenda = agendaData
        scheduleIntelligence = intelligenceData
        weather = weatherData
    }
    func refresh() async { await perform { try await load() } }
    func saveTask(id: String?, title: String, notes: String, duration: Int) async -> Bool {
        var saved = false
        await perform {
            struct Input: Encodable { let title: String; let notes: String; let durationMin: Int }
            let _: Ignore = try await api.request(id.map { "/api/tasks/\($0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!)" } ?? "/api/tasks", method: id == nil ? "POST" : "PATCH", body: JSONEncoder().encode(Input(title: title, notes: notes, durationMin: duration)))
            saved = true
            try await load()
        }
        return saved
    }
    func complete(_ task: NexdoTask) async {
        await perform {
            let _: Ignore = try await api.request("/api/tasks/\(task.id)", method: "PATCH", body: JSONEncoder().encode(["status": task.isDone ? "PLANNED" : "COMPLETED"]))
            try await load()
        }
    }
    func ask(_ text: String, accept: Bool? = nil) async {
        guard aiConsent else { return }
        let proposal = turn?.confirmation?.actionId
        if accept != nil && proposal == nil { return }
        await perform {
            let request = AssistantRequest(transcript: text, contextActionId: contextID, confirmActionId: accept == true ? proposal : nil, rejectActionId: accept == false ? proposal : nil)
            let result: AssistantTurn = try await api.request("/api/assistant", method: "POST", body: JSONEncoder().encode(request))
            turn = result; contextID = result.contextActionId
            if accept == true { try await load() }
        }
    }
    func withdrawConsent() { aiConsent = false; turn = nil; contextID = nil }
    func reset() async {
        await api.clearSession()
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
