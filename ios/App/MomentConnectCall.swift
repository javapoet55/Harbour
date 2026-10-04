import SwiftUI

// MARK: - "Connect me on the day" (POST /api/moments operations connectStatus/connectPreview/connectSave/connectNow
// and callerIdStart/callerIdStatus/callerIdRemove; see docs/moment-connect-calls.md)

struct MomentCallerID: Decodable, Sendable, Equatable { let phone: String; let status: String }
struct MomentConnectPreview: Decodable, Sendable, Equatable { let userLocal: String; let recipientLocal: String; let userOk: Bool; let recipientOk: Bool }
struct MomentConnectLastCall: Decodable, Sendable, Equatable { let status: String; let date: String; let at: String }
struct MomentConnectState: Decodable, Sendable, Identifiable, Equatable {
    let momentId: String
    let enabled: Bool
    let time: String
    let timeZone: String
    let recipientPhone: String?
    let passed: Bool
    let isToday: Bool
    let nextCallAt: String
    let preview: MomentConnectPreview
    let lastCall: MomentConnectLastCall?
    var id: String { momentId }
}
struct MomentConnectStatus: Decodable, Sendable { let available: Bool; let callerId: MomentCallerID?; let userTimeZone: String; let moments: [MomentConnectState] }
private struct MomentConnectPreviewResponse: Decodable, Sendable { let time: String; let timeZone: String; let nextCallAt: String; let preview: MomentConnectPreview }
private struct CallerIDStartResponse: Decodable, Sendable { let phone: String; let status: String; let validationCode: String? }
private struct CallerIDStatusResponse: Decodable, Sendable { let callerId: MomentCallerID? }
private struct ConnectNowResponse: Decodable, Sendable { let callId: String; let status: String }

/// Local, unsaved edits for one moment's connect call.
struct MomentConnectDraft: Equatable {
    var enabled: Bool
    var time: String
    var timeZone: String
}

@MainActor final class MomentConnectModel: ObservableObject {
    @Published private(set) var status: MomentConnectStatus?
    @Published var drafts: [String: MomentConnectDraft] = [:]
    @Published private(set) var previews: [String: MomentConnectPreview] = [:]
    @Published var error: String?
    @Published var notice: String?
    @Published private(set) var busy = false
    let store: ImportantMomentsStore
    private var momentIDs: [String]

    init(store: ImportantMomentsStore, momentIDs: [String]) { self.store = store; self.momentIDs = momentIDs }

    var callerID: MomentCallerID? { status?.callerId }
    var verified: Bool { status?.callerId?.status == "VERIFIED" }
    func state(_ id: String) -> MomentConnectState? { status?.moments.first { $0.momentId == id } }
    func dirty(_ id: String) -> Bool {
        guard let state = state(id), let draft = drafts[id] else { return false }
        return draft != MomentConnectDraft(enabled: state.enabled, time: state.time, timeZone: state.timeZone)
    }

    private struct IDs: Encodable { let momentIds: [String] }
    private struct Save: Encodable { let momentId: String; let enabled: Bool; let time: String; let timeZone: String }
    private struct MomentID: Encodable { let momentId: String }
    private struct Phone: Encodable { let phone: String }
    private struct Empty: Encodable {}

    func load(momentIDs ids: [String]? = nil) async {
        if let ids { momentIDs = ids }
        guard !momentIDs.isEmpty else { return }
        do {
            let result: MomentConnectStatus = try await store.request("connectStatus", IDs(momentIds: momentIDs))
            status = result
            for moment in result.moments where drafts[moment.momentId] == nil || !dirty(moment.momentId) {
                drafts[moment.momentId] = MomentConnectDraft(enabled: moment.enabled, time: moment.time, timeZone: moment.timeZone)
                previews[moment.momentId] = moment.preview
            }
        } catch { self.error = error.localizedDescription }
    }

    func refreshPreview(_ id: String) async {
        guard let draft = drafts[id] else { return }
        do {
            let result: MomentConnectPreviewResponse = try await store.request("connectPreview", Save(momentId: id, enabled: draft.enabled, time: draft.time, timeZone: draft.timeZone))
            if drafts[id] == draft { previews[id] = result.preview }
        } catch { /* keep the previous preview; saving reports real problems */ }
    }

    func save(_ id: String) async {
        guard let draft = drafts[id] else { return }
        busy = true; defer { busy = false }
        do {
            let result: MomentConnectStatus = try await store.request("connectSave", Save(momentId: id, enabled: draft.enabled, time: draft.time, timeZone: draft.timeZone))
            status = merged(result)
            if let saved = result.moments.first(where: { $0.momentId == id }) {
                drafts[id] = MomentConnectDraft(enabled: saved.enabled, time: saved.time, timeZone: saved.timeZone)
                previews[id] = saved.preview
                notice = saved.enabled ? "Saved. Nexdo will call you \(saved.preview.userLocal) your time." : "Connect call turned off."
            }
        } catch { self.error = error.localizedDescription }
    }

    func connectNow(_ id: String) async {
        busy = true; defer { busy = false }
        do {
            let _: ConnectNowResponse = try await store.request("connectNow", MomentID(momentId: id))
            notice = "Calling you now. Answer and Nexdo will connect you."
        } catch { self.error = error.localizedDescription }
    }

    /// Starts Twilio's verification call and returns the code the user types on their keypad.
    func startVerification(phone: String) async -> String? {
        busy = true; defer { busy = false }
        do {
            let result: CallerIDStartResponse = try await store.request("callerIdStart", Phone(phone: phone))
            if result.status == "VERIFIED" { await load(); return nil }
            return result.validationCode
        } catch { self.error = error.localizedDescription; return nil }
    }

    func pollVerification() async -> String? {
        do {
            let result: CallerIDStatusResponse = try await store.request("callerIdStatus", Empty())
            if result.callerId?.status == "VERIFIED" { await load() }
            return result.callerId?.status
        } catch { return nil }
    }

    func removeNumber() async {
        busy = true; defer { busy = false }
        do {
            struct Removed: Decodable, Sendable { let removed: Bool }
            let _: Removed = try await store.request("callerIdRemove", Empty())
            drafts = [:]
            await load()
            notice = "Your number was removed and connect calls are off."
        } catch { self.error = error.localizedDescription }
    }

    private func merged(_ partial: MomentConnectStatus) -> MomentConnectStatus {
        guard let current = status else { return partial }
        let others = current.moments.filter { m in !partial.moments.contains { $0.momentId == m.momentId } }
        return MomentConnectStatus(available: partial.available, callerId: partial.callerId, userTimeZone: partial.userTimeZone, moments: others + partial.moments)
    }

    // "HH:mm" in a time zone <-> the Date a DatePicker shows in that same time zone.
    static func date(from hhmm: String, zone: String) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: zone) ?? .current
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        return calendar.date(bySettingHour: parts.first ?? 9, minute: parts.count > 1 ? parts[1] : 0, second: 0, of: Date()) ?? Date()
    }
    static func hhmm(from date: Date, zone: String) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: zone) ?? .current
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 9, parts.minute ?? 0)
    }
    static func statusLabel(_ status: String) -> String {
        switch status {
        case "CONNECTED": "Connected"
        case "DECLINED": "You said not now"
        case "CALL_BACK_SCHEDULED", "QUEUED": "Call back scheduled"
        case "MISSED": "You missed the call"
        case "RECIPIENT_NO_ANSWER": "They didn’t pick up"
        case "DIALING", "IN_PROGRESS", "CONNECTING": "Calling…"
        case "CANCELLED": "Cancelled"
        case "EXPIRED": "Not placed"
        default: "Call ended"
        }
    }
}

/// The "Connect me on the day" section of the Manage Moment schedule page.
struct MomentConnectSection: View {
    @StateObject private var model: MomentConnectModel
    @State private var verifying = false
    @State private var showingHowItWorks = false
    @State private var previewTask: Task<Void, Never>?
    private let moments: [ImportantMoment]

    init(store: ImportantMomentsStore, moments: [ImportantMoment]) {
        self.moments = moments
        _model = StateObject(wrappedValue: MomentConnectModel(store: store, momentIDs: moments.map(\.id)))
    }

    private func name(_ moment: ImportantMoment) -> String {
        let first = moment.firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        return first.isEmpty ? moment.title : first
    }
    private var firstName: String { moments.first.map(name) ?? "They" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Connect me on the day").font(.title2.bold())
            Text("Nexdo calls you at the time you choose and, if you say yes, connects you so you can wish them yourself. They see your own number.")
                .font(.subheadline).foregroundStyle(.secondary)
            if let status = model.status, !status.available {
                MomentCard { Label("Connect calls aren’t available yet.", systemImage: "phone.badge.clock") }
            } else if model.status != nil {
                callerIDCard
                ForEach(moments, id: \.id) { moment in momentCard(moment) }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .task { await model.load(momentIDs: moments.map(\.id)) }
        .onChange(of: moments.map(\.id)) { _, ids in Task { await model.load(momentIDs: ids) } }
        .sheet(isPresented: $verifying) { CallerIDVerificationSheet(model: model) }
        .sheet(isPresented: $showingHowItWorks) { MomentCallingGuide() }
        .alert("Connect me on the day", isPresented: Binding(get: { model.error != nil || model.notice != nil }, set: { if !$0 { model.error = nil; model.notice = nil } })) {
            Button("OK", role: .cancel) { model.error = nil; model.notice = nil }
        } message: { Text(model.error ?? model.notice ?? "") }
    }

    private var callerIDCard: some View {
        MomentCard {
            if model.verified, let caller = model.callerID {
                HStack {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(.green).accessibilityHidden(true)
                    VStack(alignment: .leading) {
                        Text("Your number is verified").font(.headline)
                        Text("\(firstName) will see \(caller.phone)").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Change") { verifying = true }.accessibilityIdentifier("connect-change-number")
                }
            } else {
                Label("Verify your number first so \(firstName) sees it’s you.", systemImage: "person.badge.shield.checkmark")
                    .font(.subheadline)
                Button("Verify my number") { verifying = true }.buttonStyle(.borderedProminent).accessibilityIdentifier("connect-verify-number")
            }
        }
    }

    @ViewBuilder private func momentCard(_ moment: ImportantMoment) -> some View {
        let state = model.state(moment.id)
        let draft = model.drafts[moment.id]
        MomentCard {
            if let state, let draft {
                Toggle("Connect me to \(name(moment))", isOn: Binding(
                    get: { draft.enabled },
                    set: { value in model.drafts[moment.id]?.enabled = value; schedulePreview(moment.id) }))
                    .disabled(!model.verified || state.recipientPhone == nil || state.passed)
                    .accessibilityIdentifier("connect-toggle-\(moment.id)")
                if state.recipientPhone == nil {
                    Text("Add \(name(moment))’s phone number with its country code (for example +91 98765 43210) to use this.").font(.caption).foregroundStyle(.orange)
                } else if state.passed {
                    Text("This moment has already passed.").font(.caption).foregroundStyle(.secondary)
                }
                if draft.enabled {
                    DatePicker("Call time", selection: Binding(
                        get: { MomentConnectModel.date(from: draft.time, zone: draft.timeZone) },
                        set: { date in model.drafts[moment.id]?.time = MomentConnectModel.hhmm(from: date, zone: draft.timeZone); schedulePreview(moment.id) }),
                        displayedComponents: .hourAndMinute)
                        .environment(\.timeZone, TimeZone(identifier: draft.timeZone) ?? .current)
                        .accessibilityIdentifier("connect-time-\(moment.id)")
                    HStack {
                        Text("Time zone")
                        Spacer()
                        Picker("Time zone", selection: Binding(
                            get: { draft.timeZone },
                            set: { zone in model.drafts[moment.id]?.timeZone = zone; schedulePreview(moment.id) })) {
                            ForEach(TimeZone.knownTimeZoneIdentifiers, id: \.self) { id in
                                Text(TimeZone(identifier: id)?.localizedName(for: .generic, locale: .current) ?? id).tag(id)
                            }
                        }.labelsHidden().accessibilityIdentifier("connect-zone-\(moment.id)")
                    }
                    if let preview = model.previews[moment.id] {
                        Text("On \(name(moment))’s day, Nexdo calls you at \(preview.recipientLocal) their time (\(preview.userLocal) your time) and connects you. \(name(moment)) sees your number.")
                            .font(.caption).foregroundStyle(.secondary)
                        if !preview.userOk {
                            Label("That’s \(preview.userLocal) for you. Choose a time between 8:00 AM and 9:30 PM your time.", systemImage: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(.red)
                        } else if !preview.recipientOk {
                            Label("That’s \(preview.recipientLocal) for \(name(moment)).", systemImage: "moon.fill").font(.caption).foregroundStyle(.orange)
                        }
                    }
                }
                if model.dirty(moment.id) {
                    Button(draft.enabled ? "Save call time" : "Turn off connect call") { Task { await model.save(moment.id) } }
                        .buttonStyle(.borderedProminent).disabled(model.busy || (draft.enabled && model.previews[moment.id]?.userOk == false))
                        .accessibilityIdentifier("connect-save-\(moment.id)")
                }
                Button("How it works", systemImage: "questionmark.circle") { showingHowItWorks = true }
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight:44)
                    .accessibilityIdentifier("connect-how-it-works-\(moment.id)")
                if let last = state.lastCall {
                    Text("Last call (\(last.date)): \(MomentConnectModel.statusLabel(last.status))").font(.caption).foregroundStyle(.secondary)
                }
                if state.isToday && model.verified && state.recipientPhone != nil {
                    Button("Connect now", systemImage: "phone.arrow.up.right.fill") { Task { await model.connectNow(moment.id) } }
                        .disabled(model.busy).accessibilityIdentifier("connect-now-\(moment.id)")
                }
            } else {
                Text(name(moment)).font(.headline)
                Text("Save this moment first to set up a connect call.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func schedulePreview(_ id: String) {
        previewTask?.cancel()
        previewTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await model.refreshPreview(id)
        }
    }
}

/// Twilio caller-ID verification: Twilio calls the number and the user types the code shown here.
struct CallerIDVerificationSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model: MomentConnectModel
    @State private var phone = ""
    @State private var code: String?
    @State private var failed = false
    @State private var editing = false
    @State private var polling: Task<Void, Never>?

    private var showVerified: Bool { !editing && model.verified }

    var body: some View {
        NavigationStack {
            Form {
                if let code {
                    Section("Answer the call from Twilio") {
                        Text("Twilio is calling \(phone) now. When asked, type this code on your phone’s keypad:")
                        Text(code.map { String($0) }.joined(separator: " ")).font(.system(size: 40, weight: .bold, design: .monospaced))
                            .frame(maxWidth: .infinity).accessibilityIdentifier("caller-id-code")
                        if failed {
                            Label("That didn’t work. Try again.", systemImage: "xmark.octagon.fill").foregroundStyle(.red)
                            Button("Call me again") { Task { await start() } }
                        } else {
                            HStack { ProgressView(); Text("Waiting for the call to finish…").foregroundStyle(.secondary) }
                        }
                        Text("The verification call is in English.").font(.caption).foregroundStyle(.secondary)
                    }
                } else if showVerified {
                    Section {
                        Label("Verified: \(model.callerID?.phone ?? "")", systemImage: "checkmark.seal.fill").foregroundStyle(.green)
                        Text("When Nexdo connects you, the person you call sees this number.").font(.caption).foregroundStyle(.secondary)
                    }
                    Section { Button("Verify a different number") { editing = true; phone = "" } }
                    Section { Button("Remove my number", role: .destructive) { Task { await model.removeNumber(); dismiss() } } }
                } else {
                    Section("Your mobile number") {
                        TextField("+1 650 555 0123", text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                            .accessibilityIdentifier("caller-id-phone")
                        Text("Include your country code. Twilio will call this number once; you type a 6-digit code to prove it’s yours.").font(.caption).foregroundStyle(.secondary)
                    }
                    Section {
                        Button("Call me to verify") { Task { await start() } }
                            .disabled(model.busy || phone.filter(\.isNumber).count < 8)
                            .accessibilityIdentifier("caller-id-start")
                    }
                }
            }
            .navigationTitle("Show my number")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .onDisappear { polling?.cancel() }
        }
    }

    private func start() async {
        failed = false
        let number = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let started = await model.startVerification(phone: number) else {
            if model.verified { code = nil; editing = false }
            return
        }
        code = started
        polling?.cancel()
        polling = Task {
            for _ in 0..<60 {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard !Task.isCancelled else { return }
                let status = await model.pollVerification()
                if status == "VERIFIED" { code = nil; editing = false; return }
                if status == "FAILED" { failed = true; return }
            }
        }
    }
}


private struct MomentCallingGuide: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.dismiss) private var dismiss
    private let ink = Color(red:0.07,green:0.05,blue:0.24)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:20) {
                    HStack(alignment:.top,spacing:16) {
                        MomentCallingArtwork(rect:CGRect(x:25,y:55,width:172,height:156))
                            .frame(width:76,height:76)
                        VStack(alignment:.leading,spacing:10) {
                            Text("We call for you on special days").font(.title.bold())
                            Text("NexDo makes the call at the time you choose and connects you with your loved ones.")
                                .foregroundStyle(.secondary)
                        }
                    }.padding(.vertical,12)
                    step(1,title:"Set it up",text:"Turn on the calling feature, verify your phone number, and choose the call time and time zone.",rect:CGRect(x:1022,y:273,width:257,height:182))
                    step(2,title:"We call you",text:"On the selected day, NexDo calls you at the scheduled time. Answer the call and confirm that you’d like to be connected.",rect:CGRect(x:24,y:514,width:220,height:201))
                    step(3,title:"You’re connected",text:"After you say yes, we dial your loved one and connect you. They’ll see your verified phone number.",rect:CGRect(x:594,y:518,width:466,height:195))
                    HStack(alignment:.top,spacing:12) {
                        Image(systemName:"info.circle.fill").font(.title2).foregroundStyle(.blue)
                        VStack(alignment:.leading,spacing:8) {
                            Text("Good to know").font(.headline)
                            Text("• We call you only on the days you choose.")
                            Text("• If you don’t answer or confirm, we won’t call your loved one.")
                            Text("• Your loved one sees your verified phone number.")
                            Text("• You can change or turn off this feature anytime.")
                        }.font(.subheadline)
                    }.padding(18).frame(maxWidth:.infinity,alignment:.leading)
                        .background(Color.blue.opacity(0.08),in:RoundedRectangle(cornerRadius:22))
                    Button { dismiss() } label: {
                        Text("Got it!").font(.headline).foregroundStyle(.white)
                            .frame(maxWidth:.infinity,minHeight:52)
                            .background(LinearGradient(colors:[Color.purple,Color.nexdoIndigo],startPoint:.topLeading,endPoint:.bottomTrailing),in:Capsule())
                    }.buttonStyle(.plain).accessibilityIdentifier("calling-guide-done")
                    Button("Back to settings") { dismiss() }
                        .font(.headline).frame(maxWidth:.infinity,minHeight:44)
                }.padding(20)
            }
            .foregroundStyle(ink)
            .background(LinearGradient(colors:[Color.blue.opacity(0.13),Color.purple.opacity(0.09),Color.white],startPoint:.topLeading,endPoint:.bottomTrailing).ignoresSafeArea())
            .navigationTitle("How It Works").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement:.cancellationAction) {
                Button("Back",systemImage:"chevron.left") { dismiss() }
            } }
        }.tint(.nexdoIndigo)
    }
    private func step(_ number:Int,title:String,text:String,rect:CGRect) -> some View {
        HStack(alignment:.top,spacing:10) {
            Text("\(number)").font(.title3.bold()).foregroundStyle(Color.nexdoIndigo)
                .frame(width:32,height:32).background(Color.nexdoIndigo.opacity(0.09),in:Circle())
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:12)) : AnyLayout(HStackLayout(alignment:.center,spacing:12))
            layout {
                VStack(alignment:.leading,spacing:10) {
                    Text(title).font(.title3.bold())
                    Text(text).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
                }.frame(maxWidth:.infinity,alignment:.leading)
                MomentCallingArtwork(rect:rect).frame(width:typeSize.isAccessibilitySize ? 180:100,height:120)
            }.padding(18).frame(maxWidth:.infinity,alignment:.leading)
                .background(.white.opacity(0.9),in:RoundedRectangle(cornerRadius:24))
        }
    }
}
private struct MomentCallingArtwork: View {
    let rect: CGRect
    private static let source = UIImage(named:"moment-calling-pack")?.cgImage
    var body: some View {
        if let source=Self.source,let region=source.cropping(to:rect) {
            Image(decorative:region,scale:1).resizable().interpolation(.high).scaledToFit()
                .accessibilityHidden(true)
        }
    }
}
