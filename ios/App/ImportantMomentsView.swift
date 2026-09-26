import SwiftUI
import MessageUI

struct MomentCard<Content: View>: View {
    var fill:LinearGradient? = nil
    @ViewBuilder var content: () -> Content
    var body: some View { VStack(alignment: .leading, spacing: 14, content: content).frame(maxWidth: .infinity, alignment: .leading).padding(18).background {
        if let fill {RoundedRectangle(cornerRadius:22).fill(fill)}
        else {RoundedRectangle(cornerRadius:22).fill(.ultraThinMaterial)}
    }.overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.nexdoIndigo.opacity(0.18))) }
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared=false
    let type: String
    var title = ""
    private var color: Color {
        switch type { case "birthday": .red; case "anniversary": .purple; case "festival": .orange; case "getWellSoon": .teal; default: .nexdoIndigo }
    }
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16).fill(color.opacity(0.16).gradient)
            Group {
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
                Image(systemName: type == "birthday" ? "gift.fill" : type == "festival" ? "sparkles" : type == "getWellSoon" ? "heart.text.clipboard.fill" : type == "summary" ? "calendar" : "star.fill")
                    .font(.system(size: 32, weight: .medium))
            }
            }.scaleEffect(reduceMotion || appeared || type == "summary" ? 1 : 0.78)
        }
        .onAppear {
            if reduceMotion {appeared=true}
            else {withAnimation(.spring(duration:0.8,bounce:0.4)){appeared=true}}
        }
        .onDisappear {appeared=false}
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
                    Text("\(moment.typeLabel) · \(MomentDates.relative(moment.nextOccurrence, zone: moment.timeZoneID))")
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
                        MomentStatusBadge(title: moment.readyToSchedule ? "Ready to schedule" : "Needs review", color: moment.readyToSchedule ? .blue : .orange, icon: moment.readyToSchedule ? "clock" : "exclamationmark.circle.fill")
                        Text(moment.readyToSchedule ? "Message approved · choose delivery" : moment.latest == nil ? "Create a personal wish" : "Message draft ready").font(.caption).foregroundStyle(.secondary)
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
    let onManage: () -> Void
    let group: MomentDisplayGroup
    var body: some View {
        if let moment = group.moments.first {
            MomentCard {
                HStack(alignment: .top, spacing: 14) {
                    MomentIconTile(type: moment.type, title: moment.title)
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment:.top,spacing:8) {
                            Text(moment.title).font(.title3.bold()).frame(maxWidth:.infinity,alignment:.leading)
                            Button(action:onManage) {
                                Image(systemName:"gearshape").font(.title3).frame(width:44,height:44)
                            }.buttonStyle(.plain).foregroundStyle(Color.nexdoIndigo)
                                .accessibilityLabel("Manage \(moment.title)")
                                .accessibilityIdentifier("festival-manage-\(moment.id)")
                        }
                        Text("\(moment.typeLabel) · \(MomentDates.relative(moment.nextOccurrence, zone: moment.timeZoneID))")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Text(MomentDates.sendDayLabel(MomentDates.date(moment.nextOccurrence,zone:moment.timeZoneID),zone:moment.timeZoneID))
                            .font(.subheadline).foregroundStyle(.secondary)
                            .fixedSize(horizontal:false,vertical:true)
                            .accessibilityIdentifier("festival-date-\(moment.id)")
                        let scheduledPlans = group.moments.filter(\.enabled).compactMap(\.upcomingDelivery)
                        let review = group.moments.filter(\.needsWishReview).count
                        let ready = group.moments.filter(\.readyToSchedule).count
                        let active = group.moments.filter(\.enabled).count
                        if review > 0 {
                            MomentStatusBadge(title: review == active ? "Needs review" : "\(review) wish\(review == 1 ? " needs" : "es need") review", color: .orange, icon: "exclamationmark.circle.fill")
                        }
                        if ready > 0 {
                            MomentStatusBadge(title: ready == active ? "Ready to schedule" : "\(ready) ready to schedule",color:.blue,icon:"clock")
                        }
                        ForEach(MomentScheduleSummary.labels(plans:scheduledPlans),id:\.self) { label in
                            MomentStatusBadge(title:label,color:.blue,icon:"clock")
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture(perform:onManage)
            .accessibilityAction(named:Text("Manage moment"),onManage)
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
    @ScaledMetric(relativeTo:.subheadline) private var summaryActionFontSize:CGFloat = 18
    @EnvironmentObject private var store: ImportantMomentsStore
    @State private var tab = "Upcoming"
    @State private var search = ""
    @State private var filter = "All"
    @State private var deliveryFilter = "All"
    @State private var upcomingFilter:MomentUpcomingFilter = .today
    @State private var managingMoments = false
    @State private var creatingMoment = false
    @State private var managingFestival: MomentDisplayGroup?
    private var displayed: [ImportantMoment] { store.moments.filter { (tab == "Sent" || !$0.isArchived) && (tab != "Upcoming" || $0.nextOccurrence >= MomentDates.day(Date(), zone: $0.timeZoneID)) && (filter == "All" || $0.type == (filter == "Get Well Soon" ? "getWellSoon" : filter.lowercased())) && (search.isEmpty || $0.title.localizedCaseInsensitiveContains(search)) }.sorted { $0.nextOccurrence < $1.nextOccurrence } }
    var body: some View {
        ZStack { TodayBackdrop(); ScrollView { VStack(spacing: 16) {
            MomentSegments(options: ["Upcoming", "Scheduled", "Sent"], selection: $tab)
            HStack {
                TextField("Search moments", text: $search).textFieldStyle(.roundedBorder)
                Picker("Type", selection: $filter) { ForEach(["All","Birthday","Anniversary","Festival","Get Well Soon","Custom"], id: \.self) { Text($0) } }.labelsHidden().accessibilityLabel("Filter moment type")
            }
            if tab == "Upcoming" {
                MomentCard {
                    HStack(spacing: 16) {
                        MomentIconTile(type: "summary")
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(MomentDisplayGroup.groups(displayed.filter(\.enabled)).count) upcoming moment\(MomentDisplayGroup.groups(displayed.filter(\.enabled)).count == 1 ? "" : "s")").font(.title3.bold())
                            let scheduled = displayed.filter { $0.enabled && $0.upcomingDelivery != nil }.count
                            let review = displayed.filter(\.needsWishReview).count
                            let ready = displayed.filter(\.readyToSchedule).count
                            Text("\(scheduled) wish\(scheduled == 1 ? "" : "es") scheduled")
                                .font(.subheadline).foregroundStyle(.secondary)
                            Text("\(review) wish\(review == 1 ? " needs" : "es need") review")
                                .font(.subheadline).foregroundStyle(.secondary)
                            if ready > 0 {Text("\(ready) ready to schedule").font(.subheadline).foregroundStyle(.secondary)}
                            HStack(spacing:20) {
                                Button { managingMoments = true } label: {
                                    Text("Manage").frame(minHeight:44)
                                }.accessibilityIdentifier("moments-manage")
                                Button { creatingMoment = true } label: {
                                    Text("Create New").frame(minHeight:44)
                                }.accessibilityIdentifier("moments-create-new")
                            }.font(.system(size:summaryActionFontSize,weight:.semibold)).foregroundStyle(Color.nexdoIndigo)
                                .lineLimit(1)

                        }
                        Spacer(minLength: 0)
                    }
                }
                ScrollView(.horizontal,showsIndicators:false) {
                    HStack(spacing:8) {
                        ForEach(MomentUpcomingFilter.allCases,id:\.self) { period in
                            Button { upcomingFilter=period } label: {
                                Text(period.rawValue).font(.subheadline.bold()).padding(.horizontal,16).frame(minHeight:44)
                                    .foregroundStyle(upcomingFilter == period ? .white : Color.nexdoIndigo)
                                    .background {
                                        Capsule().fill(upcomingFilter == period ? Color.nexdoIndigo : Color.nexdoIndigo.opacity(0.08))
                                    }
                            }.buttonStyle(.plain)
                                .accessibilityAddTraits(upcomingFilter == period ? .isSelected : [])
                                .accessibilityIdentifier("moments-period-"+period.rawValue)
                        }
                    }
                }
                let items=displayed.filter { upcomingFilter.includes(day:$0.nextOccurrence,zone:$0.timeZoneID) }
                ForEach(MomentDisplayGroup.groups(items)) { entry in
                    if entry.moments.first?.supportsGreetingCard == true {
                        FestivalGroupCard(onManage:{managingFestival=entry},group:entry)
                    } else if let moment=entry.moments.first {
                        UpcomingMomentRow(moment:moment)
                    }
                }
                if items.isEmpty {
                    ContentUnavailableView("No moments \(upcomingFilter == .later ? "later" : upcomingFilter.rawValue.lowercased())",systemImage:"gift",description:Text("Choose another date filter or add a moment."))
                }
            } else {
                if tab == "Scheduled" { Picker("Delivery", selection: $deliveryFilter) { ForEach(["All","Automatic","Confirmation","Action needed"], id: \.self) { Text($0) } } }
                let visiblePlans = store.plans.filter { p in
                    let matches = displayed.contains { $0.drafts.contains { $0.id == p.draftID } }
                    let history = ["SENT","COPIED","SHARED"].contains(p.status)
                    return matches && (tab == "Sent" ? history : !history && p.status != "CANCELLED") && (deliveryFilter == "All" || tab == "Sent" || deliveryFilter == "Automatic" && p.automaticDelivery || deliveryFilter == "Confirmation" && !p.automaticDelivery || deliveryFilter == "Action needed" && ["FAILED","UNCERTAIN","EXPIRED"].contains(p.status))
                }
                if visiblePlans.isEmpty {
                    ContentUnavailableView(tab == "Sent" ? "No sent wishes yet" : "No scheduled wishes", systemImage: tab == "Sent" ? "paperplane" : "calendar", description: Text("Wishes matching your filters will appear here."))
                }
                ForEach(visiblePlans) { plan in NavigationLink { WishPlanView(plan: plan) } label: {
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
            if let error = store.error { Text(error).foregroundStyle(.red); Button("Retry") { Task { await store.refresh() } } }
            if store.loading { ProgressView() }
            if let synced = store.lastSynced { Text("Updated \(synced.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(.secondary) }
            Button { creatingMoment = true } label: { Label("Add Moment", systemImage: "plus").font(.headline).frame(maxWidth: .infinity, minHeight: 52) }.buttonStyle(.borderedProminent)
        }.padding(18) } }
        .navigationDestination(isPresented: $creatingMoment) {
            MomentEditor(onDone: { creatingMoment = false })
        }
        .navigationDestination(isPresented:$managingMoments) {
            MomentsManagementEntry(onDone:{managingMoments=false})
        }
        .navigationDestination(isPresented:Binding(get:{managingFestival != nil},set:{if !$0{managingFestival=nil}})) {
            if let group=managingFestival {ManageFestivalView(group:group,store:store,onDone:{managingFestival=nil})}
        }
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
    @State private var wishGeneration = WishGenerationGate()
    @FocusState private var editing: Bool
    var body: some View {
        ZStack { TodayBackdrop(); ScrollView { VStack(spacing: 16) {
            MomentCard {
                Label(moment.firstName.isEmpty ? moment.title : moment.firstName, systemImage: moment.icon).font(.title2.bold())
                if moment.type == "festival" {
                    Text("Festival: \(moment.title)").foregroundStyle(.secondary)
                    Text(moment.nextOccurrence).foregroundStyle(.secondary)
                } else {
                    Text("\(moment.typeLabel) · \(moment.nextOccurrence)").foregroundStyle(.secondary)
                }
            }
            MomentCard {
                Label("Choose a tone", systemImage: "sparkles").font(.title2.bold()); Text("Adjust the vibe of your message.").foregroundStyle(.secondary)
                MomentSegments(options: ["Warm", "Personal", "Short", "Fun"], selection: $tone).disabled(generating)
                DisclosureGroup("Personalize with AI") {
                TextField("Personal context (optional)", text: $personalContext, axis: .vertical).textFieldStyle(.roundedBorder)
                Toggle("Use AI to draft my wish", isOn: $aiConsent).disabled(generating)
                Text("Only the first name, event type, tone, and context you enter are shared with OpenAI. You review every draft.").font(.caption).foregroundStyle(.secondary)
                }
            }
            MomentCard {
                Label("Message preview", systemImage: "doc.text").font(.title2.bold()); Text("Review and make any changes.").foregroundStyle(.secondary)
                TextEditor(text: $bodyText).frame(minHeight: 145).scrollContentBackground(.hidden).focused($editing).padding(8).background(.background.opacity(0.65), in: RoundedRectangle(cornerRadius: 14)).disabled(generating).opacity(generating ? 0.45 : 1).accessibilityLabel("Wish message")
                Text("\(bodyText.count)/500").frame(maxWidth: .infinity, alignment: .trailing).foregroundStyle(bodyText.count > 500 ? .red : .secondary)
                HStack { Button { generate() } label: { WishRegenerateLabel(title: "Try another", generating: generating) }.disabled(generating).accessibilityIdentifier("wish-regenerate"); Spacer(); Button("Edit", systemImage: "pencil") { editing = true }.disabled(generating) }.buttonStyle(.bordered)
            }
            if moment.supportsGreetingCard {MomentGreetingCardSection(moment:moment,store:store,greeting:bodyText){bodyText=$0}}
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
    private var generating: Bool { wishGeneration.isGenerating }
    private func generate() {
        guard !generating else { return }
        Task { await wishGeneration.run { await store.perform {
            struct Input: Encodable { let momentID, tone, personalContext: String; let aiConsent: Bool }
            struct Result: Decodable, Sendable { let draft: WishDraft; let usedAI: Bool }
            let input = Input(momentID: moment.id, tone: tone, personalContext: personalContext, aiConsent: aiConsent)
            let result: Result = try await wishGeneration.withTimeout { try await store.request("generate", input) }
            draft = result.draft; bodyText = result.draft.body
        } } }
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
    @State private var now = Date()
    var body: some View {
        ZStack { TodayBackdrop(); ScrollView { VStack(alignment: .leading, spacing: 18) {
            MomentCard { Label(moment.title, systemImage: moment.icon).font(.title2.bold()); Text(moment.nextOccurrence) }
            Text("Delivery method").font(.title.bold())
            MomentCard { Label(channel.capitalized, systemImage: channel == "email" ? "envelope.fill" : "message.fill").font(.headline); Text(recipient); Text(channel == "messages" ? "You tap Send at the scheduled time" : store.snapshot?.emailAccount?.email ?? "Connect email in Settings").foregroundStyle(.secondary) }
            Text("Send date & time").font(.title.bold())
            MomentCard {
                DatePicker("Date and time", selection: $date, in: Date()...).environment(\.timeZone, TimeZone(identifier: zone) ?? .current)
                Picker("Time zone", selection: $zone) { ForEach(TimeZone.knownTimeZoneIdentifiers, id: \.self) { Text($0).tag($0) } }
            }
            MomentCard {
                if channel == "email" {
                    Toggle("Send automatically", isOn: $automatic).disabled(store.snapshot?.automaticEmailEnabled != true)
                    if store.snapshot?.automaticEmailEnabled != true { Text("Automatic delivery needs a connected email account and the server scheduler.").font(.caption) }
                } else { Text("We’ll remind you, the sender, to open the prepared wish and tap Send in Messages. Recipients do not need to confirm. Nexdo does not send Messages automatically.") }
                Toggle("Notify me 1 hour before", isOn: $warning)
                Toggle("Repeat yearly", isOn: $yearly)
                if !automatic { Text("For yearly Messages wishes, you must tap Send each year. Reopen Nexdo to refresh local reminders.").font(.caption).foregroundStyle(.secondary) }
            }
            MomentCard { Text("Approved message").font(.headline); Text(draft.body); Text("Go back to Review Wish to change the message.").font(.caption) }
            Text("Allow notifications to receive reminders. Email delivery runs on the server even when Nexdo is closed.").font(.caption).foregroundStyle(.secondary)
            if let error = store.error { Text(error).foregroundStyle(.red) }
            MomentPrimary(title: automatic ? "Schedule Automatic Send" : "Schedule Reminder") {
                guard date > Date() else {store.error="Choose a future time.";return}
                Task { await store.perform {
                    if !automatic || warning { try await store.authorizeNotifications() }
                    let response: WishPlanResponse = try await store.request("schedule", WishScheduleInput(draftID: draft.id, channel: channel, recipient: recipient, scheduledAtUTC: ISO8601DateFormatter().string(from: date), timeZoneID: zone, automaticDelivery: automatic, reminderOffset: warning ? 60 : 0, repeatYearly: yearly, idempotencyKey: key))
                    saved = response.plan; next = true
                } }
            }.disabled(store.busy || saved != nil || date <= now)
        }.padding(18) } }
        .onReceive(Timer.publish(every:1,on:.main,in:.common).autoconnect()) { now=$0 }
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
            Text(current.status == "SENT" ? "Your wish was submitted successfully." : current.status == "CANCELLED" ? "This wish will not be sent." : current.automaticDelivery && current.status == "SCHEDULED" ? "Approved email will send automatically at the scheduled time." : current.status == "AWAITING_CONFIRMATION" && current.channel == "messages" ? "Your wish and schedule are saved. Open Messages and tap Send when you are ready; Messages wishes are not sent automatically." : "Review the delivery status below.").multilineTextAlignment(.center)
            MomentCard {
                Text(current.subject).font(.title2.bold())
                Label(current.recipient,systemImage:current.channel == "messages" ? "phone.fill" : current.channel == "email" ? "envelope.fill" : "person.fill")
                Divider(); LabeledContent("Delivery", value: current.channel.capitalized)
                LabeledContent("Send time", value: MomentDates.label(current.date, zone: current.timeZoneID))
                LabeledContent("Time zone", value: current.timeZoneID)
                LabeledContent("Reminder", value: current.reminderOffset == 60 ? "1 hour before" : "At scheduled time")
                LabeledContent("Repeat", value: current.repeatYearly ? "Yearly" : "Once")
                Text(current.body).padding(.top, 8)
                if current.status == "EXPIRED" {
                    Text("This wish expired 24 hours after its scheduled send time because delivery was not confirmed. Create a new wish to send it.").foregroundStyle(.red)
                } else if let error = current.lastError { Text(error).foregroundStyle(.red) }
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
                    } else if moment.supportsGreetingCard, let group = MomentDisplayGroup.editableGroups(store.moments.filter { $0.type == moment.type }).first(where: { $0.moments.contains { $0.id == moment.id } }) {
                        ManageFestivalView(group: group, store: store,onDone:{showingDetail=false})
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

/// Regenerate / Try another; while a wish is being written it shows a spinner and "Writing your wish…".
struct WishRegenerateLabel: View {
    let title: String
    let generating: Bool
    var body: some View {
        if generating { HStack(spacing: 8) { ProgressView(); Text(WishGenerationGate.progressLabel) } }
        else { Label(title, systemImage: "sparkles") }
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
