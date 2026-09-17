import SwiftUI
import MessageUI

struct MomentCard<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View { VStack(alignment: .leading, spacing: 14, content: content).frame(maxWidth: .infinity, alignment: .leading).padding(18).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22)).overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.nexdoIndigo.opacity(0.18))) }
}
struct MomentPrimary: View {
    let title: String
    let action: () -> Void
    var body: some View { Button(action: action) { Text(title).font(.headline).foregroundStyle(.white).frame(maxWidth: .infinity, minHeight: 54).background(NexdoTheme.gradient, in: RoundedRectangle(cornerRadius: 18)) }.buttonStyle(.plain).accessibilityIdentifier("wish-primary") }
}
struct ImportantMomentsTodayCard: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    var body: some View {
        MomentCard {
            HStack { Label("Important Moments", systemImage: "gift.fill").font(.headline); Spacer(); NavigationLink("See all") { ImportantMomentsView() } }
            if let moment = store.today.first {
                Text(moment.title).font(.title3.bold())
                Text(moment.latest == nil ? "Prepare a wish for today" : "Message ready for your review").font(.subheadline).foregroundStyle(.secondary)
                HStack {
                    NavigationLink { ReviewWishView(moment: moment) } label: { Text("Review & Send").font(.headline) }.buttonStyle(.borderedProminent)
                    Spacer()
                    Menu {
                        Button("Snooze 1 hour") { Task { await store.perform { try await store.visibility(moment, enabled: true, snooze: true) } } }
                        NavigationLink("Edit") { MomentEditor(moment: moment) }
                        Button("Dismiss / Disable Reminder") { Task { await store.perform { try await store.visibility(moment, enabled: false) } } }
                    } label: { Image(systemName: "ellipsis.circle").frame(width: 44, height: 44) }.accessibilityLabel("Moment actions")
                }
            } else { Text(store.moments.isEmpty ? "Remember birthdays, anniversaries, and days that matter." : "Your upcoming wishes are ready to plan.").font(.subheadline).foregroundStyle(.secondary) }
        }
    }
}
struct MomentIconTile: View {
    let type: String
    var title = ""
    private var color: Color {
        switch type { case "birthday": .red; case "anniversary": .purple; case "festival": .orange; default: .nexdoIndigo }
    }
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16).fill(color.opacity(0.16).gradient)
            if type == "anniversary" {
                ZStack {
                    Image(systemName: "heart").offset(x: -7, y: -4)
                    Image(systemName: "heart").offset(x: 7, y: 5)
                }.font(.system(size: 30, weight: .semibold))
            } else if type == "festival" && title.localizedCaseInsensitiveContains("diwali") {
                VStack(spacing: 1) {
                    Image(systemName: "flame.fill").font(.system(size: 25))
                    UnevenRoundedRectangle(bottomLeadingRadius: 22, bottomTrailingRadius: 22)
                        .frame(width: 38, height: 17)
                }
            } else {
                Image(systemName: type == "birthday" ? "gift.fill" : type == "festival" ? "sparkles" : type == "summary" ? "calendar" : "star.fill")
                    .font(.system(size: 32, weight: .medium))
            }
        }
        .foregroundStyle(color).frame(width: 64, height: 64)
        .accessibilityHidden(true)
    }
}
struct MomentStatusBadge: View {
    let title: String
    let color: Color
    let icon: String
    var body: some View {
        Label(title, systemImage: icon).font(.caption.weight(.semibold))
            .foregroundStyle(color).padding(.horizontal, 10).padding(.vertical, 6)
            .background(color.opacity(0.14), in: Capsule())
    }
}
private struct UpcomingMomentRow: View {
    let moment: ImportantMoment
    private var plan: WishDeliveryPlan? { moment.upcomingDelivery }
    var body: some View {
        MomentCard {
            HStack(alignment: .top, spacing: 14) {
                MomentIconTile(type: moment.type, title: moment.title)
                VStack(alignment: .leading, spacing: 8) {
                    Text(moment.title).font(.title3.bold())
                    Text("\(moment.type.capitalized) · \(MomentDates.relative(moment.nextOccurrence, zone: moment.timeZoneID))")
                        .font(.subheadline).foregroundStyle(.secondary)
                    if !moment.enabled {
                        MomentStatusBadge(title: "Disabled", color: .secondary, icon: "pause.circle")
                    } else if let plan {
                        MomentStatusBadge(title: plan.automaticDelivery ? "Auto-send scheduled" : "Reminder scheduled",
                                          color: plan.automaticDelivery ? .green : .blue,
                                          icon: plan.automaticDelivery ? "checkmark.circle.fill" : "clock")
                        Text("\(plan.channel.capitalized) · \(MomentDates.label(plan.date, zone: plan.timeZoneID))")
                            .font(.caption).foregroundStyle(.secondary)
                        NavigationLink { WishPlanView(plan: plan) } label: { Label("Manage", systemImage: "chevron.right") }
                    } else {
                        MomentStatusBadge(title: "Needs review", color: .orange, icon: "exclamationmark.circle.fill")
                        Text(moment.latest == nil ? "Create a personal wish" : "Message draft ready").font(.caption).foregroundStyle(.secondary)
                        NavigationLink { ReviewWishView(moment: moment) } label: {
                            Text("Review").font(.subheadline.bold()).foregroundStyle(.white)
                                .padding(.horizontal, 22).padding(.vertical, 10)
                                .background(NexdoTheme.gradient, in: RoundedRectangle(cornerRadius: 12))
                        }.accessibilityLabel(moment.latest == nil ? "Create wish" : "Review wish")
                    }
                    NavigationLink("Edit") { MomentEditor(moment: moment) }.font(.subheadline)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}
private struct FestivalGroupCard: View {
    let group: MomentDisplayGroup
    var body: some View {
        if let moment = group.moments.first {
            MomentCard {
                HStack(alignment: .top, spacing: 14) {
                    MomentIconTile(type: "festival", title: moment.title)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(moment.title).font(.title3.bold())
                        Text("Festival · \(MomentDates.relative(moment.nextOccurrence, zone: moment.timeZoneID))")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Label("\(group.moments.count) selected contacts", systemImage: "person.2.fill")
                            .font(.subheadline.weight(.medium)).foregroundStyle(Color.nexdoIndigo)
                        let scheduled = group.moments.filter { $0.enabled && $0.upcomingDelivery != nil }.count
                        let review = group.moments.filter { $0.enabled && $0.upcomingDelivery == nil }.count
                        if review > 0 {
                            MomentStatusBadge(title: "\(review) need review", color: .orange, icon: "exclamationmark.circle.fill")
                        }
                        if scheduled > 0 {
                            MomentStatusBadge(title: "\(scheduled) scheduled", color: .blue, icon: "clock")
                        }
                        NavigationLink {
                            FestivalRecipientsView(group: group)
                        } label: {
                            Label("Manage recipients", systemImage: "chevron.right")
                                .font(.subheadline.bold())
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}
private struct FestivalRecipientsView: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    let group: MomentDisplayGroup
    private var recipients: [ImportantMoment] {
        let ids = Set(group.moments.map(\.id))
        return store.moments.filter { ids.contains($0.id) }
    }
    var body: some View {
        ZStack {
            TodayBackdrop()
            ScrollView {
                VStack(spacing: 16) {
                    Text("\(recipients.count) selected contacts").font(.headline)
                    ForEach(recipients) { moment in
                        MomentCard {
                            Text(moment.firstName.isEmpty ? "Recipient" : moment.firstName).font(.title3.bold())
                            if !moment.phone.isEmpty { Text(moment.phone).foregroundStyle(.secondary) }
                            if !moment.email.isEmpty { Text(moment.email).foregroundStyle(.secondary) }
                            if let plan = moment.upcomingDelivery {
                                Text(plan.statusLabel).font(.subheadline)
                            }
                            HStack(spacing: 14) {
                                if let plan = moment.upcomingDelivery {
                                    NavigationLink("Manage Wish") { WishPlanView(plan: plan) }
                                } else {
                                    NavigationLink("Review Wish") { ReviewWishView(moment: moment) }
                                }
                                Rectangle().fill(Color.secondary.opacity(0.4))
                                    .frame(width: 1, height: 20).accessibilityHidden(true)
                                NavigationLink("Edit Recipient") { MomentEditor(moment: moment) }
                            }
                            .font(.subheadline)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        }
                    }
                }.padding(18)
            }
        }.navigationTitle(group.moments.first?.title ?? "Festival")
            .navigationBarTitleDisplayMode(.inline)
    }
}
struct ImportantMomentsView: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    @State private var tab = "Upcoming"
    @State private var search = ""
    @State private var filter = "All"
    @State private var deliveryFilter = "All"
    private var displayed: [ImportantMoment] { store.moments.filter { (tab == "Sent" || !($0.festivalSettings?.contains("\"archived\":true") ?? false)) && (tab != "Upcoming" || $0.nextOccurrence >= MomentDates.day(Date(), zone: $0.timeZoneID)) && (filter == "All" || $0.type == filter.lowercased()) && (search.isEmpty || $0.title.localizedCaseInsensitiveContains(search)) }.sorted { $0.nextOccurrence < $1.nextOccurrence } }
    var body: some View {
        ZStack { TodayBackdrop(); ScrollView { VStack(spacing: 16) {
            MomentSegments(options: ["Upcoming", "Scheduled", "Sent"], selection: $tab)
            HStack {
                TextField("Search moments", text: $search).textFieldStyle(.roundedBorder)
                Picker("Type", selection: $filter) { ForEach(["All","Birthday","Anniversary","Festival","Custom"], id: \.self) { Text($0) } }.labelsHidden().accessibilityLabel("Filter moment type")
            }
            if tab == "Upcoming" {
                MomentCard {
                    HStack(spacing: 16) {
                        MomentIconTile(type: "summary")
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(MomentDisplayGroup.groups(displayed.filter(\.enabled)).count) upcoming moment\(MomentDisplayGroup.groups(displayed.filter(\.enabled)).count == 1 ? "" : "s")").font(.title3.bold())
                            let scheduled = displayed.filter { $0.enabled && $0.upcomingDelivery != nil }.count
                            let review = displayed.filter { $0.enabled && $0.upcomingDelivery == nil }.count
                            Text("\(scheduled) wish\(scheduled == 1 ? "" : "es") scheduled · \(review) need\(review == 1 ? "s" : "") review")
                                .font(.subheadline).foregroundStyle(.secondary)
                            NavigationLink { FestivalManagementEntry() } label: {
                                Label("Manage Moments", systemImage: "slider.horizontal.3").foregroundStyle(Color.nexdoIndigo).frame(minHeight: 44)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
                ForEach(MomentUpcomingGroup.allCases, id: \.self) { group in
                    let items = displayed.filter { $0.upcomingGroup() == group }
                    if !items.isEmpty {
                        Text(group.rawValue).font(.title.bold())
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
                        ForEach(MomentDisplayGroup.groups(items)) { entry in
                            if entry.moments.first?.type == "festival" {
                                FestivalGroupCard(group: entry)
                            } else if let moment = entry.moments.first {
                                UpcomingMomentRow(moment: moment)
                            }
                        }
                    }
                }
            } else {
                if tab == "Scheduled" { Picker("Delivery", selection: $deliveryFilter) { ForEach(["All","Automatic","Confirmation","Action needed"], id: \.self) { Text($0) } } }
                ForEach(store.plans.filter { p in
                    let matches = displayed.contains { $0.drafts.contains { $0.id == p.draftID } }
                    let history = ["SENT","COPIED","SHARED"].contains(p.status)
                    return matches && (tab == "Sent" ? history : !history && p.status != "CANCELLED") && (deliveryFilter == "All" || tab == "Sent" || deliveryFilter == "Automatic" && p.automaticDelivery || deliveryFilter == "Confirmation" && !p.automaticDelivery || deliveryFilter == "Action needed" && ["FAILED","UNCERTAIN"].contains(p.status))
                }) { plan in NavigationLink { WishPlanView(plan: plan) } label: {
                    MomentCard {
                        HStack(alignment: .top, spacing: 14) {
                            let moment = displayed.first { $0.drafts.contains { $0.id == plan.draftID } }
                            MomentIconTile(type: moment?.type ?? "custom", title: moment?.title ?? plan.subject)
                            VStack(alignment: .leading, spacing: 8) {
                                Text(plan.subject).font(.headline)
                                Text(plan.statusLabel).foregroundStyle(Color.nexdoIndigo)
                                Text(plan.body).lineLimit(2)
                                Text("\(plan.channel.capitalized) · \(MomentDates.label(plan.date, zone: plan.timeZoneID))").font(.caption)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }.buttonStyle(.plain) }
            }
            if displayed.isEmpty { ContentUnavailableView("No moments yet", systemImage: "gift", description: Text("Add a moment manually, or select contacts and calendars in Settings.")) }
            if let error = store.error { Text(error).foregroundStyle(.red); Button("Retry") { Task { await store.refresh() } } }
            if store.loading { ProgressView() }
            if let synced = store.lastSynced { Text("Updated \(synced.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(.secondary) }
            NavigationLink { MomentEditor() } label: { Label("Add Moment", systemImage: "plus").font(.headline).frame(maxWidth: .infinity, minHeight: 52) }.buttonStyle(.borderedProminent)
        }.padding(18) } }
        .navigationTitle("Important Moments").navigationBarTitleDisplayMode(.inline)
        .toolbar { NavigationLink { MomentSettingsView() } label: { Image(systemName: "gearshape") }.accessibilityLabel("Important Moments settings") }
        .task { await store.prepareDefaultReminders(); await store.refresh() }.refreshable { await store.refresh() }
    }
}
struct ReviewWishView: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    @Environment(\.dismiss) private var dismiss
    let moment: ImportantMoment
    @State private var draft: WishDraft?
    @State private var bodyText = ""
    @State private var tone = "Warm"
    @State private var personalContext = ""
    @State private var aiConsent = false
    @State private var next = false
    @FocusState private var editing: Bool
    var body: some View {
        ZStack { TodayBackdrop(); ScrollView { VStack(spacing: 16) {
            MomentCard {
                Label(moment.firstName.isEmpty ? moment.title : moment.firstName, systemImage: moment.icon).font(.title2.bold())
                if moment.type == "festival" {
                    Text("Festival: \(moment.title)").foregroundStyle(.secondary)
                    Text(moment.nextOccurrence).foregroundStyle(.secondary)
                } else {
                    Text("\(moment.type.capitalized) · \(moment.nextOccurrence)").foregroundStyle(.secondary)
                }
            }
            MomentCard {
                Label("Choose a tone", systemImage: "sparkles").font(.title2.bold()); Text("Adjust the vibe of your message.").foregroundStyle(.secondary)
                MomentSegments(options: ["Warm", "Personal", "Short", "Fun"], selection: $tone)
                DisclosureGroup("Personalize with AI") {
                TextField("Personal context (optional)", text: $personalContext, axis: .vertical).textFieldStyle(.roundedBorder)
                Toggle("Use AI to draft my wish", isOn: $aiConsent)
                Text("Only the first name, event type, tone, and context you enter are shared with OpenAI. You review every draft.").font(.caption).foregroundStyle(.secondary)
                }
            }
            MomentCard {
                Label("Message preview", systemImage: "doc.text").font(.title2.bold()); Text("Review and make any changes.").foregroundStyle(.secondary)
                TextEditor(text: $bodyText).frame(minHeight: 145).scrollContentBackground(.hidden).focused($editing).padding(8).background(.background.opacity(0.65), in: RoundedRectangle(cornerRadius: 14)).accessibilityLabel("Wish message")
                Text("\(bodyText.count)/500").frame(maxWidth: .infinity, alignment: .trailing).foregroundStyle(bodyText.count > 500 ? .red : .secondary)
                HStack { Button("Try another", systemImage: "sparkles") { generate() }; Spacer(); Button("Edit", systemImage: "pencil") { editing = true } }.buttonStyle(.bordered)
            }
            Label("Nothing is sent without your approval.", systemImage: "checkmark.shield").font(.caption).foregroundStyle(.secondary)
            if let error = store.error { Text(error).foregroundStyle(.red) }
            MomentPrimary(title: "Approve & Continue") {
                editing = false
                Task { await store.perform {
                    struct Input: Encodable { let id, body: String; let approved = true }
                    struct Result: Decodable, Sendable { let draft: WishDraft }
                    guard let draft else { return }
                    let result: Result = try await store.request("approve", Input(id: draft.id, body: bodyText))
                    self.draft = result.draft; next = true
                } }
            }.disabled(store.busy || draft == nil || bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || bodyText.count > 500)
        }.padding(18) } }
        .navigationTitle("Review Wish").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } } }
        .navigationDestination(isPresented: $next) { if let draft { WishDeliveryView(moment: moment, draft: draft) } }
        .task { if draft == nil { if let latest = moment.latest, latest.status != "PLANNED" { draft = latest; bodyText = latest.body; tone = latest.tone; personalContext = latest.personalContext } else { generate() } } }
    }
    private func generate() {
        Task { await store.perform {
            struct Input: Encodable { let momentID, tone, personalContext: String; let aiConsent: Bool }
            struct Result: Decodable, Sendable { let draft: WishDraft; let usedAI: Bool }
            let result: Result = try await store.request("generate", Input(momentID: moment.id, tone: tone, personalContext: personalContext, aiConsent: aiConsent))
            draft = result.draft; bodyText = result.draft.body
        } }
    }
}
struct WishDeliveryView: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    let moment: ImportantMoment
    let draft: WishDraft
    @State private var channel = "messages"
    @State private var timing = "Now"
    @State private var recipient = ""
    @State private var requestID = UUID().uuidString
    @State private var plan: WishDeliveryPlan?
    @State private var showComposer = false
    @State private var showShare = false
    @State private var confirmEmail = false
    var body: some View {
        ZStack { TodayBackdrop(); ScrollView { VStack(alignment: .leading, spacing: 20) {
            MomentCard { Label(moment.title, systemImage: moment.icon).font(.title2.bold()); Text(draft.body).lineLimit(3).foregroundStyle(.secondary) }
            Text("Send with").font(.largeTitle.bold())
            ForEach([("messages","Messages","message.fill"),("email","Email","envelope.fill"),("copy","Copy","doc.on.doc"),("share","Share","square.and.arrow.up")], id: \.0) { item in
                Button { channel = item.0; recipient = channel == "email" ? moment.email : moment.phone } label: {
                    MomentCard { HStack { Image(systemName: item.2).font(.title).foregroundStyle(Color.nexdoIndigo); Text(item.1).font(.title3.bold()); Spacer(); Image(systemName: channel == item.0 ? "checkmark.circle.fill" : "circle") } }
                }.buttonStyle(.plain)
            }
            if ["messages","email"].contains(channel) {
                TextField(channel == "email" ? "Recipient email" : "Recipient phone", text: $recipient).textFieldStyle(.roundedBorder).textInputAutocapitalization(.never).keyboardType(channel == "email" ? .emailAddress : .phonePad)
                Text("When").font(.title.bold())
                Picker("When", selection: $timing) { ForEach(["Now","Schedule","Remind me later"], id: \.self) { Text($0) } }.pickerStyle(.segmented)
            }
            Text(channel == "messages" ? "Nexdo opens Messages. You confirm the final send." : channel == "email" ? "From: \(store.snapshot?.emailAccount?.email ?? "Connect email in Important Moments Settings")" : "Copying or sharing is recorded separately from sending.").font(.subheadline).foregroundStyle(.secondary)
            if let error = store.error { Text(error).foregroundStyle(.red) }
            if store.busy { ProgressView() }
            if timing != "Now" && ["messages","email"].contains(channel) {
                NavigationLink { ScheduleWishView(moment: moment, draft: draft, channel: channel, recipient: recipient) } label: { Text("Choose date & time").font(.headline).frame(maxWidth: .infinity, minHeight: 52) }.buttonStyle(.borderedProminent)
            } else {
                MomentPrimary(title: channel == "messages" ? "Open Messages" : channel == "email" ? "Review email & send" : channel.capitalized) {
                    if channel == "email" { confirmEmail = true } else { send() }
                }.disabled(store.busy || plan != nil)
            }
            if let plan, !showComposer && !showShare { NavigationLink("View delivery status") { WishPlanView(plan: plan) } }
        }.padding(18) } }
        .navigationTitle("Choose Delivery").navigationBarTitleDisplayMode(.inline)
        .onAppear { if recipient.isEmpty { recipient = moment.phone } }
        .sheet(isPresented: $confirmEmail) {
            WishEmailConfirmation(account: store.snapshot?.emailAccount?.email ?? "No connected account", recipient: recipient, subject: moment.title, message: draft.body) { confirmEmail = false; send() }
        }
        .sheet(isPresented: $showComposer) { ActionMessageComposer(recipient: recipient, body: draft.body) { result in
            showComposer = false
            Task { await store.perform { if let plan { try await store.planAction(plan, action: result == .submitted ? "sent" : result == .failed ? "failed" : "cancel") }; await store.refresh(); self.plan = plan.flatMap { original in store.plans.first { $0.id == original.id } } } }
        } }
        .sheet(isPresented: $showShare) { MomentShareSheet(text: draft.body) { completed in
            showShare = false
            Task { await store.perform { if let plan { try await store.planAction(plan, action: completed ? "shared" : "cancel") } } }
        } }
    }
    private func send() {
        Task { await store.perform {
            if channel == "messages" && !MFMessageComposeViewController.canSendText() { throw TaskActionServiceError.unavailable }
            let result: WishPlanResponse = try await store.request("schedule", WishScheduleInput(draftID: draft.id, channel: channel, recipient: recipient, scheduledAtUTC: ISO8601DateFormatter().string(from: Date()), timeZoneID: moment.timeZoneID, automaticDelivery: channel == "email", reminderOffset: 0, repeatYearly: false, idempotencyKey: requestID, sendNow: true))
            plan = result.plan
            if channel == "messages" { showComposer = true }
            if channel == "share" { showShare = true }
            if channel == "copy" { UIPasteboard.general.string = draft.body; try await store.planAction(result.plan, action: "copied") }
        } }
    }
}
struct WishScheduleInput: Encodable {
    let draftID, channel, recipient, scheduledAtUTC, timeZoneID: String
    let automaticDelivery: Bool
    let reminderOffset: Int
    let repeatYearly: Bool
    let idempotencyKey: String
    var sendNow = false
    let approved = true
}
struct WishPlanResponse: Decodable, Sendable { let plan: WishDeliveryPlan }
struct ScheduleWishView: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    let moment: ImportantMoment
    let draft: WishDraft
    let channel, recipient: String
    @State private var date = Date().addingTimeInterval(3600)
    @State private var zone = TimeZone.current.identifier
    @State private var automatic = false
    @State private var warning = true
    @State private var yearly = false
    @State private var key = UUID().uuidString
    @State private var saved: WishDeliveryPlan?
    @State private var next = false
    var body: some View {
        ZStack { TodayBackdrop(); ScrollView { VStack(alignment: .leading, spacing: 18) {
            MomentCard { Label(moment.title, systemImage: moment.icon).font(.title2.bold()); Text(moment.nextOccurrence) }
            Text("Delivery method").font(.title.bold())
            MomentCard { Label(channel.capitalized, systemImage: channel == "email" ? "envelope.fill" : "message.fill").font(.headline); Text(recipient); Text(channel == "messages" ? "Confirmation required" : store.snapshot?.emailAccount?.email ?? "Connect email in Settings").foregroundStyle(.secondary) }
            Text("Send date & time").font(.title.bold())
            MomentCard {
                DatePicker("Date and time", selection: $date, in: Date()...).environment(\.timeZone, TimeZone(identifier: zone) ?? .current)
                Picker("Time zone", selection: $zone) { ForEach(TimeZone.knownTimeZoneIdentifiers, id: \.self) { Text($0).tag($0) } }
            }
            MomentCard {
                if channel == "email" {
                    Toggle("Send automatically", isOn: $automatic).disabled(store.snapshot?.automaticEmailEnabled != true)
                    if store.snapshot?.automaticEmailEnabled != true { Text("Automatic delivery needs a connected email account and the server scheduler.").font(.caption) }
                } else { Text("We’ll remind you to confirm in Messages.") }
                Toggle("Notify me 1 hour before", isOn: $warning)
                Toggle("Repeat yearly", isOn: $yearly)
                if !automatic { Text("Yearly Messages wishes still require your confirmation each year. Reopen Nexdo to refresh local reminders.").font(.caption).foregroundStyle(.secondary) }
            }
            MomentCard { Text("Approved message").font(.headline); Text(draft.body); Text("Go back to Review Wish to change the message.").font(.caption) }
            Text("Allow notifications to receive reminders. Email delivery runs on the server even when Nexdo is closed.").font(.caption).foregroundStyle(.secondary)
            if let error = store.error { Text(error).foregroundStyle(.red) }
            MomentPrimary(title: automatic ? "Schedule Automatic Send" : "Schedule Reminder") {
                Task { await store.perform {
                    if !automatic || warning { try await store.authorizeNotifications() }
                    let response: WishPlanResponse = try await store.request("schedule", WishScheduleInput(draftID: draft.id, channel: channel, recipient: recipient, scheduledAtUTC: ISO8601DateFormatter().string(from: date), timeZoneID: zone, automaticDelivery: automatic, reminderOffset: warning ? 60 : 0, repeatYearly: yearly, idempotencyKey: key))
                    saved = response.plan; next = true
                } }
            }.disabled(store.busy || saved != nil || date <= Date())
        }.padding(18) } }
        .navigationTitle("Schedule Wish").navigationBarTitleDisplayMode(.inline)
        .onAppear { zone = moment.timeZoneID }
        .navigationDestination(isPresented: $next) { if let saved { WishPlanView(plan: saved, confirmation: true) } }
    }
}
struct WishPlanView: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    @Environment(\.dismiss) private var dismiss
    let plan: WishDeliveryPlan
    var confirmation = false
    @State private var sendEmailNow = false
    @State private var cancel = false
    @State private var changing = false
    @State private var composer = false
    @State private var date = Date().addingTimeInterval(3600)
    private var current: WishDeliveryPlan { store.plans.first { $0.id == plan.id } ?? plan }
    var body: some View {
        ZStack { TodayBackdrop(); ScrollView { VStack(spacing: 20) {
            Image(systemName: confirmation ? "calendar.badge.checkmark" : "gift.fill").font(.system(size: 76)).foregroundStyle(Color.nexdoIndigo).padding(20)
            Text(confirmation && ["SCHEDULED", "AWAITING_CONFIRMATION"].contains(current.status) ? "Wish scheduled" : current.statusLabel).font(.largeTitle.bold())
            Text(current.status == "SENT" ? "Your wish was submitted successfully." : current.status == "CANCELLED" ? "This wish will not be sent." : current.automaticDelivery && current.status == "SCHEDULED" ? "Approved email will send automatically at the scheduled time." : "Review the delivery status below.").multilineTextAlignment(.center)
            MomentCard {
                Text(current.subject).font(.title2.bold()); Text(current.recipient)
                Divider(); LabeledContent("Delivery", value: current.channel.capitalized)
                LabeledContent("Send time", value: MomentDates.label(current.date, zone: current.timeZoneID))
                LabeledContent("Time zone", value: current.timeZoneID)
                LabeledContent("Reminder", value: current.reminderOffset == 60 ? "1 hour before" : "At scheduled time")
                LabeledContent("Repeat", value: current.repeatYearly ? "Yearly" : "Once")
                Text(current.body).padding(.top, 8)
                if let error = current.lastError { Text(error).foregroundStyle(.red) }
            }
            if current.editable {
                Button("Edit Schedule") { date = max(current.date, Date().addingTimeInterval(60)); changing = true }.buttonStyle(.bordered)
                if current.status == "AWAITING_CONFIRMATION" && current.channel == "messages" {
                    Button("Review & Open Messages") { if MFMessageComposeViewController.canSendText() { composer = true } else { store.error = "Messages is not available on this device." } }.buttonStyle(.borderedProminent)
                }
                if current.channel == "email" { Button("Send email now") { sendEmailNow = true } }
                if current.status == "FAILED" && current.automaticDelivery { Button("Retry after reconnecting") { Task { await store.perform { try await store.planAction(current, action: "retry") } } } }
                Button("Cancel scheduled wish", role: .destructive) { cancel = true }
            }
            if ["SENT","COPIED","SHARED"].contains(current.status) {
                Button("Copy message") { UIPasteboard.general.string = current.body }
                if let m = store.moments.first(where: { $0.drafts.contains { $0.id == current.draftID } }) { NavigationLink("Reuse next year") { ReviewWishView(moment: m) } }
            }
            if let error = store.error { Text(error).foregroundStyle(.red) }
            MomentPrimary(title: "Done") { dismiss() }
        }.padding(18) } }
        .navigationTitle("Wish details").navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $sendEmailNow) {
            WishEmailConfirmation(account: store.snapshot?.emailAccount?.email ?? "No connected account", recipient: current.recipient, subject: current.subject, message: current.body) {
                sendEmailNow = false
                Task { await store.perform { try await store.planAction(current, action: "sendNow") } }
            }
        }
        .confirmationDialog("Cancel this wish?", isPresented: $cancel, titleVisibility: .visible) { Button("Cancel wish", role: .destructive) { Task { await store.perform { try await store.planAction(current, action: "cancel") } } } }
        .sheet(isPresented: $changing) { NavigationStack { Form { DatePicker("New time", selection: $date, in: Date()...).environment(\.timeZone, TimeZone(identifier: current.timeZoneID) ?? .current); Button("Save schedule") { Task { await store.perform { try await store.planAction(current, action: "reschedule", date: date); changing = false } } }; if let error = store.error { Text(error).foregroundStyle(.red) } }.navigationTitle("Edit Schedule").toolbar { Button("Close") { changing = false } } } }
        .sheet(isPresented: $composer) { ActionMessageComposer(recipient: current.recipient, body: current.body) { result in
            composer = false
            if result != .cancelled { Task { await store.perform { try await store.planAction(current, action: result == .submitted ? "sent" : "failed") } } }
        } }
    }
}
struct MomentShareSheet: UIViewControllerRepresentable {
    let text: String
    let completed: (Bool) -> Void
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, done, _, _ in completed(done) }
        return controller
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct MomentSheetHost: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    var body: some View {
        Color.clear.frame(width: 0, height: 0).sheet(item: $store.route) { moment in
            MomentRoutedView(moment: moment) { store.route = nil }
                .environmentObject(store)
        }
    }
}

/// A writable destination binding allows both Back and dismiss() to pop the route.
private struct MomentRoutedView: View {
    @EnvironmentObject private var store: ImportantMomentsStore
    let moment: ImportantMoment
    let close: () -> Void
    @State private var showingDetail = true
    var body: some View {
        NavigationStack {
            ImportantMomentsView()
                .navigationDestination(isPresented: $showingDetail) {
                    if let plan = moment.drafts.flatMap({ $0.plans ?? [] }).first(where: { $0.editable }) {
                        WishPlanView(plan: plan)
                    } else if moment.type == "festival", let group = MomentDisplayGroup.groups(store.moments.filter { $0.type == "festival" }).first(where: { $0.moments.contains { $0.id == moment.id } }) {
                        ManageFestivalView(group: group, store: store)
                    } else {
                        ReviewWishView(moment: moment)
                    }
                }
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Close", action: close) } }
        }
    }
}

struct WishEmailConfirmation: View {
    @Environment(\.dismiss) private var dismiss
    let account, recipient, subject, message: String
    let confirm: () -> Void
    var body: some View {
        NavigationStack {
            ScrollView { VStack(alignment: .leading, spacing: 20) {
                LabeledContent("From", value: account)
                LabeledContent("To", value: recipient)
                Text(subject).font(.title2.bold())
                Text(message)
                MomentPrimary(title: "Send email", action: confirm)
            }.padding(24) }
            .navigationTitle("Confirm email").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

struct MomentSegments: View {
    let options: [String]
    @Binding var selection: String
    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.self) { option in
                Button { selection = option } label: {
                    Text(option).font(.subheadline.weight(.medium)).foregroundStyle(selection == option ? .white : Color.nexdoIndigo)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background { if selection == option { RoundedRectangle(cornerRadius: 15).fill(NexdoTheme.gradient) } }
                }.buttonStyle(.plain).accessibilityAddTraits(selection == option ? .isSelected : [])
            }
        }.padding(4).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
    }
}
