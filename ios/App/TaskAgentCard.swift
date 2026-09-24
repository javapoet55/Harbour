import SwiftUI
import MessageUI

struct TaskAgentCard: View {
    @EnvironmentObject private var model: AppModel
    let taskID: String
    @FocusState.Binding var focusedField: TaskDetailsView.Field?
    var onResearchAvailable: (Bool) -> Void = { _ in }
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var eligible = false
    @State private var fallbackReason: String?
    @State private var run: TaskAgentRun?
    @State private var answer = ""
    @State private var selectedBusiness: String?
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
                    Divider().overlay(Color.nexdoIndigo.opacity(0.08))
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
                            Button { act("search", key: "location", answer: answer) } label: {
                                HStack(spacing: 12) { Image(systemName: "magnifyingglass"); Text(run.service == "plumber" ? "Search Plumbers" : "Search businesses"); Image(systemName: "arrow.right") }
                            }.buttonStyle(AgentSearchButton()).disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                        if question.key == "location", !run.slots.location.isEmpty { Button("Use \(run.slots.location)") { act("search", key: "location", answer: run.slots.location) } }
                    }
                    if !findingBusinesses, let question = run.question, ["urgency", "preferences"].contains(question.key) {
                        if error == nil { searchProgress }
                        else { Button("Retry search") { act("search", answer: run.slots.location) }.buttonStyle(AgentSearchButton()) }
                    }
                    if let message = run.error { Text(message).font(.caption) }
                    ForEach(run.warnings.filter { !$0.hasPrefix("Yelp is not connected.") }, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
                    ForEach(Array(run.candidates.enumerated()), id: \.element.id) { index, candidate in
                        DisclosureGroup(isExpanded: Binding(get: { selectedBusiness == candidate.id }, set: { expanded in
                            focusedField = nil
                            selectedBusiness = expanded ? candidate.id : nil
                        })) {
                            businessDetails(candidate)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text("\(index + 1). \(candidate.name)").font(.headline)
                                if let evidence = candidate.evidence.first {
                                    Text("\(evidence.source) · \(evidence.rating.map { String(format: "%.1f ★", $0) } ?? "Not rated") · \(evidence.reviews ?? 0) reviews")
                                        .font(.caption).foregroundStyle(Color.nexdoSecondary)
                                }
                            }
                        }
                        .padding(14).background(.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 16))
                    }
                    HStack {
                        if ["QUEUED", "RUNNING"].contains(run.status) { Button("Pause") { act("pause") } }
                        if ["PAUSED", "FAILED", "BLOCKED"].contains(run.status) { Button(run.status == "PAUSED" ? "Resume" : "Retry") { act(run.status == "PAUSED" ? "resume" : "retry") } }
                        if !["CANCELLED", "READY_FOR_REVIEW", "NO_RESULTS"].contains(run.status) { Button { act("cancel") } label: { Label("Cancel search", systemImage: "xmark").foregroundStyle(Color.nexdoSecondary) } }
                    }
                    if let error { Text(error).font(.caption).accessibilityAddTraits(.updatesFrequently) }
                }.padding(18).background(LinearGradient(colors: [Color(red: 0.95, green: 0.92, blue: 1), Color(red: 0.92, green: 0.94, blue: 1), Color(red: 0.97, green: 0.98, blue: 1)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 20))
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
                run = try? JSONDecoder().decode(TaskAgentRun.self, from: data)
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
    private func businessDetails(_ candidate: TaskAgentRun.Candidate) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("Business details", selection: Binding(get: { businessTabs[candidate.id] ?? 0 }, set: { focusedField = nil; businessTabs[candidate.id] = $0 })) {
                Text("Business info").tag(0)
                Text("Feedback").tag(1)
            }.pickerStyle(.segmented).padding(.bottom, 6)
            if (businessTabs[candidate.id] ?? 0) == 0 {
            Label(candidate.address, systemImage: "mappin.and.ellipse").font(.subheadline)
            Label(candidate.phone.isEmpty ? "Phone number unavailable" : candidate.phone, systemImage: "phone").font(.subheadline.weight(.medium))
            Text("For email, check the business website.").font(.caption).foregroundStyle(.secondary)
            if !candidate.phone.isEmpty { Button("Copy phone number") { UIPasteboard.general.string = candidate.phone; error = "Phone number copied." } }
            if let website = candidate.website, let url = URL(string: website), url.scheme == "https" { Link("Business website", destination: url) }
            Text(candidate.reason).font(.subheadline)
            ForEach(candidate.evidence, id: \.url) { evidence in
                if let url = URL(string: evidence.url), url.scheme == "https" { Link("View on \(evidence.source)", destination: url) }
            }
            DisclosureGroup("Review or edit outreach draft") {
            TextEditor(text: Binding(get: { drafts[candidate.id] ?? candidate.draft }, set: { drafts[candidate.id] = String($0.prefix(2000)) })).frame(minHeight: 160).accessibilityLabel("Draft for \(candidate.name)")
                .focused($focusedField, equals: .agentDraft(candidate.id))
            HStack {
                Button("Save draft") { act("saveDraft", answer: drafts[candidate.id] ?? candidate.draft, candidateID: candidate.id) }
                Spacer()
                Button("Copy draft") { UIPasteboard.general.string = drafts[candidate.id] ?? candidate.draft; error = "Copied. Paste into your messaging app to send." }
            }
            }.font(.subheadline)
            Button {
                guard MFMessageComposeViewController.canSendText() else {
                    messageNotice = "Messages is not available on this device. You can copy the draft and phone number instead."
                    return
                }
                messageDraft = BusinessMessageDraft(phone: candidate.phone, body: drafts[candidate.id] ?? candidate.draft)
            } label: {
                Label("Open in Messages", systemImage: "message.fill").foregroundStyle(.black).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).tint(.yellow)
            .disabled(candidate.phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (drafts[candidate.id] ?? candidate.draft).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Text("Review the number and message, then tap Send. Some business numbers cannot receive texts.").font(.caption).foregroundStyle(.secondary)

            } else {
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
                ForEach(Array((candidate.attributions ?? []).enumerated()), id: \.offset) { _, attribution in
                    if let link = attribution.url, let url = URL(string: link) { Link(attribution.provider, destination: url) } else { Text(attribution.provider) }
                }
            }
                if candidate.googlePlaceId == nil { Text("No written reviews available.").font(.subheadline).foregroundStyle(.secondary) }
            }
        }.padding(.vertical, 10)
    }

    private func assistantHeader(_ run: TaskAgentRun) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("AI ASSISTANT", systemImage: "sparkles").font(.caption.weight(.bold)).tracking(2).foregroundStyle(Color.nexdoIndigo)
            Text(label).font(.system(size: 20, weight: .bold)).tracking(-0.6).fixedSize(horizontal: false, vertical: true)
            Text("\(run.service) · \(run.slots.location.isEmpty ? "Location needed" : run.slots.location)").font(.subheadline)
            if !run.candidates.isEmpty {
                Text("Compare businesses, read feedback, and review a message before sending.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                Link("Search terms and privacy", destination: AppEnvironment.web("/places-policy")).font(.caption)
            } else {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Search uses your city and service with Google Places (and Yelp when connected). NexDo never calls, messages, or shares your contact details with businesses. You review and send drafts yourself.")
                        .font(.system(size: 12)).foregroundStyle(Color.nexdoSecondary).fixedSize(horizontal: false, vertical: true)
                    Link(destination: AppEnvironment.web("/places-policy")) {
                        Label("Search terms and privacy", systemImage: "shield.lefthalf.filled").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.nexdoIndigo)
                    }
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
        }
    }

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
            .background(LinearGradient(colors: [Color(red: 0.20, green: 0.28, blue: 1), Color(red: 0.36, green: 0.16, blue: 1), Color(red: 0.72, green: 0.25, blue: 0.97)], startPoint: .leading, endPoint: .trailing), in: RoundedRectangle(cornerRadius: 15))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.45)
    }
}
