import EventKit
import SwiftUI

struct AppleCalendarChoice: Identifiable, Sendable {
    let id: String
    let title: String
    let account: String
}

/// All EventKit objects stay inside one actor; only value snapshots cross to the UI.
actor AppleCalendarService {
    static let shared = AppleCalendarService()
    private let store = EKEventStore()

    func requestAccess() async throws -> Bool { try await store.requestFullAccessToEvents() }

    func calendars() -> [AppleCalendarChoice] {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { return [] }
        return store.calendars(for: .event).map {
            AppleCalendarChoice(id: $0.calendarIdentifier, title: $0.title, account: $0.source.title)
        }.sorted { ($0.account, $0.title) < ($1.account, $1.title) }
    }

    func events(start: Date, end: Date, selectedIDs: Set<String>?) -> [CalendarEvent] {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess, end > start else { return [] }
        let calendars = store.calendars(for: .event).filter { selectedIDs?.contains($0.calendarIdentifier) ?? true }
        // An empty selection must not become EventKit's nil (all calendars).
        guard !calendars.isEmpty else { return [] }
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
        var seen = Set<String>()
        return store.events(matching: predicate).filter { $0.status != .canceled }.compactMap { event in
            guard let start = event.startDate, let end = event.endDate, let calendar = event.calendar else { return nil }
            let value = DeviceCalendarEvent.make(identifier: event.eventIdentifier ?? event.calendarItemIdentifier,
                calendarID: calendar.calendarIdentifier, title: event.title ?? "Untitled event", start: start, end: end,
                allDay: event.isAllDay, timeZone: event.timeZone?.identifier ?? TimeZone.current.identifier,
                notes: event.notes, location: event.location)
            return seen.insert(value.id).inserted ? value : nil
        }
    }
}

enum AppleCalendarSelection {
    static let changed = Notification.Name("NexdoAppleCalendarSelectionChanged")
    private static func key(_ owner: String) -> String { "nexdo.apple-calendar.selection." + owner }
    static func selectedIDs(owner: String) -> Set<String>? {
        UserDefaults.standard.stringArray(forKey: key(owner)).map { Set($0) }
    }
    static func save(_ ids: Set<String>, owner: String) {
        UserDefaults.standard.set(Array(ids).sorted(), forKey: key(owner))
        NotificationCenter.default.post(name: changed, object: nil)
    }
}

struct AppleCalendarSelectionView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var calendars: [AppleCalendarChoice] = []
    @State private var selected = Set<String>()
    @State private var allowed = false
    @State private var loading = false
    @State private var failure: String?
    var body: some View {
        List {
            Section {
                Text("Selected calendars appear in NexDo’s Schedule, Week, and Month views on this iPhone. Events stay on this device. Edit them in Apple Calendar.")
                if !allowed {
                    Button("Allow calendar access") { Task { await load(requestPermission: true) } }.disabled(loading)
                    Button("Open iPhone Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
                }
                if loading { ProgressView("Loading calendars…") }
                if let failure { Text(failure).foregroundStyle(.red) }
            }
            if allowed {
                Section("Calendars to show") {
                    ForEach(calendars) { calendar in
                        Toggle(isOn: Binding(get: { selected.contains(calendar.id) }, set: { enabled in
                            if enabled { selected.insert(calendar.id) } else { selected.remove(calendar.id) }
                            if let owner = model.profile?.id { AppleCalendarSelection.save(selected, owner: owner) }
                        })) { VStack(alignment: .leading) { Text(calendar.title); Text(calendar.account).font(.caption).foregroundStyle(.secondary) } }
                    }
                    if calendars.isEmpty { Text("No calendars are available on this iPhone. Add an account in iPhone Settings → Apps → Calendar → Calendar Accounts.") }
                    else if selected.isEmpty { Text("All calendars are hidden. Turn on a calendar to show its events.").foregroundStyle(.secondary) }
                }
                Section { NavigationLink("Import birthdays and anniversaries into Moments") { MomentCalendarImportView() } }
            }
        }
        .navigationTitle("Apple Calendars")
        .task(id: model.profile?.id) { await load() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await load() } } }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged)) { _ in Task { await load() } }
    }
    private func load(requestPermission: Bool = false) async {
        let owner = model.profile?.id
        loading = true; failure = nil
        defer { loading = false }
        do {
            if requestPermission { _ = try await AppleCalendarService.shared.requestAccess() }
            let choices = await AppleCalendarService.shared.calendars()
            guard model.profile?.id == owner, !Task.isCancelled else { return }
            allowed = EKEventStore.authorizationStatus(for: .event) == .fullAccess
            calendars = choices
            selected = owner.flatMap { AppleCalendarSelection.selectedIDs(owner: $0) } ?? Set(choices.map(\.id))
            if requestPermission && !allowed { failure = "Full Calendar access is needed to read events. Enable it in iPhone Settings." }
        } catch { failure = "Calendar access is unavailable. Check NexDo’s Calendar permission in iPhone Settings." }
    }
}
