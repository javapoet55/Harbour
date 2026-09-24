import SwiftUI

struct TaskAgentCard: View {
    @EnvironmentObject private var model: AppModel
    let taskID: String
    var onResearchAvailable: (Bool) -> Void = { _ in }
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
                VStack(alignment: .leading, spacing: 14) {
                    Label(label, systemImage: "sparkles").font(.headline).foregroundStyle(Color.nexdoIndigo)
                    Text("\(run.service) · \(run.slots.location.isEmpty ? "Location needed" : run.slots.location)").font(.subheadline)
                    if run.urgency == "urgent" { Text("Urgent — prioritizing availability").font(.caption.bold()) }
                    Text("Search uses your city and service with Google Places (and Yelp when connected). NexDo never calls, messages, or shares your contact details with businesses. You review and send drafts yourself.").font(.caption).foregroundStyle(.secondary)
                    Link("Search terms and privacy", destination: AppEnvironment.web("/places-policy")).font(.caption)
                    if let question = run.question {
                        Text(question.text).font(.subheadline.bold())
                        if question.key == "discovery" {
                            HStack { Button("Find a professional") { act("answer", key: "discovery", answer: "yes") }; Spacer(); Button("Keep as a task") { act("cancel") } }
                        } else if question.key == "urgency" {
                            HStack { Button("Urgent") { act("answer", key: "urgency", answer: "urgent") }; Spacer(); Button("Can wait") { act("answer", key: "urgency", answer: "flexible") } }
                        } else if question.key == "preferences" {
                            TextField("Budget range (optional)", text: $budget).textFieldStyle(.roundedBorder)
                            TextField("Requirements (optional)", text: $constraints, axis: .vertical).textFieldStyle(.roundedBorder)
                            Button(budget.isEmpty && constraints.isEmpty ? "No preference — start research" : "Start research") { act("answer", key: "preferences") }
                        } else {
                            TextField("City or ZIP code", text: $answer).textFieldStyle(.roundedBorder)
                            Button("Confirm location") { act("answer", key: "location", answer: answer) }.disabled(answer.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        if question.key == "location", !run.slots.location.isEmpty { Button("Use \(run.slots.location)") { act("answer", key: "location", answer: run.slots.location) } }
                    }
                    DisclosureGroup("View plan and search details") {
                        ForEach(run.steps) { step in VStack(alignment: .leading) { Label(step.title, systemImage: step.status == "done" ? "checkmark.circle" : step.status == "running" ? "clock" : "circle"); Text("\(step.status) · \(step.detail)").font(.caption).foregroundStyle(.secondary) }.padding(.vertical, 4) }
                    }
                    if let message = run.error { Text(message).font(.caption) }
                    ForEach(run.warnings, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
                    ForEach(Array(run.candidates.enumerated()), id: \.element.id) { index, candidate in
                        DisclosureGroup("\(index + 1). \(candidate.name)") {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(candidate.address).font(.caption)
                                Text(candidate.phone.isEmpty ? "Phone number unavailable" : candidate.phone).font(.subheadline)
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
                        Spacer()
                        if !["CANCELLED", "READY_FOR_REVIEW", "NO_RESULTS"].contains(run.status) { Button("Cancel research", role: .destructive) { act("cancel") } }
                    }
                    if let error { Text(error).font(.caption).accessibilityAddTraits(.updatesFrequently) }
                }.padding(16).background(Color.nexdoIndigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 18)).disabled(busy)
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
        .task(id: taskID + (run?.status ?? "") + String(refreshID)) {
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
    private func act(_ action: String, key: String? = nil, answer: String? = nil, candidateID: String? = nil) {
        guard run != nil || action == "prepare" else { return }; busy = true
        Task {
            defer { busy = false }
            do { self.run = try await model.updateTaskAgent(taskID: taskID, action: action, version: run?.version ?? 0, key: key, answer: answer, budget: budget, constraints: constraints, candidateID: candidateID).run; self.answer = ""; error = nil }
            catch { self.error = error.localizedDescription }
        }
    }
}
