import SwiftUI
import AuthenticationServices

private struct ShoppingEmailSnapshot: Decodable {
    struct Account: Decodable { let email: String; let status: String }
    struct Run: Decodable, Identifiable { let id: String; let status: String; let dueAt: String; let detail: String? }
    struct Schedule: Decodable {
        let recipient: String; let recipientName: String; let timeZone: String
        let weekday: Int; let hour: Int; let minute: Int; let enabled: Bool
        let nextRunAt: String; let runs: [Run]
    }
    let schedule: Schedule?; let account: Account?; let available: Bool
}
@MainActor private final class ShoppingEmailOAuth: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
    func start(_ url: URL, completion: @escaping (Bool) -> Void) {
        session = ASWebAuthenticationSession(url: url, callbackURLScheme: "nexdo") { callback, _ in
            Task { @MainActor in
                let ok = callback?.host == "moments-email" && callback.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }?.queryItems?.first(where: { $0.name == "status" })?.value == "connected"
                completion(ok); self.session = nil
            }
        }
        session?.presentationContextProvider = self
        session?.prefersEphemeralWebBrowserSession = true
        if session?.start() != true { completion(false) }
    }
}
struct ShoppingEmailView: View {
    @ObservedObject var store: ShoppingStore
    let list: GroceryList
    @StateObject private var oauth = ShoppingEmailOAuth()
    @State private var snapshot: ShoppingEmailSnapshot?
    @State private var recipient = ""
    @State private var name = ""
    @State private var zone = TimeZone.current.identifier
    @State private var weekday = 6
    @State private var time = Calendar.current.date(from: DateComponents(hour: 10)) ?? Date()
    @State private var consent = false
    @State private var busy = false
    @State private var error: String?
    private let days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    var body: some View {
        Form {
            Section {
                Label("Weekly shopping email", systemImage: "envelope.badge.clock")
                Text("Email the latest unpurchased items to your store manager, even when NexDo is closed. Empty lists are skipped.").font(.subheadline).foregroundStyle(.secondary)
                Text(list.title).font(.headline)
            }
            Section("Send from") {
                if let account = snapshot?.account { Text(account.email); Text(account.status.capitalized).foregroundStyle(.secondary) }
                Button("Connect / Reconnect Gmail") { Task { await connect() } }.disabled(busy || snapshot?.available != true)
                if snapshot?.available == false { Text("Weekly email is not enabled on this server yet.").foregroundStyle(.secondary) }
            }
            Section("Store manager") {
                TextField("Name", text: $name)
                TextField("Email address", text: $recipient).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Section("Repeat weekly") {
                Picker("Day", selection: $weekday) { ForEach(0..<7, id: \.self) { Text(days[$0]).tag($0) } }
                DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                TextField("Timezone", text: $zone).textInputAutocapitalization(.never).autocorrectionDisabled()
                Text("The time is in this timezone, including daylight saving changes. Sending may take a few minutes. A recurring list’s schedule follows its next shopping trip.").font(.caption).foregroundStyle(.secondary)
            }
            Section("Permission") {
                Toggle("I authorize NexDo to email this list to this recipient automatically each week.", isOn: $consent)
                Text("Saving replaces the schedule. Pause future emails below. An email already submitted cannot be recalled.").font(.caption).foregroundStyle(.secondary)
                Button("Save weekly schedule") { Task { await save() } }
                    .disabled(busy || !consent || recipient.isEmpty || name.isEmpty || snapshot?.available != true || snapshot?.account?.status != "connected")
                if snapshot?.schedule?.enabled == true {
                    Button("Pause weekly emails", role: .destructive) { Task { await change(["operation":"pause", "listId":list.id]) } }.disabled(busy)
                }
            }
            if let schedule = snapshot?.schedule {
                Section("Schedule status") {
                    Text(schedule.enabled ? "Active" : "Paused")
                    if schedule.enabled { Text("Next run: \(displayDate(schedule.nextRunAt))") }
                    Text("Recipient: \(schedule.recipient)")
                }
                Section("Recent emails") {
                    if schedule.runs.isEmpty { Text("No emails sent yet.").foregroundStyle(.secondary) }
                    ForEach(schedule.runs) { run in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(run.status.capitalized).font(.headline)
                            Text(displayDate(run.dueAt)).font(.caption)
                            if let detail = run.detail { Text(detail).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    Text("Sent means Gmail accepted the email. It does not mean the store confirmed an order.").font(.caption)
                }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }
        .navigationTitle("Weekly email")
        .task { await load() }
        .refreshable { await load() }
    }
    private func displayDate(_ text: String) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: text) else { return text }
        let out = DateFormatter(); out.dateStyle = .medium; out.timeStyle = .short; out.timeZone = TimeZone(identifier: zone)
        return out.string(from: date) + " (\(zone))"
    }
    @MainActor private func load() async {
        busy = true; defer { busy = false }
        do {
            let value: ShoppingEmailSnapshot = try await store.api.request("/api/shopping/email-schedule?listId=\(list.id)")
            snapshot = value
            if let s = value.schedule {
                recipient = s.recipient; name = s.recipientName; zone = s.timeZone; weekday = s.weekday
                time = Calendar.current.date(from: DateComponents(hour: s.hour, minute: s.minute)) ?? time
            }
            consent = false; error = nil
        } catch { self.error = error.localizedDescription }
    }
    @MainActor private func change(_ object: [String: Any]) async {
        busy = true; defer { busy = false }
        do {
            snapshot = try await store.api.request("/api/shopping/email-schedule", method: "POST", body: JSONSerialization.data(withJSONObject: object))
            consent = false; error = nil
        } catch { self.error = error.localizedDescription }
    }
    @MainActor private func save() async {
        let c = Calendar.current.dateComponents([.hour, .minute], from: time)
        await change(["operation":"save", "listId":list.id, "input":["recipient":recipient, "recipientName":name, "timeZone":zone, "weekday":weekday, "hour":c.hour ?? 10, "minute":c.minute ?? 0, "consent":consent]])
    }
    @MainActor private func connect() async {
        busy = true; defer { busy = false }
        do {
            struct Link: Decodable { let url: String }
            let link: Link = try await store.api.request("/api/shopping/email-schedule", method:"POST", body:JSONSerialization.data(withJSONObject:["operation":"connect", "listId":list.id]))
            guard let url = URL(string:link.url) else { throw APIError.invalidResponse }
            oauth.start(url) { ok in Task { @MainActor in if ok { await load() } else { error = "Email connection cancelled or failed." } } }
        } catch { self.error = error.localizedDescription }
    }
}
