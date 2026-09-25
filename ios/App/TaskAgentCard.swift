import SwiftUI
import MessageUI

struct TaskAgentCard: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject private var actionCoordinator = TaskActionCoordinator.shared
    let taskID: String
    @FocusState.Binding var focusedField: TaskDetailsView.Field?
    var onResearchAvailable: (Bool) -> Void = { _ in }
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var eligible = false
    @State private var fallbackReason: String?
    @State private var run: TaskAgentRun?
    @State private var answer = ""
    @State private var showingSearchNotices = false
    @State private var selectedBusiness: String?
    @State private var draftExpanded: Set<String> = []
    @State private var businessTabs: [String: Int] = [:]
    @State private var expandedReviews: Set<String> = []
    @State private var drafts: [String: String] = [:]
    @State private var busy = false
    @State private var searchRequestPending = false
    @State private var error: String?
    @State private var loading = true
    @State private var refreshID = 0
    @State private var messageDraft: BusinessMessageDraft?
    @State private var messageNotice: String?
    private struct BusinessMessageDraft: Identifiable {
        let id = UUID()
        let phone: String
        let body: String
    }
    private var label: String {
        switch run?.status {
        case "NEEDS_INPUT": "One detail before I start"
        case "QUEUED": "Research queued"
        case "RUNNING": "NexDo is working on this"
        case "PAUSED": "Research paused"
        case "BLOCKED": "Search connections needed"
        case "READY_FOR_REVIEW": "Shortlist and drafts ready"
        case "NO_RESULTS": "No matching providers found"
        case "CANCELLED": "Research cancelled"
        default: "Research needs a retry"
        }
    }
    private var findingBusinesses: Bool {
        searchRequestPending || (error == nil && ["QUEUED", "RUNNING"].contains(run?.status ?? ""))
    }
    private var searchProgress: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large).tint(Color.nexdoIndigo)
            Text("Finding the best business near your place…")
                .font(.subheadline.weight(.semibold)).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 24)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
    var body: some View {
        // Keep a concrete view mounted before the first response so its task always runs.
        VStack(alignment: .leading, spacing: 12) {
            if let run {
                VStack(alignment: .leading, spacing: 12) {
                    assistantHeader(run)
                    if run.candidates.isEmpty { Divider().overlay(Color.nexdoIndigo.opacity(0.08)) }
                    if findingBusinesses { searchProgress }
                    if !findingBusinesses, let question = run.question, !["urgency", "preferences"].contains(question.key) {
                        Text(question.key == "urgency" ? "Ready to search nearby businesses" : question.text).font(.system(size: 16, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                        if question.key == "discovery" {
                            HStack { Button("Find a professional") { act("answer", key: "discovery", answer: "yes") }; Spacer(); Button("Keep as a task") { act("cancel") } }
                        } else {
                            HStack(spacing: 12) {
                                Image(systemName: "mappin.circle.fill").font(.title2).foregroundStyle(Color.purple)
                                    .frame(width: 36, height: 36).background(Color.purple.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                                TextField("City or ZIP code", text: $answer).submitLabel(.done)
                                    .focused($focusedField, equals: .agentLocation)
                                    .onSubmit { focusedField = nil }
                                    .accessibilityLabel("City or ZIP code")
                            }.padding(8).background(.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.purple.opacity(0.65)))
                                .id(TaskDetailsView.Field.agentLocation)
                            Button { act("search", key: "location", answer: answer) } label: {
                                HStack(spacing: 12) { Image(systemName: "magnifyingglass"); Text(run.service == "plumber" ? "Search Plumbers" : "Search businesses"); Image(systemName: "arrow.right") }
                            }.buttonStyle(AgentSearchButton()).disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                        if question.key == "location", !run.slots.location.isEmpty { Button("Use \(run.slots.location)") { act("search", key: "location", answer: run.slots.location) } }
                    }
                    if run.candidates.isEmpty && !findingBusinesses { searchIntroduction(run) }
                    if !findingBusinesses, let question = run.question, ["urgency", "preferences"].contains(question.key) {
                        if error == nil { searchProgress }
                        else { Button("Retry search") { act("search", answer: run.slots.location) }.buttonStyle(AgentSearchButton()) }
                    }
                    if let message = run.error { Text(message).font(.caption) }
                    ForEach(run.warnings.filter { !$0.hasPrefix("Yelp is not connected.") && !isSearchNotice($0) }, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
                    ForEach(Array(run.candidates.enumerated()), id: \.element.id) { index, candidate in
                        businessCard(candidate, index: index)
                    }

                    HStack {
                        if ["QUEUED", "RUNNING"].contains(run.status) { Button("Pause") { act("pause") } }
                        if ["PAUSED", "FAILED", "BLOCKED"].contains(run.status) { Button(run.status == "PAUSED" ? "Resume" : "Retry") { act(run.status == "PAUSED" ? "resume" : "retry") } }
                        if !["CANCELLED", "READY_FOR_REVIEW", "NO_RESULTS"].contains(run.status) { Button { act("cancel") } label: { Label("Cancel search", systemImage: "xmark").foregroundStyle(Color.nexdoSecondary) } }
                    }
                    if let error { Text(error).font(.caption).accessibilityAddTraits(.updatesFrequently) }
                }.padding(run.candidates.isEmpty ? 18 : 0).background(LinearGradient(colors: [Color(red: 0.95, green: 0.92, blue: 1), Color(red: 0.92, green: 0.94, blue: 1), Color(red: 0.97, green: 0.98, blue: 1)], startPoint: .topLeading, endPoint: .bottomTrailing).opacity(run.candidates.isEmpty ? 1 : 0), in: RoundedRectangle(cornerRadius: 20))
                    .shadow(color: Color.nexdoIndigo.opacity(0.05), radius: 12, y: 5).disabled(busy)
            } else if eligible {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Find local businesses", systemImage: "magnifyingglass").font(.headline)
                    Text("Google Places can find providers with phone numbers, addresses, ratings and quote-request drafts. Confirm your city to begin.").font(.subheadline)
                    Button("Find businesses") { act("prepare") }.disabled(busy)
                    if let error { Text(error).font(.caption) }
                }.padding(16).background(Color.nexdoIndigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
            } else if loading {
                searchProgress
            } else if let error {
                Text(error).font(.caption)
                Button("Retry business search") { refreshID += 1 }
            }
            else if let fallbackReason { Text(fallbackReason).font(.subheadline).foregroundStyle(.secondary) }
        }
        .tint(Color.nexdoIndigo)
        .onDisappear { NotificationCenter.default.post(name: .taskAgentChanged, object: taskID) }
        .sheet(item: $messageDraft) { draft in
            ActionMessageComposer(recipient: draft.phone, body: draft.body) { result in
                messageDraft = nil
                switch result {
                case .submitted: messageNotice = "Message submitted to Messages. Delivery is not confirmed."
                case .failed: messageNotice = "Messages could not send the message. Your draft is still available."
                case .cancelled, .saved: break
                }
            }.ignoresSafeArea().interactiveDismissDisabled()
        }
        .alert("Messages", isPresented: Binding(get: { messageNotice != nil }, set: { if !$0 { messageNotice = nil } })) {
            Button("OK", role: .cancel) { messageNotice = nil }
        } message: { Text(messageNotice ?? "") }
        .task(id: taskID + (run?.status ?? "") + String(refreshID)) {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-agent-design-preview") {
                let data = Data(#"{"id":"preview","status":"NEEDS_INPUT","version":0,"service":"plumber","urgency":"unknown","slots":{"location":"","budget":"","constraints":""},"steps":[],"candidates":[],"warnings":[],"question":{"key":"location","text":"Which city or ZIP code should I search?"}}"#.utf8)
                var previewData = data
                if ProcessInfo.processInfo.arguments.contains("-business-results-preview") { previewData = Data(Self.businessPreview.utf8) }
                run = try? JSONDecoder().decode(TaskAgentRun.self, from: previewData)
                selectedBusiness = run?.candidates.first?.id
                loading = false
                onResearchAvailable(true)
                return
            }
            #endif
            loading = run == nil && !eligible
            while !Task.isCancelled {
                do {
                    var response = try await model.loadTaskAgent(taskID: taskID)
                    // Resume tasks left at the retired optional-question step.
                    if !busy, let pending = response.run, pending.status == "NEEDS_INPUT",
                       let question = pending.question, ["urgency", "preferences"].contains(question.key),
                       !pending.slots.location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        response = try await model.updateTaskAgent(taskID: taskID, action: "search", version: pending.version, key: nil, answer: pending.slots.location, budget: "", constraints: "", candidateID: nil)
                    }
                    guard !Task.isCancelled else { return }
                    if !busy {
                        if (run?.candidates ?? []).isEmpty, let first = response.run?.candidates.first { selectedBusiness = response.run?.candidates.first(where: { $0.id == actionCoordinator.action(for: taskID)?.businessCandidateID })?.id ?? first.id }
                        run = response.run
                        eligible = response.intent?.eligible == true
                        onResearchAvailable(eligible || run != nil)
                        fallbackReason = ["PROCUREMENT", "RESEARCH", "LOGISTICS"].contains(response.intent?.category ?? "") ? response.intent?.reason : nil
                        error = nil
                    }
                    loading = false
                } catch {
                    guard !Task.isCancelled else { return }
                    loading = false
                    self.error = "Could not refresh task research. \(error.localizedDescription)"
                    return
                }
                guard let run, ["QUEUED", "RUNNING"].contains(run.status) else { return }
                do { try await Task.sleep(for: .seconds(4)) } catch { return }
            }
        }
    }
    private let businessPurple = Color(red: 0.34, green: 0.08, blue: 1)
    private let businessWash = Color(red: 0.96, green: 0.95, blue: 1)

    private func businessCard(_ candidate: TaskAgentRun.Candidate, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Button {
                focusedField = nil
                selectedBusiness = selectedBusiness == candidate.id ? nil : candidate.id
            } label: {
                HStack(alignment: .center, spacing: 12) {
                    Text("\(index + 1)").font(.title3.bold()).foregroundStyle(businessPurple)
                        .frame(width: 34, height: 34).background(Color(red: 0.93, green: 0.90, blue: 1), in: Circle())
                    VStack(alignment: .leading, spacing: 6) {
                        Text(candidate.name).font(.headline).foregroundStyle(Color.nexdoInk)
                            .fixedSize(horizontal: false, vertical: true)
                        ratingSummary(candidate)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: selectedBusiness == candidate.id ? "chevron.up" : "chevron.right")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Color.nexdoInk)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityHint("Expand or collapse business details")
            if selectedBusiness == candidate.id {
                if index == 0 {
                    Label("Most reviewed", systemImage: "trophy.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(Color(red: 0, green: 0.55, blue: 0.30))
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Color.green.opacity(0.09), in: Capsule())
                }
                businessDetails(candidate)
            }
        }.padding(16).background(.white, in: RoundedRectangle(cornerRadius: 22))
            .shadow(color: Color.nexdoIndigo.opacity(0.07), radius: 12, y: 5)
    }

    private func ratingSummary(_ candidate: TaskAgentRun.Candidate) -> some View {
        let evidence = candidate.evidence.first { $0.source == "Google" } ?? candidate.evidence.first
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 5) {
                Text(evidence?.rating.map { String(format: "%.1f", $0) } ?? "Not rated")
                if let rating = evidence?.rating {
                    HStack(spacing: 1) {
                        ForEach(0..<5) { i in
                            Image(systemName: rating >= Double(i + 1) ? "star.fill" : rating > Double(i) ? "star.leadinghalf.filled" : "star")
                        }
                    }.foregroundStyle(.orange).font(.system(size: 10))
                }
                Text(evidence?.reviews.map { "(\($0.formatted()) reviews)" } ?? "Reviews unavailable").foregroundStyle(Color.nexdoSecondary)
            }
            Text("\(evidence?.rating.map { String(format: "%.1f ★", $0) } ?? "Not rated") · \(evidence?.reviews.map { "\($0.formatted()) reviews" } ?? "Reviews unavailable")")
        }.font(.caption).foregroundStyle(Color.nexdoInk)
    }

    private func businessDetails(_ candidate: TaskAgentRun.Candidate) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            let tabs = ["Business info", "Reviews", "Services"]
            let icons = ["storefront", "star.fill", "wrench.and.screwdriver"]
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 4)) : AnyLayout(HStackLayout(spacing: 2))
            layout {
                ForEach(0..<3) { tab in
                    Button {
                        focusedField = nil
                        businessTabs[candidate.id] = tab
                    } label: {
                        Label(tabs[tab], systemImage: icons[tab])
                            .font(.system(size: 11, weight: .semibold))
                            .frame(maxWidth: .infinity, minHeight: 38)
                            .foregroundStyle((businessTabs[candidate.id] ?? 0) == tab ? businessPurple : Color.nexdoSecondary)
                            .background((businessTabs[candidate.id] ?? 0) == tab ? Color.white : Color.clear, in: Capsule())
                    }.buttonStyle(.plain)
                        .accessibilityAddTraits((businessTabs[candidate.id] ?? 0) == tab ? .isSelected : [])
                }
            }.padding(4).background(businessWash, in: RoundedRectangle(cornerRadius: 18))
            switch businessTabs[candidate.id] ?? 0 {
            case 1: businessReviews(candidate)
            case 2:
                VStack(alignment: .leading, spacing: 10) {
                    Label(run?.service.capitalized ?? "Local services", systemImage: "wrench.and.screwdriver")
                        .font(.headline).foregroundStyle(businessPurple)
                    Text(candidate.reason).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    Text("Ask the business to confirm the services, pricing, and availability for your request.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    if let website = candidate.website, let url = URL(string: website), url.scheme == "https" {
                        Link("Explore services on website ↗", destination: url).font(.subheadline.weight(.semibold))
                    }
                }
            default: businessContact(candidate)
            }
            ForEach(Array((candidate.attributions ?? []).enumerated()), id: \.offset) { _, attribution in
                if let link = attribution.url, let url = URL(string: link) { Link(attribution.provider, destination: url).font(.caption) }
                else { Text(attribution.provider).font(.caption) }
            }
            if let action = actionCoordinator.action(for: taskID) {
                Button {
                    actionCoordinator.update(action.id) {
                        $0.businessCandidateID = candidate.id
                        $0.contactIdentifier = nil
                        $0.manualRecipient = nil
                    }
                } label: {
                    Label(action.businessCandidateID == candidate.id ? "Selected for this task" : "Choose this business", systemImage: action.businessCandidateID == candidate.id ? "checkmark.circle.fill" : "checkmark.circle")
                }.buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("business.select.\(candidate.id)")
            }
            Divider().overlay(businessPurple.opacity(0.06))
            outreachSection(candidate)
        }.tint(businessPurple)
    }

    private func businessContact(_ candidate: TaskAgentRun.Candidate) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
            layout {
                Label(candidate.address.isEmpty ? "Address unavailable" : candidate.address, systemImage: "mappin.circle.fill")
                    .font(.subheadline).foregroundStyle(Color.nexdoInk).frame(maxWidth: .infinity, alignment: .leading)
                if let evidence = candidate.evidence.first(where: { $0.source == "Google" }), let url = URL(string: evidence.url) {
                    Link(destination: url) {
                        VStack(spacing: 5) {
                            Image(systemName: "map.fill").font(.system(size: 30)).foregroundStyle(Color.mint.opacity(0.7))
                                .overlay { Image(systemName: "mappin.circle.fill").font(.title2).foregroundStyle(businessPurple).offset(y: -6) }
                            Label("Open in Maps", systemImage: "arrow.up.right.square").font(.system(size: 10, weight: .semibold))
                        }.frame(width: 112, height: 82)
                            .background(LinearGradient(colors: [Color.mint.opacity(0.12), businessWash], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 14))
                    }.accessibilityLabel("Open \(candidate.name) in Google Maps")
                }
            }
            HStack(spacing: 10) {
                Image(systemName: "phone.fill").foregroundStyle(businessPurple)
                Text(candidate.phone.isEmpty ? "Phone unavailable" : candidate.phone).font(.subheadline)
                Spacer(minLength: 0)
                if !candidate.phone.isEmpty {
                    Button { UIPasteboard.general.string = candidate.phone; error = "Phone number copied." } label: { Label("Copy", systemImage: "doc.on.doc") }
                        .buttonStyle(BusinessCompactButton())
                }
            }
            if let website = candidate.website, let url = URL(string: website), url.scheme == "https" {
                HStack {
                    Label("Website", systemImage: "globe").font(.subheadline)
                    Spacer()
                    Link(destination: url) { Label("Open", systemImage: "arrow.up.right.square") }.buttonStyle(BusinessCompactButton())
                }
            }
        }.padding(.top, 4)
    }

    private func outreachSection(_ candidate: TaskAgentRun.Candidate) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            DisclosureGroup(isExpanded: Binding(get: { draftExpanded.contains(candidate.id) }, set: { expanded in
                focusedField = nil
                if expanded { draftExpanded.insert(candidate.id) } else { draftExpanded.remove(candidate.id) }
            })) {
                TextField("Write your message", text: Binding(get: { drafts[candidate.id] ?? candidate.draft }, set: { drafts[candidate.id] = String($0.prefix(2000)) }), axis: .vertical)
                    .font(.body)
                    .lineLimit(5...)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .background(.white, in: RoundedRectangle(cornerRadius: 12))
                    .focused($focusedField, equals: .agentDraft(candidate.id))
                    .id(TaskDetailsView.Field.agentDraft(candidate.id))
                    .accessibilityLabel("Draft for \(candidate.name)")
                HStack {
                    Button("Save draft") { focusedField = nil; act("saveDraft", answer: drafts[candidate.id] ?? candidate.draft, candidateID: candidate.id) }
                    Spacer()
                    Button("Copy draft") { focusedField = nil; UIPasteboard.general.string = drafts[candidate.id] ?? candidate.draft; error = "Draft copied." }
                }.font(.subheadline)
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "doc.text").font(.title2).foregroundStyle(businessPurple)
                        .frame(width: 38, height: 42).background(businessPurple.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Review or edit outreach draft").font(.subheadline.weight(.semibold)).foregroundStyle(Color.nexdoInk)
                        Text("Your message is ready to personalize.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    }
                }
            }.padding(12).background(businessWash, in: RoundedRectangle(cornerRadius: 16))
            Button {
                focusedField = nil
                guard MFMessageComposeViewController.canSendText() else {
                    messageNotice = "Messages is not available on this device. You can copy the draft and phone number instead."
                    return
                }
                messageDraft = BusinessMessageDraft(phone: candidate.phone, body: drafts[candidate.id] ?? candidate.draft)
            } label: {
                HStack(spacing: 10) { Image(systemName: "message.fill"); Text("Open in Messages"); Image(systemName: "chevron.right").font(.caption.bold()) }
            }.buttonStyle(AgentSearchButton())
                .disabled(candidate.phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (drafts[candidate.id] ?? candidate.draft).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Label("Review the number and message, then tap Send. Some business numbers cannot receive texts.", systemImage: "info.circle")
                .font(.caption).foregroundStyle(Color.nexdoSecondary).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func businessReviews(_ candidate: TaskAgentRun.Candidate) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if candidate.googlePlaceId != nil {
                Text("Google Maps").font(.system(size: 14)).foregroundStyle(Color(red: 0.37, green: 0.37, blue: 0.37))
                Text("Customer feedback · Limited selection, newest first.").font(.caption)
                if (candidate.feedback ?? []).isEmpty { Text("No written reviews available.").font(.caption) }
                ForEach(candidate.feedback ?? [], id: \.url) { review in
                    let reviewID = candidate.id + review.url
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            if let photo = review.photoUrl, let url = URL(string: photo) { AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { Color.clear }.frame(width: 32, height: 32).clipShape(Circle()) }
                            if let profile = review.authorUrl, let url = URL(string: profile) { Link(review.author, destination: url) } else { Text(review.author) }
                        }
                        Text("\(review.rating.map { String(format: "%.0f", $0) } ?? "—")/5 · \(review.published)").font(.caption)
                        Text(review.text).font(.subheadline)
                            .lineLimit(expandedReviews.contains(reviewID) ? nil : 3)
                        if !review.text.isEmpty {
                            Button(expandedReviews.contains(reviewID) ? "Show less" : "Show more") {
                                if expandedReviews.contains(reviewID) { expandedReviews.remove(reviewID) }
                                else { expandedReviews.insert(reviewID) }
                            }
                            .font(.subheadline.weight(.semibold))
                            .accessibilityLabel("\(expandedReviews.contains(reviewID) ? "Show less" : "Show more") of \(review.author)’s review")
                            .accessibilityValue(expandedReviews.contains(reviewID) ? "Expanded" : "Collapsed")
                        }
                        if let url = URL(string: review.url) { Link("Read review on Google Maps", destination: url) }
                    }.padding(.vertical, 6)
                }
            }

            if candidate.googlePlaceId == nil { Text("No written reviews available.").font(.caption) }
        }
    }

    private func isSearchNotice(_ text: String) -> Bool {
        text.hasPrefix("Listings are not a license check") || text.hasPrefix("Some businesses were hidden")
    }

    private func searchTerms(_ run: TaskAgentRun) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Link("Search terms and privacy", destination: AppEnvironment.web("/places-policy"))
                    .font(.caption.weight(.semibold))
                Spacer()
                if run.warnings.contains(where: isSearchNotice) {
                    Button { showingSearchNotices.toggle() } label: {
                        Image(systemName: showingSearchNotices ? "minus.circle" : "plus.circle")
                            .font(.title3).frame(width: 44, height: 44)
                    }.buttonStyle(.plain)
                        .accessibilityLabel(showingSearchNotices ? "Hide search notices" : "Show search notices")
                        .accessibilityValue(showingSearchNotices ? "Expanded" : "Collapsed")
                }
            }.foregroundStyle(Color.nexdoIndigo)
            if showingSearchNotices {
                ForEach(run.warnings.filter(isSearchNotice), id: \.self) { notice in
                    Text(notice).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func resultsHeader(_ run: TaskAgentRun) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("AI ASSISTANT", systemImage: "sparkles")
                .font(.caption.weight(.bold)).tracking(1.2).foregroundStyle(businessPurple)
            (Text(run.service == "plumber" ? "I found some plumbers " : "I found some businesses ") + Text("near you").foregroundColor(businessPurple))
                .font(.title3.bold()).foregroundStyle(Color.nexdoInk).fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Here are the best options based on Google reviews, location, and services. You can view details, copy contact info, or open a draft message — all in one place.")
                        .font(.caption).foregroundStyle(Color.nexdoSecondary).fixedSize(horizontal: false, vertical: true)
                    Text("\(run.service.capitalized) · \(run.slots.location)").font(.caption.weight(.medium)).foregroundStyle(Color.nexdoInk)
                    searchTerms(run)
                }
                if !typeSize.isAccessibilitySize {
                    VStack(spacing: 0) {
                        Text("Businesses\nnear you!").font(.system(size: 11, weight: .medium, design: .rounded))
                            .multilineTextAlignment(.center).foregroundStyle(businessPurple).padding(10)
                            .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 22)).rotationEffect(.degrees(-10))
                        Image("business-search-hero").resizable().scaledToFit().frame(width: 105, height: 105).accessibilityHidden(true)
                    }.frame(width: 100)
                }
            }
        }.padding(16)
            .background(LinearGradient(colors: [Color(red: 0.95, green: 0.92, blue: 1), Color(red: 0.90, green: 0.94, blue: 1)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 20))
    }

    @ViewBuilder private func assistantHeader(_ run: TaskAgentRun) -> some View {
        if !run.candidates.isEmpty { resultsHeader(run) } else {
        VStack(alignment: .leading, spacing: 10) {
            Label("AI ASSISTANT", systemImage: "sparkles").font(.caption.weight(.bold)).tracking(2).foregroundStyle(Color.nexdoIndigo)
            Text(label).font(.system(size: 20, weight: .bold)).tracking(-0.6).fixedSize(horizontal: false, vertical: true)
            Text("\(run.service.prefix(1).uppercased() + run.service.dropFirst()) · \(run.slots.location.isEmpty ? "Location needed" : run.slots.location)").font(.subheadline)
        }
        }
    }

    private func searchIntroduction(_ run: TaskAgentRun) -> some View {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Search uses your city and service with Google Places (and Yelp when connected). NexDo never calls, messages, or shares your contact details with businesses. You review and send drafts yourself.")
                        .font(.system(size: 12)).foregroundStyle(Color.nexdoSecondary).fixedSize(horizontal: false, vertical: true)
                    searchTerms(run)
                    if run.urgency == "urgent" { Text("Urgent — prioritizing availability").font(.caption.weight(.semibold)) }
                }
                if !typeSize.isAccessibilitySize {
                    VStack(spacing: 0) {
                        Text("I’ll find the best options near you!").font(.system(size: 12, weight: .medium, design: .rounded)).multilineTextAlignment(.center)
                            .foregroundStyle(Color.nexdoIndigo).padding(10).background(.white.opacity(0.65), in: RoundedRectangle(cornerRadius: 20)).rotationEffect(.degrees(-8))
                        Image("agent-business-art").resizable().scaledToFit().frame(width: 94, height: 100).accessibilityHidden(true)
                    }.frame(width: 94)
                }
            }
    }

    #if DEBUG
    private static let businessPreview = #"{"id": "preview", "status": "READY_FOR_REVIEW", "version": 0, "service": "plumber", "urgency": "flexible", "slots": {"location": "94582", "budget": "", "constraints": ""}, "steps": [], "warnings": ["Listings are not a license check or a guarantee of availability. Confirm service area, budget and requirements before choosing.", "Some businesses were hidden because at least 20 Google reviews could not be verified. Try a new search for more options."], "candidates": [{"id": "0", "googlePlaceId": "preview-0", "name": "Chase Rooter & Plumbing Inc.", "address": "3494 Camino Tassajara #108, Danville, CA 94506, USA", "phone": "(925) 567-9000", "website": "https://example.com", "reason": "Confirm services, licensing, price, and availability with the business.", "draft": "Hello, I’m looking for plumbing services near 94582. Could you provide a quote and your earliest availability? Thank you.", "evidence": [{"source": "Google", "url": "https://maps.google.com", "rating": 5, "reviews": 2309}], "feedback": [{"author": "Sample reviewer", "url": "https://maps.google.com", "rating": 5, "published": "a month ago", "text": "Arrived on time and explained the repair clearly. The work was completed efficiently, and the area was left clean. I appreciated the careful attention to detail and helpful communication throughout the visit."}]}, {"id": "1", "googlePlaceId": "preview-1", "name": "United Plumbing & Water Heaters", "address": "3494 Camino Tassajara #108, Danville, CA 94506, USA", "phone": "(925) 567-9000", "website": "https://example.com", "reason": "Confirm services, licensing, price, and availability with the business.", "draft": "Hello, I’m looking for plumbing services near 94582. Could you provide a quote and your earliest availability? Thank you.", "evidence": [{"source": "Google", "url": "https://maps.google.com", "rating": 5, "reviews": 1403}], "feedback": [{"author": "Sample reviewer", "url": "https://maps.google.com", "rating": 5, "published": "a month ago", "text": "Arrived on time and explained the repair clearly. The work was completed efficiently, and the area was left clean. I appreciated the careful attention to detail and helpful communication throughout the visit."}]}, {"id": "2", "googlePlaceId": "preview-2", "name": "Dependable Plumbing Solutions", "address": "3494 Camino Tassajara #108, Danville, CA 94506, USA", "phone": "(925) 567-9000", "website": "https://example.com", "reason": "Confirm services, licensing, price, and availability with the business.", "draft": "Hello, I’m looking for plumbing services near 94582. Could you provide a quote and your earliest availability? Thank you.", "evidence": [{"source": "Google", "url": "https://maps.google.com", "rating": 4.8, "reviews": 361}], "feedback": [{"author": "Sample reviewer", "url": "https://maps.google.com", "rating": 5, "published": "a month ago", "text": "Arrived on time and explained the repair clearly. The work was completed efficiently, and the area was left clean. I appreciated the careful attention to detail and helpful communication throughout the visit."}]}]}"#
    #endif

    private func act(_ action: String, key: String? = nil, answer: String? = nil, candidateID: String? = nil) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-agent-design-preview") { return }
        #endif
        guard run != nil || action == "prepare" else { return }; busy = true
        searchRequestPending = ["search", "resume", "retry"].contains(action)
        if searchRequestPending { focusedField = nil; error = nil }
        Task {
            defer { busy = false; searchRequestPending = false }
            do { self.run = try await model.updateTaskAgent(taskID: taskID, action: action, version: run?.version ?? 0, key: key, answer: answer, budget: "", constraints: "", candidateID: candidateID).run; self.answer = ""; error = nil }
            catch { self.error = error.localizedDescription }
        }
    }
}

private struct AgentSearchButton: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.subheadline.weight(.semibold)).foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(LinearGradient(colors: [Color(red: 0.08, green: 0.22, blue: 1), Color(red: 0.36, green: 0.10, blue: 1), Color(red: 0.68, green: 0.03, blue: 1)], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 15))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.45)
    }
}

private struct BusinessCompactButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.caption.weight(.semibold)).foregroundStyle(Color(red: 0.34, green: 0.08, blue: 1))
            .padding(.horizontal, 12).frame(minHeight: 36)
            .background(Color(red: 0.96, green: 0.95, blue: 1), in: RoundedRectangle(cornerRadius: 12))
            .opacity(configuration.isPressed ? 0.65 : 1)
    }
}
