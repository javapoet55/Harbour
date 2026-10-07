import SwiftUI

// MARK: - Server data (GET/PUT /api/nutrition/*, see docs/nutrition-calls.md)

struct NutritionSettings: Decodable, Sendable {
    var enabled: Bool
    var phone: String?
    var phoneVerified: Bool
    var localTime: String
    var timeZone: String
    var repeatDaily: Bool
    var noAnswer: String
    var voice: String
    var calorieGoal: Int
    var goals: [String: Double]?
    var voices: [String]
    var insightsEnabled: Bool?
}

struct NutritionTotals: Decodable, Sendable {
    var kcal: Int
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    // Key nutrients (absent from servers before they were tracked).
    var fiberG: Double?
    var calciumMg: Double?
    var ironMg: Double?
    var vitaminDIu: Double?
}

/// Today's one insight, with at most one action (GET/POST /api/nutrition/insight).
struct NutritionInsight: Decodable, Sendable, Equatable {
    let key: String
    let kind: String
    let title: String
    let text: String
    let items: [String]
    let listTitle: String?
    var state: String
}

struct NutritionEntry: Decodable, Sendable, Identifiable {
    let id: String
    var meal: String
    var description: String
    var kcal: Int
    var source: String
    var status: String
    var fromCall: Bool
    var needsReview: Bool { status != "CONFIRMED" }
}

struct NutritionDay: Decodable, Sendable {
    var date: String
    var calorieGoal: Int
    var totals: NutritionTotals
    var needsReview: Int
    var entries: [NutritionEntry]
}

struct NutritionSummary: Decodable, Sendable {
    struct Day: Decodable, Sendable { var date: String; var kcal: Int }
    var calorieGoal: Int
    var daily: [Day]
    var averageKcal: Int
    var daysLogged: Int
}

/// Talks to the nutrition API. With no API client it runs the design preview on local sample data.
@MainActor final class CalorieStore: ObservableObject {
    @Published private(set) var settings: NutritionSettings?
    @Published private(set) var day: NutritionDay?
    @Published private(set) var summary: NutritionSummary?
    @Published private(set) var loading = false
    @Published var error: String?
    let api: APIClient?
    var live: Bool { api != nil }

    init(api: APIClient?) {
        self.api = api
        if api == nil {
            day = Self.sampleDay
            summary = Self.sampleSummary
        }
    }

    struct SettingsUpdate: Encodable {
        var enabled: Bool?
        var localTime: String?
        var timeZone: String?
        var repeatDaily: Bool?
        var noAnswer: String?
        var voice: String?
        var calorieGoal: Int?
        var goals: [String: Int]?
        var insightsEnabled: Bool?
    }
    private struct PhoneStart: Encodable { var action = "start"; let phone: String }
    private struct PhoneVerify: Encodable { var action = "verify"; let code: String }
    /// POST /api/nutrition/phone start: the code goes by `channel` (voice or sms); a number that is already
    /// verified answers sent: false, alreadyVerified: true and nothing is sent.
    struct PhoneCodeResult: Decodable, Sendable { let sent: Bool; let alreadyVerified: Bool?; let channel: String? }
    /// POST /api/nutrition/call-now answers 202 with dialing, cancelled (calls off or outside the window), failed or not_claimed.
    private struct CallStarted: Decodable, Sendable { let status: String }
    private struct NewEntry: Encodable { let date: String; let meal: String; let description: String; let kcal: Int }
    private struct EntryPatch: Encodable { var meal: String?; var description: String?; var kcal: Int?; var confirm: Bool? }
    private struct EntryResponse: Decodable, Sendable { let entry: NutritionEntry }
    private struct Deleted: Decodable, Sendable { let deleted: Bool }

    private func attempt(_ work: () async throws -> Void) async -> Bool {
        do { try await work(); return true }
        catch { self.error = error.localizedDescription; return false }
    }

    func loadSettings() async {
        guard let api else { return }
        loading = true; defer { loading = false }
        _ = await attempt { let value: NutritionSettings = try await api.request("/api/nutrition/settings"); settings = value }
    }

    func loadDay(_ date: String) async {
        guard let api else { return }
        _ = await attempt { let value: NutritionDay = try await api.request("/api/nutrition/log?date=\(date)"); day = value }
    }

    func loadSummary(month: Bool, endingOn date: String) async {
        guard let api else { return }
        _ = await attempt { let value: NutritionSummary = try await api.request("/api/nutrition/summary?period=\(month ? "month" : "week")&date=\(date)"); summary = value }
    }

    @Published private(set) var insight: NutritionInsight?
    private struct InsightResponse: Decodable, Sendable { let insight: NutritionInsight? }
    private struct InsightAction: Encodable { let date: String; let key: String; let action: String }
    private struct InsightResult: Decodable, Sendable { let added: [String]; let listTitle: String? }

    func loadInsight(_ date: String) async {
        guard let api else { return }
        do { let value: InsightResponse = try await api.request("/api/nutrition/insight?date=\(date)"); insight = value.insight }
        catch { insight = nil } // an insight is optional; never block the dashboard on it
    }

    func actOnInsight(add: Bool, date: String) async {
        guard let api, let current = insight else { return }
        do {
            let result: InsightResult = try await api.request("/api/nutrition/insight", method: "POST", body: JSONEncoder().encode(InsightAction(date: date, key: current.key, action: add ? "add" : "dismiss")))
            // The card itself shows "Added to <list>"; the server confirmed which foods were new.
            insight?.state = add ? "added" : "dismissed"
            _ = result
        } catch { self.error = error.localizedDescription }
    }

    func save(_ update: SettingsUpdate) async -> Bool {
        guard let api else { return true }
        return await attempt { let value: NutritionSettings = try await api.request("/api/nutrition/settings", method: "PUT", body: JSONEncoder().encode(update)); settings = value }
    }

    func sendCode(to phone: String) async -> PhoneCodeResult? {
        guard let api else { return PhoneCodeResult(sent: true, alreadyVerified: false, channel: "voice") }
        var result: PhoneCodeResult?
        let ok = await attempt { result = try await api.request("/api/nutrition/phone", method: "POST", body: JSONEncoder().encode(PhoneStart(phone: phone))) }
        return ok ? result : nil
    }

    func verify(code: String) async -> Bool {
        guard let api else { return true }
        return await attempt { let value: NutritionSettings = try await api.request("/api/nutrition/phone", method: "POST", body: JSONEncoder().encode(PhoneVerify(code: code))); settings = value }
    }

    /// The call's status, or nil when the request failed (the error is already set).
    func callNow() async -> String? {
        guard let api else { return "dialing" }
        var status: String?
        let ok = await attempt { let started: CallStarted = try await api.request("/api/nutrition/call-now", method: "POST"); status = started.status }
        return ok ? status : nil
    }

    func add(date: String, meal: String, description: String, kcal: Int) async -> Bool {
        guard let api else {
            day?.entries.append(NutritionEntry(id: UUID().uuidString, meal: meal, description: description, kcal: kcal, source: "MANUAL", status: "CONFIRMED", fromCall: false))
            recomputePreviewTotal(); return true
        }
        let ok = await attempt { let _: EntryResponse = try await api.request("/api/nutrition/log", method: "POST", body: JSONEncoder().encode(NewEntry(date: date, meal: meal, description: description, kcal: kcal))) }
        if ok { await loadDay(date) }
        return ok
    }

    func update(_ entry: NutritionEntry, date: String, meal: String? = nil, description: String? = nil, kcal: Int? = nil, confirm: Bool = false) async -> Bool {
        guard let api else {
            if let index = day?.entries.firstIndex(where: { $0.id == entry.id }) {
                if let meal { day?.entries[index].meal = meal }
                if let description { day?.entries[index].description = description }
                if let kcal { day?.entries[index].kcal = kcal }
                if confirm || kcal != nil { day?.entries[index].status = "CONFIRMED" }
            }
            recomputePreviewTotal(); return true
        }
        let patch = EntryPatch(meal: meal, description: description, kcal: kcal, confirm: confirm ? true : nil)
        let ok = await attempt { let _: EntryResponse = try await api.request("/api/nutrition/log/\(entry.id)", method: "PATCH", body: JSONEncoder().encode(patch)) }
        if ok { await loadDay(date) }
        return ok
    }

    func remove(_ entry: NutritionEntry, date: String) async {
        guard let api else { day?.entries.removeAll { $0.id == entry.id }; recomputePreviewTotal(); return }
        if await attempt({ let _: Deleted = try await api.request("/api/nutrition/log/\(entry.id)", method: "DELETE") }) { await loadDay(date) }
    }

    private func recomputePreviewTotal() {
        guard var current = day else { return }
        current.totals.kcal = current.entries.reduce(0) { $0 + $1.kcal }
        current.needsReview = current.entries.filter(\.needsReview).count
        day = current
    }

    static func dayString(_ date: Date, timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// Accepts "+14155550123" and returns E.164, or nil. A bare national number is only read as
    /// US (+1) when the device region is the US — elsewhere a local number can't be mapped to a
    /// country reliably, so the country code is required instead of silently guessing "+1".
    static func e164(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let digits = trimmed.filter(\.isNumber)
        if trimmed.hasPrefix("+") { return (8...15).contains(digits.count) && digits.first != "0" ? "+" + digits : nil }
        let usLocale = (Locale.current as NSLocale).object(forKey: .countryCode) as? String == "US"
        if usLocale && digits.count == 10 { return "+1" + digits }
        if usLocale && digits.count == 11 && digits.hasPrefix("1") { return "+" + digits }
        return nil
    }

    private static let sampleDay: NutritionDay = {
        let entries = [
            ("🥚  2 eggs", 140, "BREAKFAST"), ("🍞  Whole wheat toast (2 slices)", 160, "BREAKFAST"),
            ("☕  Coffee with a little milk", 25, "BREAKFAST"), ("🍌  Banana", 105, "BREAKFAST"),
            ("🍲  Chicken biryani (1.5 cups)", 650, "LUNCH"), ("🥜  Almonds (small handful)", 170, "SNACKS"),
            ("🐟  Grilled salmon", 180, "DINNER"),
        ].map { NutritionEntry(id: UUID().uuidString, meal: $0.2, description: $0.0, kcal: $0.1, source: "MANUAL", status: "CONFIRMED", fromCall: false) }
        return NutritionDay(date: "", calorieGoal: 2000, totals: NutritionTotals(kcal: entries.reduce(0) { $0 + $1.kcal }, proteinG: 82, carbsG: 180, fatG: 52), needsReview: 0, entries: entries)
    }()

    private static let sampleSummary = NutritionSummary(
        calorieGoal: 2000,
        daily: [1500, 2080, 1850, 2400, 1950, 1760, 1620].enumerated().map { NutritionSummary.Day(date: "sample-\($0.offset)", kcal: $0.element) },
        averageKcal: 1880, daysLogged: 7)
}

// MARK: - Calorie Tracker

/// Daily Food Check-in. With an API client it reads and writes the user's real settings and food log;
/// without one (the `-calorie-design-preview` launch argument) it shows the design preview on sample data.
struct CalorieTrackerView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var store: CalorieStore
    @State private var page: Page = .intro
    @State private var history: [Page] = []
    @State private var callTime = Calendar.current.date(from: DateComponents(hour: 20)) ?? Date()
    @State private var timeZoneID = TimeZone.current.identifier
    @State private var repeatDaily = true
    @State private var noAnswer = "NOTIFY"
    @State private var voice = "marin"
    @State private var calorieGoal = 2000
    @State private var goals = [150, 250, 67, 25, 1000, 18, 800, 1000]
    @State private var phoneInput = ""
    @State private var codeInput = ""
    @State private var codeSent = false
    /// The channel the last code went by ("voice" or "sms"), from the server.
    @State private var codeChannel: String?
    @State private var editingPhone = false
    @State private var working = false
    @State private var period = "Today"
    @State private var insightsTab = "Insights"
    @State private var selectedDate = Date()
    @State private var notice: String?
    @State private var editingFood = false
    @State private var editingEntry: NutritionEntry?
    @State private var foodName = ""
    @State private var foodCalories = ""
    @State private var meal = "BREAKFAST"
    @State private var started = false
    @State private var insightsEnabled = true

    init(api: APIClient? = nil) {
        _store = StateObject(wrappedValue: CalorieStore(api: api))
    }

    private let ink = Color(red: 0.06, green: 0.07, blue: 0.28)
    private let gradient = LinearGradient(colors: [.purple, .indigo, .blue], startPoint: .leading, endPoint: .trailing)
    private let labels = ["Protein", "Carbs", "Fats", "Fiber", "Calcium", "Iron", "Vitamin D", "Omega-3"]
    private let units = ["g", "g", "g", "g", "mg", "mg", "IU", "mg"]
    private let symbols = ["circle.hexagongrid.fill", "carrot.fill", "drop.fill", "leaf.fill", "drop.fill", "flame.fill", "sun.max.fill", "fish.fill"]
    private let colors: [Color] = [.pink, .orange, .yellow, .green, .blue, .red, .orange, .blue]
    private let sampleIntake = [82, 180, 52, 12, 600, 10, 400, 300]
    private struct Option: Hashable { let key: String; let title: String; var detail = "" }
    private let meals = [Option(key: "BREAKFAST", title: "Breakfast"), Option(key: "LUNCH", title: "Lunch"), Option(key: "SNACKS", title: "Snacks"), Option(key: "DINNER", title: "Dinner")]
    private let noAnswerChoices = [Option(key: "NOTIFY", title: "Notify me", detail: "Send a notification with options."), Option(key: "RETRY_ONCE", title: "Retry once", detail: "Call again in 15 minutes."), Option(key: "SKIP", title: "Skip for today", detail: "No further action.")]
    private static let commonZones = ["America/Los_Angeles", "America/Denver", "America/Phoenix", "America/Chicago", "America/New_York", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Asia/Kolkata", "UTC"]

    private var live: Bool { store.live }
    private var userZone: TimeZone { TimeZone(identifier: store.settings?.timeZone ?? timeZoneID) ?? .current }
    private var dateKey: String { CalorieStore.dayString(selectedDate, timeZone: userZone) }
    private var isToday: Bool { dateKey == CalorieStore.dayString(Date(), timeZone: userZone) }
    private var entries: [NutritionEntry] { store.day?.entries ?? [] }
    private var total: Int { store.day?.totals.kcal ?? 0 }
    private var goal: Int { live ? (store.settings?.calorieGoal ?? calorieGoal) : calorieGoal }
    private var ratio: Double { min(Double(total) / Double(max(goal, 1)), 1) }
    private var phoneVerified: Bool { store.settings?.phoneVerified == true && !editingPhone }
    private var zoneChoices: [String] { Self.commonZones.contains(timeZoneID) ? Self.commonZones : [timeZoneID] + Self.commonZones }
    private var voiceChoices: [String] { store.settings?.voices ?? ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"] }
    private var title: String {
        switch page {
        case .intro: "Create Agent"
        case .time, .goals: "Daily Food Check-in"
        case .confirm: "Review & Confirm"
        case .ready: live ? "Daily Check-in" : "Agent Preview"
        case .dashboard: "Nutrition"
        case .insights: "Nutrition Insights"
        case .log: "Today's Food Log"
        }
    }
    private var statusLine: String {
        guard live else { return "UI Preview · Sample data · No calls are scheduled" }
        guard let settings = store.settings else { return "Loading…" }
        return settings.enabled ? "Daily call at " + callTime.formatted(date: .omitted, time: .shortened) : "Daily calls are off"
    }
    enum Page { case intro, time, goals, confirm, ready, dashboard, insights, log }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    if let previous = history.popLast() { page = previous } else { dismiss() }
                } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                    .accessibilityLabel("Back")
                Spacer()
                Text(title).font(.headline)
                Spacer()
                Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                    .accessibilityLabel("Close calorie tracker")
            }.padding(.horizontal, 12)
            Text(statusLine).font(.caption).foregroundStyle(.secondary).padding(.bottom, 8)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch page {
                    case .intro: intro
                    case .time: timeSetup
                    case .goals: goalSetup
                    case .confirm: confirmation
                    case .ready: ready
                    case .dashboard: dashboard
                    case .insights: insights
                    case .log: foodLog
                    }
                }.padding(20).frame(maxWidth: 650).frame(maxWidth: .infinity)
            }.id(page)
        }
        .foregroundStyle(ink)
        .background(LinearGradient(colors: [Color.purple.opacity(0.065), .white, Color.blue.opacity(0.055)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea())
        .overlay { if store.loading || working { ProgressView().padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
        .alert(live ? "Calorie Tracker" : "Calorie Tracker Preview", isPresented: Binding(get: { notice != nil || store.error != nil }, set: { if !$0 { notice = nil; store.error = nil } })) {
            Button("OK", role: .cancel) { notice = nil; store.error = nil }
        } message: { Text(store.error ?? notice ?? "") }
        .sheet(isPresented: $editingFood) { foodEditor }
        .task { await start() }
        .onChange(of: dateKey) { _, _ in Task { await refresh() } }
        .onChange(of: period) { _, _ in Task { await refresh() } }
    }

    // MARK: Loading

    private func start() async {
        guard live, !started else { return }
        started = true
        await store.loadSettings()
        if let settings = store.settings { apply(settings) }
        if store.settings?.enabled == true { history = []; page = .dashboard }
        await refresh()
    }

    private func refresh() async {
        guard live else { return }
        await store.loadDay(dateKey)
        if period == "Today" && isToday { await store.loadInsight(dateKey) }
        // The insights page always shows "This Week" — the Month period only applies to the dashboard chart.
        if period != "Today" || page == .insights { await store.loadSummary(month: page == .insights ? false : period == "Month", endingOn: dateKey) }
    }

    private func apply(_ settings: NutritionSettings) {
        callTime = Self.time(from: settings.localTime)
        timeZoneID = settings.timeZone
        repeatDaily = settings.repeatDaily
        noAnswer = settings.noAnswer
        voice = settings.voice
        calorieGoal = settings.calorieGoal
        if let saved = settings.goals { goals = labels.indices.map { index in saved[labels[index]].map { Int($0) } ?? goals[index] } }
        phoneInput = settings.phone ?? ""
        insightsEnabled = settings.insightsEnabled ?? true
    }

    private var settingsUpdate: CalorieStore.SettingsUpdate {
        CalorieStore.SettingsUpdate(localTime: Self.hhmm(callTime), timeZone: timeZoneID, repeatDaily: repeatDaily, noAnswer: noAnswer, voice: voice,
                                    calorieGoal: calorieGoal, goals: Dictionary(uniqueKeysWithValues: zip(labels, goals.map { min(10000, max(1, $0)) })),
                                    insightsEnabled: live ? insightsEnabled : nil)
    }

    private static func hhmm(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 20, parts.minute ?? 0)
    }

    private static func time(from hhmm: String) -> Date {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        return Calendar.current.date(from: DateComponents(hour: parts.first ?? 20, minute: parts.count > 1 ? parts[1] : 0)) ?? Date()
    }

    private func perform(_ work: @escaping @MainActor () async -> Void) {
        Task { working = true; await work(); working = false }
    }

    private func go(_ next: Page) {
        history.append(page); page = next
        if next == .insights || next == .dashboard || next == .log { Task { await refresh() } }
    }

    // MARK: Building blocks

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14, content: content)
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(.indigo.opacity(0.08)))
            .shadow(color: .indigo.opacity(0.04), radius: 10, y: 4)
    }
    private func primary(_ text: String, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text).font(.headline).foregroundStyle(.white).frame(maxWidth: .infinity).padding(16)
                .background(gradient, in: RoundedRectangle(cornerRadius: 16))
                .opacity(disabled ? 0.45 : 1)
        }.buttonStyle(.plain).disabled(disabled)
    }
    private func icon(_ name: String, _ color: Color) -> some View {
        Image(systemName: name).font(.title2).foregroundStyle(color)
            .frame(width: 46, height: 46).background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
            .accessibilityHidden(true)
    }
    private func feature(_ symbol: String, _ color: Color, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            icon(symbol, color)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }.padding(.vertical, 8)
    }
    private func zoneName(_ id: String) -> String {
        guard let zone = TimeZone(identifier: id), id != "UTC" else { return id }
        return zone.localizedName(for: .generic, locale: .current) ?? id
    }

    // MARK: Intro and setup

    private var intro: some View {
        Group {
            CaloriePackArt().frame(height: 165).accessibilityHidden(true)
            Text("Daily Food Check-in").font(.title2.bold()).frame(maxWidth: .infinity)
            Text(live ? "Build a daily habit. NexDo calls you once a day, logs what you ate and adds up the calories."
                      : "Build a daily habit. Plan a check-in, track meals and explore your nutrition goals.")
                .foregroundStyle(.secondary).multilineTextAlignment(.center)
            feature("phone.fill", .green, "AI calls you daily", live ? "A short, natural conversation about your meals and snacks — five minutes at most." : "Preview a natural conversation about your meals and snacks.")
            feature("chart.bar.fill", .purple, "Tracks calories & nutrients", "See how your daily meals fit your nutrition goals.")
            feature("lightbulb.fill", .orange, "Personalized insights", live ? "Follow your week and month, and review anything the call wasn't sure about." : "Explore progress and food ideas in the sample dashboard.")
            primary("Set Up Agent") { go(.time) }
            Button(live ? "Go to my dashboard" : "Explore sample dashboard") { go(.dashboard) }.frame(maxWidth: .infinity)
            Button("Learn more") {
                notice = live
                    ? "At your chosen time NexDo phones you and asks what you ate. Calories come from USDA and Open Food Facts nutrition data; anything it has to estimate is marked for you to review. Calls are only placed between 8:00 AM and 9:30 PM and last five minutes at most."
                    : "This is a design preview. Check-in calls, nutrition calculations and saved history will be connected in a future release."
            }.frame(maxWidth: .infinity)
        }
    }
    private func steps(_ current: Int) -> some View {
        HStack {
            ForEach(0..<3) { index in
                VStack(spacing: 6) {
                    Text("\(index + 1)").font(.headline).frame(width: 32, height: 32)
                        .foregroundStyle(index == current ? .white : .indigo)
                        .background(index == current ? Color.indigo : Color.indigo.opacity(0.08), in: Circle())
                    Text(["Time", "Goals", "Confirm"][index]).font(.caption)
                }.frame(maxWidth: .infinity)
            }
        }.padding(14).background(.indigo.opacity(0.04), in: RoundedRectangle(cornerRadius: 18))
    }
    private var timeSetup: some View {
        Group {
            steps(0)
            Text("When should NexDo call you?").font(.title3.bold())
            Text("Choose a time for your daily meal check-in.").foregroundStyle(.secondary)
            card {
                DatePicker("Call time", selection: $callTime, displayedComponents: .hourAndMinute).tint(.indigo)
                Divider()
                Picker("Time zone", selection: $timeZoneID) {
                    ForEach(zoneChoices, id: \.self) { Text(zoneName($0)).tag($0) }
                }.tint(.indigo)
                Divider()
                Toggle("Repeat every day", isOn: $repeatDaily).tint(.indigo)
                Divider()
                Picker("Agent voice", selection: $voice) {
                    ForEach(voiceChoices, id: \.self) { Text($0.capitalized).tag($0) }
                }.tint(.indigo)
            }
            Text("Calls are placed between 8:00 AM and 9:30 PM.").font(.caption).foregroundStyle(.secondary)
            Text("If I don’t answer").font(.headline)
            card {
                ForEach(noAnswerChoices, id: \.self) { choice in
                    Button { noAnswer = choice.key } label: {
                        HStack {
                            Image(systemName: noAnswer == choice.key ? "checkmark.circle.fill" : "circle").foregroundStyle(.indigo)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(choice.title).font(.headline)
                                Text(choice.detail).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }.padding(.vertical, 5)
                    }.buttonStyle(.plain).accessibilityAddTraits(noAnswer == choice.key ? .isSelected : [])
                }
            }
            primary("Next") { go(.goals) }
        }
    }
    private var goalSetup: some View {
        Group {
            steps(1)
            Text("Your Nutrition Goals").font(.title2.bold())
            Text("Customize your targets. These values are examples, not personalized recommendations.").font(.subheadline).foregroundStyle(.secondary)
            card {
                HStack {
                    icon("flame.fill", .red)
                    VStack(alignment: .leading) { Text("Daily calorie goal"); Text("\(calorieGoal) kcal").font(.title2.bold()) }
                }
                Stepper("Adjust calories", value: $calorieGoal, in: 500...5000, step: 50)
            }
            Text("Macro Targets").font(.headline)
            goalRows(0..<3)
            Text("Key Nutrients (Optional)").font(.headline)
            goalRows(3..<8)
            if live {
                card {
                    Toggle("Daily insight", isOn: $insightsEnabled).tint(.indigo).accessibilityIdentifier("insights-toggle")
                    Text("One factual observation a day about your own goals, with an optional shopping suggestion. It never labels foods good or bad.").font(.caption).foregroundStyle(.secondary)
                }
            }
            Button("↺ Restore sample values") { calorieGoal = 2000; goals = [150, 250, 67, 25, 1000, 18, 800, 1000] }
            primary("Next") { goals = goals.map { min(10000, max(1, $0)) }; go(.confirm) }
        }
    }
    private func goalRows(_ range: Range<Int>) -> some View {
        card {
            ForEach(Array(range), id: \.self) { index in
                HStack {
                    Image(systemName: symbols[index]).foregroundStyle(colors[index]).frame(width: 22)
                    Text(labels[index]).font(.subheadline)
                    Spacer()
                    TextField(labels[index], value: $goals[index], format: .number)
                        .keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width: 65)
                        .textFieldStyle(.roundedBorder)
                    Text(units[index]).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
    private var summary: some View {
        card {
            Label("Call time: " + callTime.formatted(date: .omitted, time: .shortened), systemImage: "clock")
            Divider()
            Label(zoneName(timeZoneID), systemImage: "globe")
            Label(repeatDaily ? "Every day" : "One check-in", systemImage: "repeat")
            Label("Voice: " + voice.capitalized, systemImage: "waveform")
            Label("\(calorieGoal) kcal goal", systemImage: "flame")
            Label("Protein, Carbs, Fats & key nutrients", systemImage: "fork.knife")
            Label("If no answer: " + (noAnswerChoices.first { $0.key == noAnswer }?.title ?? noAnswer), systemImage: "bell")
        }
    }
    private var phoneCard: some View {
        card {
            Label("Your phone number", systemImage: "phone.fill").font(.headline)
            if phoneVerified {
                HStack {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                    Text(store.settings?.phone ?? phoneInput)
                    Spacer()
                    Button("Change") { editingPhone = true; codeSent = false; codeInput = "" }
                }
            } else {
                // The server picks the code's channel; until a code has gone by text, the copy says "call" (voice is the default).
                Text(codeSent && codeChannel == "sms" ? "NexDo calls this number. First we'll text it a 6-digit code." : "NexDo calls this number. First we'll call it once and read out a 6-digit code.").font(.caption).foregroundStyle(.secondary)
                TextField("Mobile number, e.g. +1 650 555 0123", text: $phoneInput)
                    .keyboardType(.phonePad).textContentType(.telephoneNumber).textFieldStyle(.roundedBorder)
                Button(!codeSent ? "Call me with a code" : codeChannel == "sms" ? "Text me again with a code" : "Call me again with a code") {
                    guard let number = CalorieStore.e164(phoneInput) else { notice = "Enter your mobile number with its country code, for example +1 650 555 0123."; return }
                    perform {
                        guard let result = await store.sendCode(to: number) else { return }
                        if result.alreadyVerified == true {
                            await store.loadSettings()
                            editingPhone = false; codeSent = false; codeInput = ""
                            notice = "\(number) is already verified."
                        } else {
                            codeSent = true; codeChannel = result.channel
                            notice = result.channel == "sms" ? "We’ve texted a 6-digit code to \(number)." : "Calling \(number) now. Answer to hear your 6-digit code."
                        }
                    }
                }
                if codeSent {
                    TextField("6-digit code", text: $codeInput).keyboardType(.numberPad).textContentType(.oneTimeCode).textFieldStyle(.roundedBorder)
                    Button("Verify") {
                        let code = codeInput.filter(\.isNumber)
                        perform { if await store.verify(code: code) { editingPhone = false; codeSent = false; codeInput = "" } }
                    }.disabled(codeInput.filter(\.isNumber).count != 6)
                }
            }
        }
    }
    private var confirmation: some View {
        Group {
            steps(2)
            CaloriePackArt().frame(height: 125).accessibilityHidden(true)
            Text("Daily Food Check-in").font(.title2.bold()).frame(maxWidth: .infinity)
            Text(live ? "Here’s what you’ve set up. You can change these options anytime." : "Here’s what you’ve set up. You can change these options anytime in this preview.").foregroundStyle(.secondary)
            summary
            if live { phoneCard }
            if live {
                primary("Turn On Daily Calls", disabled: !phoneVerified) {
                    var enabling = settingsUpdate; enabling.enabled = true
                    let update = enabling
                    perform { if await store.save(update) { history = [.intro]; page = .ready } }
                }
                Button("Save without calls") {
                    perform { if await store.save(settingsUpdate) { go(.dashboard) } }
                }.frame(maxWidth: .infinity)
            } else {
                primary("Preview Activation") { go(.ready) }
                Button("Maybe later") { go(.dashboard) }.frame(maxWidth: .infinity)
            }
        }
    }
    private var ready: some View {
        Group {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 80)).foregroundStyle(gradient).frame(maxWidth: .infinity).padding(.vertical, 20)
            Text("All Set!").font(.largeTitle.bold()).frame(maxWidth: .infinity)
            Text(live ? "NexDo will call you at \(callTime.formatted(date: .omitted, time: .shortened)) to log your meals." : "Your check-in design is ready. No agent has been activated and no calls will be placed.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary)
            summary
            Text("What happens next?").font(.headline)
            feature("1.circle.fill", .indigo, "Daily check-in", live ? "Answer the call and tell NexDo what you ate. It reads the list back before saving." : "A future voice agent will ask about your meals.")
            feature("2.circle.fill", .blue, "Track your day", "Review your food log and nutrition progress.")
            feature("3.circle.fill", .green, "Build healthy habits", "Explore insights and adjust your goals.")
            primary("View Nutrition Dashboard") { history = [.intro]; page = .dashboard; Task { await refresh() } }
            if live {
                Button("Call me now to try it") {
                    perform {
                        switch await store.callNow() {
                        case "dialing": notice = "Calling you now. Pick up to log today’s meals."
                        // Same wording as Android (ff5ceb7); not_claimed reads as failed there too.
                        case "cancelled": notice = "The call was cancelled. Check that daily calls are on, then try again."
                        case .some: notice = "The call could not be placed. Try again in a few minutes."
                        case nil: break
                        }
                    }
                }.frame(maxWidth: .infinity)
            }
            Button("Edit setup") { go(.time) }.frame(maxWidth: .infinity)
        }
    }

    // MARK: Dashboard, insights and log

    private var dateSelector: some View {
        HStack {
            Button { selectedDate = Calendar.current.date(byAdding: .day, value: -1, to: selectedDate) ?? selectedDate } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("Previous day")
            Spacer()
            DatePicker("Date", selection: $selectedDate, in: ...Date(), displayedComponents: .date).labelsHidden()
            Spacer()
            Button { selectedDate = min(Date(), Calendar.current.date(byAdding: .day, value: 1, to: selectedDate) ?? selectedDate) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel("Next day")
        }
    }
    private func intake(_ index: Int) -> Int? {
        guard live else { return sampleIntake[index] }
        guard let totals = store.day?.totals else { return nil }
        switch index {
        case 0: return Int(totals.proteinG.rounded())
        case 1: return Int(totals.carbsG.rounded())
        case 2: return Int(totals.fatG.rounded())
        case 3: return totals.fiberG.map { Int($0.rounded()) }
        case 4: return totals.calciumMg.map { Int($0.rounded()) }
        case 5: return totals.ironMg.map { Int($0.rounded()) }
        case 6: return totals.vitaminDIu.map { Int($0.rounded()) }
        default: return nil // omega-3 is not tracked yet
        }
    }
    private var chartValues: (values: [Int], labels: [String]) {
        let daily = store.summary?.daily ?? []
        if period == "Week" {
            let letters = ["S", "M", "T", "W", "T", "F", "S"]
            let parser = DateFormatter(); parser.locale = Locale(identifier: "en_US_POSIX"); parser.dateFormat = "yyyy-MM-dd"; parser.timeZone = TimeZone(identifier: "UTC")
            var utc = Calendar(identifier: .gregorian); utc.timeZone = TimeZone(identifier: "UTC") ?? .current
            let labels = daily.map { day in parser.date(from: day.date).map { letters[utc.component(.weekday, from: $0) - 1] } ?? "·" }
            return (daily.map(\.kcal), live ? labels : ["M", "T", "W", "T", "F", "S", "S"])
        }
        // Month: one bar per calendar week (Mon–Sun). Sample dates don't parse, so previews fall back to chunks.
        if live {
            let parser = DateFormatter(); parser.locale = Locale(identifier: "en_US_POSIX"); parser.dateFormat = "yyyy-MM-dd"; parser.timeZone = TimeZone(identifier: "UTC")
            var utc = Calendar(identifier: .gregorian); utc.timeZone = TimeZone(identifier: "UTC") ?? .current
            let weekStart = DateFormatter(); weekStart.locale = Locale(identifier: "en_US_POSIX"); weekStart.dateFormat = "M/d"; weekStart.timeZone = TimeZone(identifier: "UTC")
            var labels: [String] = []
            var grouped: [[Int]] = []
            for day in daily {
                guard let parsed = parser.date(from: day.date) else { continue }
                let daysSinceMonday = (utc.component(.weekday, from: parsed) + 5) % 7
                let monday = utc.date(byAdding: .day, value: -daysSinceMonday, to: parsed) ?? parsed
                let label = weekStart.string(from: monday)
                if labels.last == label { grouped[grouped.count - 1].append(day.kcal) }
                else { labels.append(label); grouped.append([day.kcal]) }
            }
            let averages = grouped.map { week -> Int in
                let logged = week.filter { $0 > 0 }
                return logged.isEmpty ? 0 : logged.reduce(0, +) / logged.count
            }
            return (averages, labels)
        }
        let recent = Array(daily.suffix(28))
        let weeks = stride(from: 0, to: recent.count, by: 7).map { Array(recent[$0..<min($0 + 7, recent.count)]) }
        let averages = weeks.map { week -> Int in
            let logged = week.filter { $0.kcal > 0 }
            return logged.isEmpty ? 0 : logged.reduce(0) { $0 + $1.kcal } / logged.count
        }
        return (averages, averages.indices.map { "W\($0 + 1)" })
    }
    private var dashboard: some View {
        Group {
            Picker("Period", selection: $period) { ForEach(["Today", "Week", "Month"], id: \.self) { Text($0) } }.pickerStyle(.segmented)
            dateSelector
            if period == "Today", isToday, live, let insight = store.insight, insight.state == "open" || insight.state == "added" { insightCard(insight) }
            if period == "Today" {
                HStack(spacing: 18) {
                    ZStack {
                        Circle().stroke(.indigo.opacity(0.06), lineWidth: 16)
                        Circle().trim(from: 0, to: ratio).stroke(LinearGradient(colors: [.blue, .cyan, .green], startPoint: .bottomLeading, endPoint: .topTrailing), style: StrokeStyle(lineWidth: 16, lineCap: .round)).rotationEffect(.degrees(-90))
                        VStack { Text(total.formatted()).font(.largeTitle.bold()); Text("of \(goal) kcal").font(.caption) }
                    }.frame(width: 170, height: 170).padding(8).accessibilityElement(children: .ignore).accessibilityLabel("\(total) of \(goal) calories")
                    VStack(spacing: 12) {
                        card { Text("\(max(0, goal - total))").font(.title2.bold()); Text("kcal left").font(.caption) }
                        card { Text("\(Int(ratio * 100))%").font(.headline); Text("of daily goal").font(.caption) }
                    }
                }
                if live, let count = store.day?.needsReview, count > 0 {
                    Button { go(.log) } label: {
                        Label("\(count) item\(count == 1 ? "" : "s") to review in your food log", systemImage: "exclamationmark.circle.fill")
                            .font(.subheadline).foregroundStyle(.orange)
                    }.buttonStyle(.plain)
                }
            } else {
                card {
                    Text(period == "Week" ? (live ? "Calories · This week (Mon–Sun)" : "Calories · Last 7 days") : "Calories · Weekly averages").font(.headline)
                    ChartBars(values: chartValues.values, labels: chartValues.labels, goal: goal)
                    if live, let summary = store.summary {
                        Text(summary.daysLogged == 0 ? "Nothing logged in this period yet" : "Average \(summary.averageKcal) kcal on \(summary.daysLogged) logged day\(summary.daysLogged == 1 ? "" : "s")").font(.caption).foregroundStyle(.secondary)
                    } else if !live {
                        Text("Illustrative trends · Sample data").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            HStack(spacing: 8) {
                ForEach(0..<3) { i in
                    card {
                        Text(labels[i]).font(.subheadline.bold())
                        Text("\(intake(i) ?? 0) / \(max(1, goals[i])) g").font(.caption)
                        ProgressView(value: min(Double(intake(i) ?? 0) / Double(max(1, goals[i])), 1)).tint(colors[i])
                    }
                }
            }
            HStack { Text("Key Nutrients").font(.headline); Spacer(); Button("View Insights") { go(.insights) }.font(.subheadline) }
            card {
                ForEach(3..<8) { i in
                    HStack {
                        Image(systemName: symbols[i]).foregroundStyle(colors[i]); Text(labels[i]); Spacer()
                        if let value = intake(i) { Text("\(value) / \(max(1, goals[i])) \(units[i])").font(.caption) }
                        else { Text("Goal \(max(1, goals[i])) \(units[i])").font(.caption).foregroundStyle(.secondary) }
                    }
                    if let value = intake(i) { ProgressView(value: min(Double(value) / Double(max(1, goals[i])), 1)).tint(colors[i]) }
                }
                if live { Text("Omega-3 isn’t tracked yet. Other values come from USDA and Open Food Facts data for the foods you log; estimated items don’t add to them.").font(.caption).foregroundStyle(.secondary) }
            }
            primary("View Food Log") { go(.log) }
            Button("Manage daily check-in") { go(.time) }.frame(maxWidth: .infinity)
            if live, store.settings?.enabled == true {
                Button("Pause daily calls", role: .destructive) {
                    let update = CalorieStore.SettingsUpdate(enabled: false)
                    perform { if await store.save(update) { notice = "Daily calls are paused. Turn them back on from Manage daily check-in." } }
                }.frame(maxWidth: .infinity)
            }
        }
    }
    private func insightCard(_ insight: NutritionInsight) -> some View {
        card {
            HStack(alignment: .top, spacing: 12) {
                icon(insight.kind == "GAP" ? "sparkles" : insight.kind == "STREAK" ? "flame.fill" : "chart.line.uptrend.xyaxis", insight.kind == "GAP" ? .purple : .orange)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Today’s insight").font(.caption.bold()).foregroundStyle(.secondary)
                    Text(insight.title).font(.headline)
                    Text(insight.text).font(.subheadline)
                }
            }
            if insight.state == "added" {
                Label("Added to \(insight.listTitle ?? "your shopping list")", systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(.green)
            } else if !insight.items.isEmpty {
                HStack {
                    Button { Task { await store.actOnInsight(add: true, date: dateKey) } } label: { Label("Add to \(insight.listTitle ?? "shopping list")", systemImage: "cart.badge.plus") }
                        .buttonStyle(.borderedProminent).tint(.indigo).accessibilityIdentifier("insight-add")
                    Button("Not now") { Task { await store.actOnInsight(add: false, date: dateKey) } }.accessibilityIdentifier("insight-dismiss")
                }
            } else {
                Button("Got it") { Task { await store.actOnInsight(add: false, date: dateKey) } }.accessibilityIdentifier("insight-dismiss")
            }
        }.accessibilityIdentifier("insight-card")
    }
    private var insights: some View {
        Group {
            Picker("Insights", selection: $insightsTab) { Text("Insights").tag("Insights"); Text("Recommendations").tag("Recommendations") }.pickerStyle(.segmented)
            card { feature("lightbulb.fill", .orange, "Keep building your habit", live ? "You’ve logged \(Int(ratio * 100))% of today’s calorie goal." : "You’ve logged \(Int(ratio * 100))% of your sample calorie goal.") }
            if insightsTab == "Insights" {
                if live {
                    Text("This Week").font(.title3.bold())
                    card {
                        feature("calendar", .indigo, "\(store.summary?.daysLogged ?? 0) of 7 days logged", "Average \(store.summary?.averageKcal ?? 0) kcal on the days you logged, against a \(goal) kcal goal.")
                    }
                    if let count = store.day?.needsReview, count > 0 {
                        card { feature("exclamationmark.circle.fill", .orange, "\(count) item\(count == 1 ? "" : "s") to review", "These calories were estimated because the food wasn’t found in the nutrition database. Check them in your food log.") }
                    }
                } else {
                    Text("Nutrient Gaps").font(.title3.bold())
                    ForEach([3, 6, 7], id: \.self) { i in
                        card {
                            feature(symbols[i], colors[i], labels[i], "\(max(0, goals[i] - sampleIntake[i])) \(units[i]) below the sample target")
                            Text(i == 3 ? "Explore fruits, vegetables and whole grains." : i == 6 ? "Explore foods containing vitamin D." : "Explore fish, flaxseed and other sources of omega-3.").font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Text("Food Ideas").font(.title3.bold())
            ForEach(["🥣 Greek yogurt", "🌱 Chia seeds", "🐟 Salmon"], id: \.self) { name in
                card {
                    HStack {
                        Text(name).font(.headline); Spacer()
                        Button("Add to log", systemImage: "plus.circle.fill") { openEditor(name: String(name.dropFirst(2))) }.labelStyle(.iconOnly).font(.title2)
                    }
                    Text(live ? "Add it to your food log for this day." : "Explore this food in your sample meal log.").font(.caption).foregroundStyle(.secondary)
                }
            }
            Text("These ideas are general examples; they are not an assessment of your nutrition or supplement needs.").font(.caption).foregroundStyle(.secondary)
            primary("Open Food Log") { go(.log) }
        }
    }
    private var foodLog: some View {
        Group {
            dateSelector
            Text(live ? "Items from your check-in call and ones you add here" : "Sample meals · Edits last while this preview is open").font(.caption).foregroundStyle(.secondary)
            ForEach(meals, id: \.self) { group in
                card {
                    HStack { Text(group.title).font(.headline); Spacer(); Text("\(entries.filter { $0.meal == group.key }.reduce(0) { $0 + $1.kcal }) kcal").font(.subheadline) }
                    ForEach(entries.filter { $0.meal == group.key }) { food in
                        Divider()
                        foodRow(food)
                    }
                }
            }
            card { Label("Total Calories", systemImage: "flame.fill"); Text("\(total) / \(goal) kcal").font(.title2.bold()); ProgressView(value: ratio).tint(.mint) }
            primary("Add Food") { openEditor(name: "") }
        }
    }
    private func foodRow(_ food: NutritionEntry) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                if food.fromCall { Image(systemName: "phone.fill").font(.caption).foregroundStyle(.green).accessibilityLabel("From your call") }
                Text(food.description).font(.subheadline); Spacer()
                Button { openEditor(entry: food) } label: { Text("\(food.kcal) kcal").font(.caption) }.buttonStyle(.plain).accessibilityLabel("Edit \(food.description), \(food.kcal) calories")
                Button { Task { await store.remove(food, date: dateKey) } } label: { Image(systemName: "minus.circle").foregroundStyle(.red).frame(width: 32, height: 32) }.accessibilityLabel("Remove " + food.description)
            }
            if food.needsReview {
                HStack(spacing: 10) {
                    Label("Estimated", systemImage: "exclamationmark.circle").font(.caption).foregroundStyle(.orange)
                    Button("Looks right") { Task { _ = await store.update(food, date: dateKey, confirm: true) } }.font(.caption.bold())
                    Button("Edit") { openEditor(entry: food) }.font(.caption.bold())
                }
            }
        }
    }
    private func openEditor(name: String = "", entry: NutritionEntry? = nil) {
        editingEntry = entry
        foodName = entry?.description ?? name
        foodCalories = entry.map { String($0.kcal) } ?? ""
        meal = entry?.meal ?? "BREAKFAST"
        editingFood = true
    }
    private var editorValid: Bool {
        let calories = Int(foodCalories) ?? -1
        return !foodName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (0...5000).contains(calories)
    }
    private var foodEditor: some View {
        NavigationStack {
            Form {
                Section(live ? "Food" : "Sample meal") {
                    TextField("Food name", text: $foodName)
                    TextField("Calories", text: $foodCalories).keyboardType(.numberPad)
                    Picker("Meal", selection: $meal) { ForEach(meals, id: \.self) { Text($0.title).tag($0.key) } }
                }
                Section { Text(live ? "Saved to your food log for \(selectedDate.formatted(date: .abbreviated, time: .omitted))." : "This entry changes the preview only.").foregroundStyle(.secondary) }
            }.navigationTitle(editingEntry == nil ? "Add Food" : "Edit Food").toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editingFood = false } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editingEntry == nil ? "Add" : "Save") {
                        let name = foodName.trimmingCharacters(in: .whitespacesAndNewlines)
                        let calories = Int(foodCalories) ?? 0
                        let entry = editingEntry
                        let date = dateKey
                        let chosenMeal = meal
                        Task {
                            var saved = false
                            if let entry {
                                // kcal only when it changed: the server reads a sent kcal as a manual correction
                                // (source MANUAL), so a rename would otherwise have dropped the food's nutrients.
                                saved = await store.update(entry, date: date, meal: chosenMeal, description: name, kcal: calories == entry.kcal ? nil : calories)
                            } else {
                                saved = await store.add(date: date, meal: chosenMeal, description: name, kcal: calories)
                            }
                            if saved { editingFood = false }
                        }
                    }.disabled(!editorValid)
                }
            }
        }
    }
}

/// Render only the supplied illustration region; keep all interface text native.
private struct CaloriePackArt: View {
    var body: some View {
        GeometryReader { proxy in
            let scale = min(proxy.size.width / 218, proxy.size.height / 140)
            Image("calorie-design-pack").resizable()
                .frame(width: 1536 * scale, height: 1024 * scale)
                .offset(x: -1305 * scale, y: -790 * scale)
                .frame(width: 218 * scale, height: 140 * scale, alignment: .topLeading).clipped()
                .frame(width: proxy.size.width, height: proxy.size.height)
        }
    }
}

private struct ChartBars: View {
    let values: [Int]
    let labels: [String]
    let goal: Int
    private var top: Int { max(goal, values.max() ?? 0, 1) }
    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            ForEach(Array(values.enumerated()), id: \.offset) { item in
                VStack {
                    RoundedRectangle(cornerRadius: 5).fill(LinearGradient(colors: [.cyan, .indigo], startPoint: .top, endPoint: .bottom))
                        .frame(height: max(4, CGFloat(item.element) / CGFloat(top) * 120))
                    Text(item.offset < labels.count ? labels[item.offset] : "").font(.caption)
                }.frame(maxWidth: .infinity)
            }
        }.frame(height: 155)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Calories chart: " + zip(labels, values).map { "\($0) \($1) kcal" }.joined(separator: ", "))
    }
}
