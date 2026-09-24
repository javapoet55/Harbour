import SwiftUI
import MessageUI

struct TaskAgentCard: View {
    @EnvironmentObject private var model: AppModel
    let taskID: String
    var onResearchAvailable: (Bool) -> Void = { _ in }
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var showPlan = false
    @State private var eligible = false
    @State private var fallbackReason: String?
    @State private var run: TaskAgentRun?
    @State private var answer = ""
    @State private var budget = ""
    @State private var constraints = ""
    @State private var drafts: [String: String] = [:]
    @State private var busy = false
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
    var body: some View {
        // Keep a concrete view mounted before the first response so its task always runs.
        VStack(alignment: .leading, spacing: 12) {
            if let run {
                VStack(alignment: .leading, spacing: 12) {
                    assistantHeader(run)
                    Divider().overlay(Color.nexdoIndigo.opacity(0.08))
                    if let question = run.question {
                        Text(question.text).font(.system(size: 16, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                        if question.key == "discovery" {
                            HStack { Button("Find a professional") { act("answer", key: "discovery", answer: "yes") }; Spacer(); Button("Keep as a task") { act("cancel") } }
                        } else if question.key == "urgency" {
                            HStack { Button("Urgent") { act("answer", key: "urgency", answer: "urgent") }; Spacer(); Button("Can wait") { act("answer", key: "urgency", answer: "flexible") } }
                        } else if question.key == "preferences" {
                            TextField("Budget range (optional)", text: $budget).textFieldStyle(.roundedBorder)
                            TextField("Requirements (optional)", text: $constraints, axis: .vertical).textFieldStyle(.roundedBorder)
                            Button(budget.isEmpty && constraints.isEmpty ? "No preference — start research" : "Start research") { act("answer", key: "preferences") }.buttonStyle(AgentSearchButton())
                        } else {
                            HStack(spacing: 12) {
                                Image(systemName: "mappin.circle.fill").font(.title2).foregroundStyle(Color.purple)
                                    .frame(width: 36, height: 36).background(Color.purple.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                                TextField("City or ZIP code", text: $answer).submitLabel(.done)
                                    .accessibilityLabel("City or ZIP code")
                            }.padding(8).background(.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.purple.opacity(0.65)))
                            Button { act("answer", key: "location", answer: answer) } label: {
                                HStack(spacing: 12) { Image(systemName: "magnifyingglass"); Text(run.service == "plumber" ? "Search Plumbers" : "Search businesses"); Image(systemName: "arrow.right") }
                            }.buttonStyle(AgentSearchButton()).disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            HStack { Rectangle().frame(height: 1); Text("OR").font(.caption.weight(.semibold)); Rectangle().frame(height: 1) }.foregroundStyle(Color.nexdoSecondary.opacity(0.4)).padding(.vertical, 5)
                        }
                        if question.key == "location", !run.slots.location.isEmpty { Button("Use \(run.slots.location)") { act("answer", key: "location", answer: run.slots.location) } }
                    }
                    let controls = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
                    controls {
                        if run.question?.key == "location" {
                            Button { act("answer", key: "location", answer: answer) } label: {
                                Label("Confirm location", systemImage: "doc.text").frame(maxWidth: .infinity, minHeight: 44)
                            }.disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                        Button { showPlan.toggle() } label: {
                            HStack { Image(systemName: "list.bullet.rectangle.portrait"); Text("View plan and search details"); Image(systemName: showPlan ? "chevron.down" : "chevron.right") }.frame(maxWidth: .infinity, minHeight: 44)
                        }.accessibilityValue(showPlan ? "Expanded" : "Collapsed")
                    }.font(.system(size: 11, weight: .semibold)).buttonStyle(AgentSecondaryButton())
                    if showPlan {
                        ForEach(run.steps) { step in VStack(alignment: .leading) { Label(step.title, systemImage: step.status == "done" ? "checkmark.circle" : step.status == "running" ? "clock" : "circle"); Text("\(step.status) · \(step.detail)").font(.caption).foregroundStyle(.secondary) }.padding(.vertical, 4) }
                    }
                    if let message = run.error { Text(message).font(.caption) }
                    ForEach(run.warnings, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
                    ForEach(Array(run.candidates.enumerated()), id: \.element.id) { index, candidate in
                        DisclosureGroup("\(index + 1). \(candidate.name)") {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(candidate.address).font(.caption)
                                Text(candidate.phone.isEmpty ? "Phone number unavailable" : candidate.phone).font(.subheadline)
                                Text("Email unavailable from Google Places. Check the business website.").font(.caption).foregroundStyle(.secondary)
                                if !candidate.phone.isEmpty { Button("Copy phone number") { UIPasteboard.general.string = candidate.phone; error = "Phone number copied." } }
                                if let website = candidate.website, let url = URL(string: website), url.scheme == "https" { Link("Business website", destination: url) }
                                Text(candidate.reason).font(.subheadline)
                                ForEach(candidate.evidence, id: \.url) { evidence in
                                    if let url = URL(string: evidence.url), url.scheme == "https" { Link("View on \(evidence.source)", destination: url) }
                                }
                                if candidate.googlePlaceId != nil {
                                    Text("Google Maps").font(.system(size: 14)).foregroundStyle(Color(red: 0.37, green: 0.37, blue: 0.37))
                                    Text("Customer feedback · Limited selection, ordered by Google relevance.").font(.caption)
                                    if (candidate.feedback ?? []).isEmpty { Text("No written reviews available.").font(.caption) }
                                    ForEach(Array((candidate.feedback ?? []).enumerated()), id: \.offset) { _, review in
                                        VStack(alignment: .leading, spacing: 6) {
                                            HStack {
                                                if let photo = review.photoUrl, let url = URL(string: photo) { AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { Color.clear }.frame(width: 32, height: 32).clipShape(Circle()) }
                                                if let profile = review.authorUrl, let url = URL(string: profile) { Link(review.author, destination: url) } else { Text(review.author) }
                                            }
                                            Text("\(review.rating.map { String(format: "%.0f", $0) } ?? "—")/5 · \(review.published)").font(.caption)
                                            Text(review.text).font(.subheadline)
                                            if let url = URL(string: review.url) { Link("Read review on Google Maps", destination: url) }
                                        }.padding(.vertical, 6)
                                    }
                                    ForEach(Array((candidate.attributions ?? []).enumerated()), id: \.offset) { _, attribution in
                                        if let link = attribution.url, let url = URL(string: link) { Link(attribution.provider, destination: url) } else { Text(attribution.provider) }
                                    }
                                }
                                Text("Your outreach draft").font(.subheadline.bold())
                                TextEditor(text: Binding(get: { drafts[candidate.id] ?? candidate.draft }, set: { drafts[candidate.id] = String($0.prefix(2000)) })).frame(minHeight: 160).accessibilityLabel("Draft for \(candidate.name)")
                                Button {
                                    guard MFMessageComposeViewController.canSendText() else {
                                        messageNotice = "Messages is not available on this device. You can copy the draft and phone number instead."
                                        return
                                    }
                                    messageDraft = BusinessMessageDraft(phone: candidate.phone, body: drafts[candidate.id] ?? candidate.draft)
                                } label: {
                                    Label("Open in Messages", systemImage: "message.fill").frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.borderedProminent).tint(Color.nexdoIndigo)
                                .disabled(candidate.phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (drafts[candidate.id] ?? candidate.draft).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                Text("Review the number and message, then tap Send. Some business numbers cannot receive texts.").font(.caption).foregroundStyle(.secondary)
                                HStack {
                                    Button("Save draft") { act("saveDraft", answer: drafts[candidate.id] ?? candidate.draft, candidateID: candidate.id) }
                                    Spacer()
                                    Button("Copy draft") { UIPasteboard.general.string = drafts[candidate.id] ?? candidate.draft; error = "Copied. Paste into your messaging app to send." }
                                }
                            }.padding(.vertical, 10)
                        }
                    }
                    HStack {
                        if ["QUEUED", "RUNNING"].contains(run.status) { Button("Pause") { act("pause") } }
                        if ["PAUSED", "FAILED", "BLOCKED"].contains(run.status) { Button(run.status == "PAUSED" ? "Resume" : "Retry") { act(run.status == "PAUSED" ? "resume" : "retry") } }
                        if !["CANCELLED", "READY_FOR_REVIEW", "NO_RESULTS"].contains(run.status) { Button { act("cancel") } label: { Label("Cancel research", systemImage: "xmark").foregroundStyle(Color.nexdoSecondary) } }
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
                ProgressView("Checking business search…").font(.subheadline)
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
                    let response = try await model.loadTaskAgent(taskID: taskID)
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
    private func assistantHeader(_ run: TaskAgentRun) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("AI ASSISTANT", systemImage: "sparkles").font(.caption.weight(.bold)).tracking(2).foregroundStyle(Color.nexdoIndigo)
            Text(label).font(.system(size: 20, weight: .bold)).tracking(-0.6).fixedSize(horizontal: false, vertical: true)
            Text("\(run.service) · \(run.slots.location.isEmpty ? "Location needed" : run.slots.location)").font(.subheadline)
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

    private func act(_ action: String, key: String? = nil, answer: String? = nil, candidateID: String? = nil) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-agent-design-preview") { return }
        #endif
        guard run != nil || action == "prepare" else { return }; busy = true
        Task {
            defer { busy = false }
            do { self.run = try await model.updateTaskAgent(taskID: taskID, action: action, version: run?.version ?? 0, key: key, answer: answer, budget: budget, constraints: constraints, candidateID: candidateID).run; self.answer = ""; error = nil }
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

private struct AgentSecondaryButton: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.foregroundStyle(Color.nexdoInk).padding(.horizontal, 8)
            .background(.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 11))
            .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color.nexdoIndigo.opacity(0.15)))
            .opacity(configuration.isPressed ? 0.7 : (enabled ? 1 : 0.5))
    }
}
