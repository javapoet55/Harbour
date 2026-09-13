import SwiftUI

@main
struct NexdoApp: App {
    @UIApplicationDelegateAdaptor(TaskActionAppDelegate.self) private var actionDelegate
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system
    var body: some Scene {
        WindowGroup { RootView().preferredColorScheme(appearance.colorScheme) }
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var profile: Profile?
    @Published var tasks: [NexdoTask] = []
    @Published var projects: [NexdoProject] = []
    @Published var projectsLoading = false
    @Published var projectsLoaded = false
    @Published var projectsError: String?
    @Published var unassignedTaskCount = 0
    @Published var projectMutationBusy = false
    private var projectRevision = 0
    private var projectLoadID: UUID?
    @Published var taskQuery = TaskQuery()
    @Published var tasksLoading = false
    @Published var tasksLoadFailed = false
    @Published var agenda: Agenda?
    @Published var scheduleIntelligence: ScheduleIntelligenceResponse?
    @Published private(set) var intelligenceLoading = false
    @Published private(set) var intelligenceError: String?
    @Published var weather: WeatherResponse?
    @Published var turn: AssistantTurn?
    @Published var lastAssistantPrompt: String?
    @Published var focusSession: NativeFocusSession?
    @Published var busy = false
    @Published var error: String?
    @Published var voiceConsent = false
    @Published var aiConsent = false
    @Published private(set) var lastSignedInFirstName = UserDefaults.standard.string(forKey: "nexdo.lastSignedInFirstName")
    private var contextID: String?
    private var profileRevision = 0
    private var photoSaveInProgress = false
    private var focusCompletion: Task<Void, Never>?
    // Ephemeral cookie session: credentials are never written to preferences, files, or logs.
    private let api: APIClient
    private let weatherClient = WeatherClient()
    private var taskLoadID: UUID?
    private var taskRevision = 0
    private var supplementaryRefresh: Task<Void, Never>?
    private var supplementaryID: UUID?
    private var intelligenceRefresh: Task<Void, Never>?
    private var intelligenceID: UUID?

    init(api: APIClient = try! APIClient(baseURL: URL(string: "https://harbour-production-f8a0.up.railway.app")!)) {
        self.api = api
    }
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
    func reloadProfile() async throws {
        let revision = profileRevision
        let userID = profile?.id
        let response: ProfileResponse = try await api.request("/api/me", timeout: 15)
        guard profileRevision == revision, profile?.id == userID, !photoSaveInProgress else { return }
        profile = response.user
    }
    func saveProfileSettings(_ input: ProfileSettingsInput) async throws {
        let _: Ignore = try await api.request("/api/settings", method: "PATCH", body: JSONEncoder().encode(input), timeout: 15)
        try await reloadProfile()
        lastSignedInFirstName = ProfileName.firstName(from: profile?.name ?? "")
        UserDefaults.standard.set(lastSignedInFirstName, forKey: "nexdo.lastSignedInFirstName")
        refreshSupplementaryData()
    }
    func saveProfilePhoto(_ photo: String?) async throws {
        guard let userID = profile?.id else { throw APIError.signedOut }
        guard !photoSaveInProgress else { throw ProfilePhotoError.saving }
        photoSaveInProgress = true
        defer {
            // Also invalidate reads that started while the upload was pending.
            profileRevision += 1
            photoSaveInProgress = false
        }
        profileRevision += 1
        let revision = profileRevision
        let previous = profile?.photo
        profile?.photo = photo
        do {
            let body = try JSONSerialization.data(withJSONObject: ["photo": photo as Any? ?? NSNull()])
            let receipt: ProfilePhotoReceipt = try await api.request("/api/settings", method: "PATCH", body: body, timeout: 30)
            guard profile?.id == userID, profileRevision == revision else { throw CancellationError() }
            if let saved = receipt.profile {
                guard saved.id == userID, saved.photo == photo else { throw ProfilePhotoError.unconfirmed }
            } else {
                // Older servers return only {ok:true}. Confirm that they really
                // persisted the photo instead of silently ignoring the field.
                let saved: ProfileResponse = try await api.request("/api/me", timeout: 15)
                guard saved.user.id == userID, saved.user.photo == photo else { throw ProfilePhotoError.unconfirmed }
            }
            guard profile?.id == userID, profileRevision == revision else { throw CancellationError() }
            profile?.photo = photo
        } catch {
            if profile?.id == userID, profileRevision == revision { profile?.photo = previous }
            throw error
        }
    }
    private struct ProfilePhotoReceipt: Decodable, Sendable {
        struct Saved: Decodable, Sendable { let id: String; let photo: String? }
        let profile: Saved?
    }
    private enum ProfilePhotoError: LocalizedError {
        case saving, unconfirmed
        var errorDescription: String? {
            switch self {
            case .saving: "A photo is already being saved. Please wait."
            case .unconfirmed: "The server did not confirm your new photo. Please try again."
            }
        }
    }
    func syncProfileCalendars() async throws -> String {
        struct Sync: Decodable, Sendable {
            struct Result: Decodable, Sendable { let error: String? }
            let results: [Result]
        }
        let result: Sync = try await api.request("/api/calendar/sync", method: "POST")
        if result.results.contains(where: { $0.error != nil }) { return "Some calendars could not synchronize. Check their connections in calendar settings." }
        refreshSupplementaryData()
        return result.results.isEmpty ? "No calendars connected yet." : "Calendars synchronized."
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
        // Non-task services must not hold the task spinner or fail a task refresh.
        refreshSupplementaryData()
        try await loadTasks()
    }

    private func loadTasks() async throws {
        guard taskLoadID == nil else { return }
        let requestID = UUID()
        let userID = profile?.id
        let revision = taskRevision
        taskLoadID = requestID
        tasksLoading = true
        tasksLoadFailed = false
        defer {
            if taskLoadID == requestID { taskLoadID = nil; tasksLoading = false }
        }
        do {
            let response: TasksResponse = try await api.request("/api/tasks", timeout: 15)
            guard profile?.id == userID, taskLoadID == requestID else { return }
            // A response captured before a save must not erase the returned task.
            if revision == taskRevision { tasks = response.tasks }
            tasksLoadFailed = false
        } catch {
            guard profile?.id == userID, taskLoadID == requestID else { return }
            if Task.isCancelled || revision != taskRevision { return }
            tasksLoadFailed = true
            throw error
        }
    }

    func refreshTasks() async {
        guard !busy else { return }
        do { try await loadTasks() }
        catch APIError.signedOut { await reset(); error = "Your session expired. Please sign in again." }
        catch { /* Retain tasks and show the inline retry state, without a global alert. */ }
    }

    private func refreshSupplementaryData() {
        guard supplementaryID == nil, let userID = profile?.id else { return }
        let requestID = UUID()
        let revision = taskRevision
        supplementaryID = requestID
        supplementaryRefresh = Task { [weak self] in
            guard let self else { return }
            defer {
                if self.supplementaryID == requestID {
                    self.supplementaryID = nil
                    self.supplementaryRefresh = nil
                }
            }
            async let agendaUpdate: Void = self.refreshAgenda(userID: userID, revision: revision)
            async let intelligenceUpdate: Void = self.refreshScheduleIntelligence()
            async let weatherUpdate: Void = self.refreshWeather(userID: userID)
            _ = await (agendaUpdate, intelligenceUpdate, weatherUpdate)
        }
    }

    private func refreshAgenda(userID: String, revision: Int) async {
        if let value: Agenda = try? await api.request("/api/agenda?days=5", timeout: 15),
           !Task.isCancelled, profile?.id == userID, taskRevision == revision { agenda = value }
    }

    /// Calendar can refresh its analysis independently of slower optional services.
    /// Concurrent callers share a request; mutations cancel obsolete results.
    func refreshScheduleIntelligence() async {
        if let intelligenceRefresh { await intelligenceRefresh.value; return }
        guard let userID = profile?.id else { return }
        let id = UUID()
        let revision = taskRevision
        intelligenceID = id
        intelligenceLoading = true
        intelligenceError = nil
        let refresh = Task { [weak self] in
            guard let self else { return }
            defer {
                if self.intelligenceID == id {
                    self.intelligenceID = nil
                    self.intelligenceRefresh = nil
                    self.intelligenceLoading = false
                }
            }
            do {
                let value: ScheduleIntelligenceResponse = try await self.api.request("/api/schedule-intelligence?scope=today", timeout: 30)
                guard !Task.isCancelled, self.profile?.id == userID, self.intelligenceID == id, self.taskRevision == revision else { return }
                guard value.today.day == ServerDate.day(ISO8601DateFormatter().string(from: Date()), timeZone: value.today.timeZone) else { throw APIError.invalidResponse }
                self.scheduleIntelligence = value
            } catch {
                guard !Task.isCancelled, self.profile?.id == userID, self.intelligenceID == id else { return }
                if case APIError.signedOut = error {
                    await self.reset()
                    self.error = "Your session expired. Please sign in again."
                } else {
                    self.intelligenceError = "Couldn’t update schedule intelligence. Please try again."
                }
            }
        }
        intelligenceRefresh = refresh
        await refresh.value
    }

    private func invalidateScheduleIntelligence() {
        intelligenceRefresh?.cancel()
        intelligenceRefresh = nil
        intelligenceID = nil
        intelligenceLoading = false
        intelligenceError = nil
        scheduleIntelligence = nil
    }

    private func refreshWeather(userID: String) async {
        if let value = try? await weatherClient.forecast(),
           !Task.isCancelled, profile?.id == userID { weather = value }
    }
    func loadWeatherForecast() async throws -> WeatherResponse {
        let userID = profile?.id
        let value = try await weatherClient.forecast()
        try Task.checkCancellation()
        guard value.daily?.days.count == 5 else { throw APIError.invalidResponse }
        if profile?.id == userID { weather = value }
        return value
    }
    func calendarAgenda(from: String, days: Int) async throws -> Agenda {
        do { return try await api.request("/api/agenda?from=\(from)&days=\(days)") }
        catch APIError.signedOut { await reset(); throw APIError.signedOut }
    }
    func refresh() async {
        guard !busy else { return }
        refreshSupplementaryData()
        await refreshTasks()
    }
    func voiceTaskSession() async throws -> VoiceTaskSession {
        guard aiConsent && voiceConsent else { throw APIError.response(403) }
        return try await api.request("/api/realtime/task-session", method: "POST", body: JSONEncoder().encode(["consent": true]), timeout: 25)
    }

    func voiceTranscriptionSession() async throws -> VoiceTaskSession {
        guard aiConsent && voiceConsent else { throw APIError.response(403) }
        return try await api.request("/api/realtime/transcription-session", method: "POST", body: JSONEncoder().encode(["consent": true]), timeout: 25)
    }

    func executeVoiceTool(name: String, arguments: Data, sessionID: UUID, callID: String) async throws -> Data {
        guard aiConsent && voiceConsent, let userID = profile?.id else { throw APIError.signedOut }
        let args = try JSONSerialization.jsonObject(with: arguments)
        let body = try JSONSerialization.data(withJSONObject: ["consent": true, "sessionId": sessionID.uuidString, "callId": callID, "name": name, "arguments": args])
        let response: VoiceToolResponse = try await api.request("/api/realtime/tool", method: "POST", body: body, timeout: 30)
        // Only reconcile this account. A dismissed voice screen does not discard a saved task.
        if profile?.id == userID, response.success, let task = response.task {
            replaceTask(task)
            if name == "delete_task" { tasks.removeAll { $0.id == task.id } }
        }
        return try JSONEncoder().encode(response)
    }

    func saveTask(id: String?, title: String, notes: String, duration: Int, scheduledAt: Date? = nil, projectId: String? = nil) async -> Bool {
        var saved = false
        await perform(errorMessage: "Couldn’t update your task. Refresh to check its current state before retrying.") {
            let input = TaskSaveInput(title: title, notes: notes, durationMin: duration, isNew: id == nil, scheduledAt: scheduledAt, projectId: projectId)
            let response: TaskResponse = try await api.request(id.map { "/api/tasks/\($0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!)" } ?? "/api/tasks", method: id == nil ? "POST" : "PATCH", body: JSONEncoder().encode(input))
            replaceTask(response.task)
            tasksLoadFailed = false
            if id == nil { taskQuery.revealCreatedTask(scheduledAt: scheduledAt, timeZone: profile?.timeZone ?? TimeZone.current.identifier) }
            saved = true
        }
        return saved
    }
    func complete(_ task: NexdoTask) async {
        await perform(errorMessage: "Couldn’t update your task. Refresh to check its current state before retrying.") {
            let response: TaskResponse = try await api.request("/api/tasks/\(task.id)", method: "PATCH", body: JSONEncoder().encode(["status": task.isDone ? "PLANNED" : "COMPLETED"]))
            replaceTask(response.task)
            invalidateScheduleIntelligence()
            Task { await refreshScheduleIntelligence() }
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
        reconcileProjectCounts(old: tasks.first { $0.id == incoming.id }, new: incoming)
        taskRevision += 1
        var updated = incoming
        if let old = tasks.first(where: { $0.id == incoming.id }) {
            // Mutation responses omit relations; keep them until canonical retrieval.
            if updated.category == nil { updated.category = old.category }
            if updated.subtasks == nil { updated.subtasks = old.subtasks }
            if updated.recurrence == nil { updated.recurrence = old.recurrence }
        }
        if let index = tasks.firstIndex(where: { $0.id == updated.id }) { tasks[index] = updated }
        else { tasks.append(updated) }
        if let old = agenda {
            agenda = Agenda(timeZone: old.timeZone, range: old.range,
                tasks: old.tasks.contains(where: { $0.id == updated.id }) ? old.tasks.map { $0.id == updated.id ? updated : $0 } : old.tasks + [updated], events: old.events,
                overdue: old.overdue.compactMap { $0.id == updated.id ? (updated.isDone ? nil : updated) : $0 })
        }
        invalidateScheduleIntelligence()
        Task { await refreshScheduleIntelligence() }
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
                // Scheduling is persisted separately from the task metadata.
                // The PATCH response may be a pre-relation snapshot, so fetch
                // the canonical task before returning to deadline lists.
                if let canonical: TasksResponse = try? await api.request("/api/tasks", timeout: 15),
                   let updated = canonical.tasks.first(where: { $0.id == task.id }) {
                    replaceTask(updated)
                }
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
        replaceTask(response.task)
        // Older API deployments return the updated task without a focus receipt.
        // The Pomodoro remains useful locally and must not fail after a successful status update.
        let receipt = response.focus
        let minutes = receipt?.minutes ?? 25
        let end = started.addingTimeInterval(Double(minutes * 60))
        focusSession = NativeFocusSession(taskID: task.id, title: task.title,
            endsAt: end, workSessionID: receipt?.workSessionId,
            token: receipt?.focusToken ?? UUID().uuidString, serverBacked: receipt != nil)
        focusCompletion?.cancel()
        let token = focusSession!.token
        let delay = max(0, end.timeIntervalSinceNow)
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
        if !session.serverBacked {
            focusCompletion?.cancel(); focusCompletion = nil
            focusSession = nil
            return
        }
        busy = true
        defer { busy = false }
        var body: [String: Any] = ["focusAction": "finish", "focusToken": session.token,
            "endedAt": ISO8601DateFormatter().string(from: min(Date(), session.endsAt))]
        if let id = session.workSessionID { body["workSessionId"] = id }
        let _: Ignore = try await api.request("/api/tasks/\(session.taskID)", method: "PATCH", body: JSONSerialization.data(withJSONObject: body))
        focusSession = nil
    }

    /// Uses the same authenticated cookie session as task and assistant requests.
    func transcribeVoice(_ audio: Data) async throws -> String {
        guard aiConsent, voiceConsent else { throw VoiceUploadError.consentRequired }
        let upload = try VoiceUpload(audio: audio)
        do {
            let result: VoiceTranscript = try await api.request("/api/transcribe", method: "POST", body: upload.body, contentType: upload.contentType)
            try Task.checkCancellation()
            guard aiConsent, voiceConsent else { throw VoiceUploadError.consentRequired }
            return try result.validatedText()
        } catch APIError.signedOut {
            await reset()
            throw APIError.signedOut
        }
    }

    func speechAudio(for text: String) async throws -> Data {
        guard aiConsent, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw VoiceUploadError.consentRequired }
        do {
            let data = try await api.requestData("/api/speech", method: "POST", body: JSONEncoder().encode(["text": text]), timeout: 50, expectedMimeType: "audio/mpeg")
            try Task.checkCancellation()
            guard aiConsent else { throw VoiceUploadError.consentRequired }
            return data
        }
        catch APIError.signedOut { await reset(); throw APIError.signedOut }
    }

    @discardableResult
    func ask(_ text: String, accept: Bool? = nil) async -> Bool {
        guard aiConsent, !busy, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= 4000 else { return false }
        let proposal = turn?.confirmation?.actionId
        if accept != nil && proposal == nil { return false }
        var succeeded = false
        await perform(errorMessage: "Nexdo couldn’t complete that request. Please try again.") {
            let request = AssistantRequest(transcript: text, contextActionId: contextID, confirmActionId: accept == true ? proposal : nil, rejectActionId: accept == false ? proposal : nil)
            let result: AssistantTurn = try await api.request("/api/assistant", method: "POST", body: JSONEncoder().encode(request))
            turn = result; lastAssistantPrompt = text; contextID = result.contextActionId
            succeeded = true
            if accept == true || result.createdTaskId != nil {
                invalidateScheduleIntelligence()
                Task { await refreshScheduleIntelligence() }
                try await load()
            }
        }
        return succeeded
    }
    func weeklySummary(start: String) async throws -> WeeklySummary {
        try await api.request("/api/weekly-summary?start=\(start)", timeout: 30)
    }
    func weeklySummaryTasks(for summary: WeeklySummary) async throws -> WeeklySummary.TaskGroups {
        if let groups = summary.taskGroups { return groups }
        let response: TasksResponse = try await api.request("/api/tasks", timeout: 15)
        return try summary.taskGroups(from: response.tasks)
    }
    func withdrawConsent() { voiceConsent = false; aiConsent = false; turn = nil; lastAssistantPrompt = nil; contextID = nil }
    func reset() async {
        profileRevision += 1
        projectRevision += 1; projectLoadID = nil; projects = []; projectsLoaded = false; projectsLoading = false; projectsError = nil; unassignedTaskCount = 0
        invalidateScheduleIntelligence()
        taskLoadID = nil; tasksLoading = false; taskRevision += 1
        supplementaryRefresh?.cancel(); supplementaryRefresh = nil; supplementaryID = nil
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


extension AppModel {
    func refreshProjects() async {
        guard let userID = profile?.id else { return }
        let id = UUID(); projectLoadID = id
        let revision = projectRevision
        projectsLoading = true; projectsError = nil
        defer { if projectLoadID == id { projectsLoading = false; projectLoadID = nil } }
        do {
            let response: ProjectsResponse = try await api.request("/api/projects", timeout: 15)
            guard !Task.isCancelled, profile?.id == userID, projectLoadID == id, projectRevision == revision else { return }
            projects = response.projects; unassignedTaskCount = response.unassignedTaskCount; projectsLoaded = true
        } catch {
            guard !Task.isCancelled, profile?.id == userID, projectLoadID == id, projectRevision == revision else { return }
            if case APIError.signedOut = error { await reset(); self.error = "Your session expired. Please sign in again." }
            else { projectsError = "Couldn’t refresh projects. Check your connection and try again." }
        }
    }
    func saveProject(id: String?, name: String, color: String) async throws {
        guard !projectMutationBusy else { throw TaskEditError.busy }
        guard ProjectQuery.validName(name) else { throw TaskEditError.invalid }
        let userID = profile?.id
        projectMutationBusy = true
        defer { projectMutationBusy = false }
        let response: ProjectResponse = try await api.request(id.map { "/api/projects/\($0)" } ?? "/api/projects", method: id == nil ? "POST" : "PATCH", body: JSONEncoder().encode(ProjectInput(name: name.trimmingCharacters(in: .whitespacesAndNewlines), color: color)))
        guard profile?.id == userID else { return }
        projectRevision += 1
        if let index = projects.firstIndex(where: { $0.id == response.project.id }) { projects[index] = response.project }
        else { projects.append(response.project) }
        projectsLoaded = true; projectsError = nil
        Task { await refreshProjects() }
    }
    func deleteProject(_ project: NexdoProject) async throws {
        guard !projectMutationBusy, !busy else { throw TaskEditError.busy }
        let userID = profile?.id
        projectMutationBusy = true
        defer { projectMutationBusy = false }
        let _: Ignore = try await api.request("/api/projects/\(project.id)", method: "DELETE")
        guard profile?.id == userID else { return }
        projectRevision += 1; taskRevision += 1
        unassignedTaskCount += projects.first(where: { $0.id == project.id })?.totalTaskCount ?? 0
        projects.removeAll { $0.id == project.id }
        func unassign(_ task: NexdoTask) -> NexdoTask { var result = task; if result.projectId == project.id { result.projectId = nil }; return result }
        tasks = tasks.map(unassign)
        if let old = agenda { agenda = Agenda(timeZone: old.timeZone, range: old.range, tasks: old.tasks.map(unassign), events: old.events, overdue: old.overdue.map(unassign)) }
        invalidateScheduleIntelligence()
        Task { await refreshProjects(); await refreshScheduleIntelligence() }
    }
    private func reconcileProjectCounts(old: NexdoTask?, new: NexdoTask) {
        projectRevision += 1
        func apply(_ task: NexdoTask, delta: Int) {
            guard task.status != "CANCELLED" else { return }
            if let id = task.projectId, let index = projects.firstIndex(where: { $0.id == id }) {
                projects[index].totalTaskCount = max(0, projects[index].totalTaskCount + delta)
                if task.isDone { projects[index].completedTaskCount = max(0, projects[index].completedTaskCount + delta) }
            } else if task.projectId == nil { unassignedTaskCount = max(0, unassignedTaskCount + delta) }
        }
        if let old { apply(old, delta: -1) }
        apply(new, delta: 1)
        Task { await refreshProjects() }
    }
}
