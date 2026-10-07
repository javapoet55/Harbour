import SwiftUI
import AuthenticationServices

private struct ShoppingEmailSnapshot: Decodable {
    struct Account: Decodable { let email: String; let status: String }
    struct Run: Decodable, Identifiable { let id: String; let status: String; let dueAt: String; let detail: String? }
    struct Schedule: Decodable {
        let recipient: String; let recipientName: String; let timeZone: String
        let weekday: Int; let hour: Int; let minute: Int; let enabled: Bool
        let nextRunAt: String; let runs: [Run]
        let customerPhone: String?
        let pickupDate: String?; let pickupStartHour: Int?
    }
    let schedule: Schedule?; let account: Account?; let available: Bool
}
@MainActor private final class ShoppingEmailOAuth: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
    func start(_ url: URL, completion: @escaping (String?) -> Void) {
        session = ASWebAuthenticationSession(url: url, callbackURLScheme: "nexdo") { callback, _ in
            Task { @MainActor in
                completion(MomentEmailOAuth.ticket(from: callback)); self.session = nil
            }
        }
        session?.presentationContextProvider = self
        session?.prefersEphemeralWebBrowserSession = true
        if session?.start() != true { completion(nil) }
    }
}
struct ShoppingEmailView: View {
    @ObservedObject var store: ShoppingStore
    let list: GroceryList
    @StateObject private var oauth = ShoppingEmailOAuth()
    @State private var snapshot: ShoppingEmailSnapshot?
    @State private var recipient = ""
    @State private var customerPhone = ""
    @State private var name = ""
    @State private var zone = TimeZone.current.identifier
    @State private var weekday = 6
    @State private var time = Calendar.current.date(from: DateComponents(hour: 10)) ?? Date()
    @State private var pickupDate = Date()
    @State private var pickupStartHour = 9
    @State private var consent = false
    @State private var busy = false
    @State private var error: String?
    @State private var didLoadSchedule = false
    private let days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    private let ink = Color(red: 0.07, green: 0.06, blue: 0.22)
    private let muted = Color(red: 0.36, green: 0.40, blue: 0.61)
    private let purple = Color(red: 0.43, green: 0.25, blue: 1)
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                introduction
                card(list.title, subtitle: "Selected list for weekly sharing.", icon: "cart") {
                    HStack {
                        Text("\(list.items.count - list.remaining) to send · \(list.items.count) items")
                            .font(.caption).foregroundStyle(muted)
                    }.padding(14).background(purple.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                }
                senderCard
                card("Store manager", subtitle: "Enter the name and email of the recipient.", icon: "people") {
                    let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
                    layout {
                        field("Name") { TextField("Name", text: $name).textContentType(.name) }
                        field("Email") {
                            TextField("Email address", text: $recipient)
                                .keyboardType(.emailAddress).textContentType(.emailAddress)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                        }
                    }
                }
                card("Your contact number", subtitle: "The store will use this number for pickup updates and questions. It will be included in your email.", icon: "sender") {
                    field("Your phone number (required)") {
                        TextField("+1 415 555 0123", text: $customerPhone)
                            .keyboardType(.phonePad).textContentType(.telephoneNumber)
                            .accessibilityLabel("Your phone number")
                            .accessibilityIdentifier("shopping-customer-phone")
                    }
                    Text("Include your country code, for example +1.").font(.caption).foregroundStyle(muted)
                }
                scheduleCard
                permissionCard
                if let schedule = snapshot?.schedule { statusCard(schedule) }
                if let error {
                    Label(error, systemImage: "exclamationmark.circle")
                        .font(.subheadline).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading)
                        .padding().background(.white, in: RoundedRectangle(cornerRadius: 18))
                        .accessibilityIdentifier("shopping-email-error")
                }
                actions
                if let schedule = snapshot?.schedule, !schedule.runs.isEmpty {
                    card("Recent emails", subtitle: "Sent means Gmail accepted the email, not that the store confirmed an order.", icon: "sender") {
                        ForEach(schedule.runs) { run in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(run.status.capitalized).font(.subheadline.bold())
                                Text(displayDate(run.dueAt)).font(.caption).foregroundStyle(muted)
                                if let detail = run.detail { Text(detail).font(.caption).foregroundStyle(muted) }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }.padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 28)
        }
        .background(LinearGradient(colors: [Color(red: 0.96, green: 0.97, blue: 1), Color(red: 0.97, green: 0.95, blue: 1)], startPoint: .topLeading, endPoint: .bottomTrailing))
        #if DEBUG
        .defaultScrollAnchor(ProcessInfo.processInfo.arguments.contains("-shopping-email-bottom-preview") ? .bottom : .top)
        #endif
        .foregroundStyle(ink).tint(purple)
        .navigationTitle("Share List").navigationBarTitleDisplayMode(.inline)
        .task { await load() }.refreshable { await load() }
        .disabled(busy)
        .overlay { if busy { ProgressView().padding(18).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                asset("email", size: 50)
                VStack(alignment: .leading, spacing: 7) {
                    Text("WEEKLY SHOPPING EMAIL").font(.caption2.weight(.semibold)).tracking(1.5).foregroundStyle(purple)
                    Text("Send your shopping list automatically").font(.title3.bold())
                    Text("Send checked shopping items to your store manager every week, even when NexDo is closed. Unchecked items are excluded. If nothing is checked, the email is skipped.")
                        .font(.subheadline).foregroundStyle(muted)
                }
            }
            HStack(spacing: 10) {
                Image(systemName: "lightbulb.fill").foregroundStyle(.blue)
                Text("Keep your store in sync. Save time on your weekly shop.").font(.caption).foregroundStyle(Color.blue)
                Spacer(minLength: 0)
                Image("share-list-plane").resizable().scaledToFit().frame(width: 48, height: 32).blendMode(.multiply).accessibilityHidden(true)
            }.padding(12).background(purple.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
        }.padding(18).background(LinearGradient(colors: [.white, Color(red: 0.97, green: 0.94, blue: 1)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 24))
    }

    private var senderCard: some View {
        card("Send from", subtitle: "Emails are sent from your connected Gmail account.", icon: "sender") {
            if let account = snapshot?.account {
                ViewThatFits(in: .horizontal) {
                    HStack { Text(account.email).font(.subheadline); Spacer(); connectionBadge(account.status) }
                    VStack(alignment: .leading, spacing: 8) { Text(account.email).font(.subheadline); connectionBadge(account.status) }
                }.padding(12).background(purple.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
            }
            if let snapshot, snapshot.account?.status != "connected" {
                HStack {
                    Button("Connect / Reconnect Gmail") { Task { await connect() } }.disabled(!snapshot.available)
                    Spacer()
                    NavigationLink { ProfileSettingsView(openCalendarSettings: true) } label: {
                        Image(systemName: "gearshape").frame(width: 44, height: 44)
                    }.accessibilityLabel("Open Profile calendar settings")
                }.font(.subheadline)
            }
            if snapshot?.available == false { Text("Weekly email is not enabled on this server yet.").font(.caption).foregroundStyle(muted) }
        }
    }

    private var scheduleCard: some View {
        card("Schedule", subtitle: "Choose when to send your list.", icon: "calendar") {
            field("Timezone") {
                Picker("Timezone", selection: $zone) {
                    ForEach(Array(Set(TimeZone.knownTimeZoneIdentifiers + [zone, "UTC"])).sorted(), id: \.self) { id in
                        Text(id.replacingOccurrences(of: "_", with: " ")).tag(id)
                    }
                }.pickerStyle(.menu).labelsHidden().accessibilityLabel("Schedule timezone")
            }
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
            layout {
                field("Repeat") {
                    Picker("Day", selection: $weekday) {
                        ForEach(0..<7, id: \.self) { Text(days[$0]).tag($0) }
                    }.labelsHidden().accessibilityLabel("Repeat weekly on")
                }
                field("Time") {
                    DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                        .labelsHidden().accessibilityLabel("Send time")
                }
            }

            Text("Preferred pickup time").font(.subheadline.bold())
            field("Date") {
                DatePicker("Pickup date", selection: $pickupDate, displayedComponents: .date)
                    .labelsHidden().accessibilityLabel("Preferred pickup date")
            }
            field("Pickup window") {
                Picker("Pickup window", selection: $pickupStartHour) {
                    ForEach(9..<20, id: \.self) { hour in Text(pickupWindow(hour)).tag(hour) }
                }.pickerStyle(.menu).labelsHidden().accessibilityLabel("Preferred pickup window")
            }
            note("Pickup repeats weekly from the selected date and is a request for the store to confirm.")
            note("The time follows this timezone, including daylight saving changes. Sending may take a few minutes. A recurring list follows its next shopping trip.")
        }
    }

    private func pickupWindow(_ hour: Int) -> String {
        func label(_ h: Int) -> String { "\(h > 12 ? h - 12 : h) \(h < 12 ? "AM" : "PM")" }
        return "\(label(hour)) – \(label(hour + 1))"
    }
    private var pickupDateText: String {
        let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: pickupDate)
    }
    private var permissionCard: some View {
        card("Permission", subtitle: "Allow NexDo to email this list automatically each week.", icon: "shield") {
            Toggle("Authorize weekly emails to this recipient", isOn: $consent)
                .font(.subheadline).tint(.blue).accessibilityIdentifier("shopping-email-permission")
            note("Saving replaces the schedule. Pause future emails below. An email already submitted cannot be recalled.")
            if let reason = saveBlocker {
                Text(reason).font(.caption).foregroundStyle(muted)
                if snapshot == nil || snapshot?.available == false {
                    Button("Check availability again") { Task { await load() } }.font(.subheadline)
                }
            }
        }
    }

    private func statusCard(_ schedule: ShoppingEmailSnapshot.Schedule) -> some View {
        card("Schedule status", subtitle: schedule.enabled ? "Your weekly emails are active." : "Your weekly emails are paused.", icon: "check") {
            VStack(alignment: .leading, spacing: 10) {
                Label(schedule.enabled ? "Active" : "Paused", systemImage: schedule.enabled ? "circle.fill" : "pause.circle")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(schedule.enabled ? Color(red: 0, green: 0.5, blue: 0.36) : muted)
                if schedule.enabled { Text("Next run: \(displayDate(schedule.nextRunAt))").font(.caption).foregroundStyle(muted) }
                Divider()
                Label(schedule.recipient, systemImage: "envelope").font(.subheadline).textSelection(.enabled)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(14)
                .background(Color.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
        }
    }

    private var actions: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            if snapshot?.schedule?.enabled == true {
                Button { Task { await change(["operation":"pause", "listId":list.id]) } } label: {
                    Label("Pause emails", systemImage: "pause.fill").font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 50)
                }.foregroundStyle(Color(red: 0.85, green: 0.08, blue: 0.25))
                    .background(Color(red: 1, green: 0.9, blue: 0.93), in: Capsule())
                    .accessibilityLabel("Pause weekly emails")
            }
            Button { Task { await save() } } label: {
                Label(snapshot?.schedule == nil ? "Save schedule" : "Save changes", systemImage: "square.and.pencil")
                    .font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 50)
            }.foregroundStyle(.white)
                .background(LinearGradient(colors: [purple, Color(red: 0.32, green: 0.19, blue: 0.93)], startPoint: .leading, endPoint: .trailing), in: Capsule())
                .opacity(saveBlocker == nil ? 1 : 0.45).disabled(saveBlocker != nil)
                .accessibilityIdentifier("shopping-email-save")
        }.buttonStyle(.plain)
    }

    private func card<Content: View>(_ title: String, subtitle: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                asset(icon, size: 42)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.headline)
                    Text(subtitle).font(.caption).foregroundStyle(muted)
                }
                Spacer(minLength: 0)
            }
            content()
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(purple.opacity(0.06), lineWidth: 1))
            .shadow(color: purple.opacity(0.035), radius: 12, y: 4)
    }
    private func asset(_ name: String, size: CGFloat) -> some View {
        Image("share-list-\(name)").resizable().scaledToFit().frame(width: size, height: size).accessibilityHidden(true)
    }
    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.caption).foregroundStyle(muted)
            content().font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
        }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(purple.opacity(0.15), lineWidth: 1))
    }
    private func note(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "info.circle.fill")
            Text(text)
        }.font(.caption).foregroundStyle(muted)
    }
    private func connectionBadge(_ status: String) -> some View {
        Label(status.capitalized, systemImage: status == "connected" ? "checkmark.circle.fill" : "exclamationmark.circle")
            .font(.caption.weight(.medium)).foregroundStyle(status == "connected" ? Color(red: 0, green: 0.48, blue: 0.36) : muted)
            .padding(.horizontal, 10).padding(.vertical, 7).background(Color.green.opacity(0.09), in: Capsule())
    }
    private var normalizedCustomerPhone: String {
        customerPhone.components(separatedBy: CharacterSet(charactersIn: " ().-\t\n\r")).joined()
    }
    private var saveBlocker: String? {
        guard let snapshot else { return "Unable to check email setup. Tap Check availability again." }
        guard snapshot.available else { return "Weekly email is unavailable on this server. Your entries are kept; check availability again after it is enabled." }
        guard snapshot.account?.status == "connected" else { return "Connect Gmail with email-sending permission before saving. A Calendar connection alone cannot send email." }
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "Enter the store manager’s name." }
        guard !recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "Enter the store manager’s email address." }
        guard normalizedCustomerPhone.range(of: "^\\+[1-9][0-9]{7,14}$", options: .regularExpression) != nil else { return "Enter your phone number with country code so the store can contact you." }
        guard consent else { return "Turn on permission to authorize weekly emails." }
        return nil
    }
    private func displayDate(_ text: String) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: text) else { return text }
        // Use the saved schedule's timezone, not the one being edited in the field.
        let saved = snapshot?.schedule?.timeZone ?? zone
        let timeZone = TimeZone(identifier: saved) ?? .current
        let out = DateFormatter(); out.dateStyle = .medium; out.timeStyle = .short; out.timeZone = timeZone
        return out.string(from: date) + " (\(timeZone.identifier))"
    }
    @MainActor private func load() async {
        busy = true; defer { busy = false }
        do {
            let value: ShoppingEmailSnapshot = try await store.api.request("/api/shopping/email-schedule?listId=\(URLQuery.value(list.id))")
            snapshot = value
            if !didLoadSchedule, let s = value.schedule {
                if let date = s.pickupDate {
                    let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
                    pickupDate = f.date(from: date) ?? pickupDate
                }
                pickupStartHour = s.pickupStartHour ?? 9
                customerPhone = s.customerPhone ?? ""
                recipient = s.recipient; name = s.recipientName; zone = s.timeZone; weekday = s.weekday
                time = Calendar.current.date(from: DateComponents(hour: s.hour, minute: s.minute)) ?? time
            }
            didLoadSchedule = true; error = nil
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
        guard !busy, saveBlocker == nil else { return }
        let c = Calendar.current.dateComponents([.hour, .minute], from: time)
        await change(["operation":"save", "listId":list.id, "input":["recipient":recipient, "customerPhone":normalizedCustomerPhone, "recipientName":name, "timeZone":zone, "weekday":weekday, "hour":c.hour ?? 10, "minute":c.minute ?? 0, "consent":consent, "pickupDate":pickupDateText, "pickupStartHour":pickupStartHour]])
    }
    @MainActor private func connect() async {
        busy = true; defer { busy = false }
        do {
            struct Link: Decodable { let url: String }
            let link: Link = try await store.api.request("/api/shopping/email-schedule", method:"POST", body:JSONSerialization.data(withJSONObject:["operation":"connect", "listId":list.id]))
            guard let url = URL(string:link.url) else { throw APIError.invalidResponse }
            oauth.start(url) { ticket in Task { @MainActor in
                guard let ticket else { error = "Email connection cancelled or failed."; return }
                do {
                    struct Confirmed: Decodable {}
                    let _: Confirmed = try await store.api.request("/api/moments", method: "POST", body: JSONSerialization.data(withJSONObject: ["operation": "connectEmailConfirm", "input": ["ticket": ticket]]))
                    await load()
                } catch { self.error = error.localizedDescription }
            } }
        } catch { self.error = error.localizedDescription }
    }
}
