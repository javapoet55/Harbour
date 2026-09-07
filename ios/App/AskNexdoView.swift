import SwiftUI

/// Stable entry actions routed through the existing conversational assistant.
enum NexdoAIIntent: String, CaseIterable, Identifiable {
    case dailyBriefing, topFocusTasks, deadlinesAndRisks, findScheduleTime, planTomorrow
    var id: String { rawValue }
    var title: String {
        switch self {
        case .dailyBriefing: "Give me my full briefing"
        case .topFocusTasks: "Pick my Top 3 focus tasks"
        case .deadlinesAndRisks: "Show deadlines and risks"
        case .findScheduleTime: "Find time in my schedule"
        case .planTomorrow: "Help me plan tomorrow"
        }
    }
    var detail: String {
        switch self {
        case .dailyBriefing: "Priorities, deadlines, conflicts, and your next move"
        case .topFocusTasks: "Ranked by urgency, effort, and completion risk"
        case .deadlinesAndRisks: "See what is due in the next seven days"
        case .findScheduleTime: "Surface open time around calendar commitments"
        case .planTomorrow: "Check whether tomorrow has enough capacity"
        }
    }
    var icon: String {
        switch self {
        case .dailyBriefing: "sparkles"
        case .topFocusTasks: "target"
        case .deadlinesAndRisks: "alarm"
        case .findScheduleTime: "calendar.badge.clock"
        case .planTomorrow: "sunrise"
        }
    }
    var query: String {
        switch self {
        case .dailyBriefing: "Give me a complete briefing: priorities, overdue work, deadlines, calendar conflicts, and my recommended next action."
        case .topFocusTasks: "Pick my top 3 focus tasks, ranked by urgency, estimated effort, and completion risk."
        case .deadlinesAndRisks: "Show upcoming deadlines in the next seven days, overdue work, conflicts, overloaded days, and high-priority unfinished tasks."
        case .findScheduleTime: "Find practical free time in my schedule around my calendar commitments using my availability."
        case .planTomorrow: "Do I have enough time to finish everything tomorrow? Consider tasks, events, deadlines, and estimated durations."
        }
    }
}

private enum AskStyle {
    static let blue = Color(red: 0.18, green: 0.35, blue: 0.56)
    static let ink = Color(red: 0.09, green: 0.23, blue: 0.43)
    static let secondary = Color(red: 0.38, green: 0.47, blue: 0.60)
    static let background = Color(uiColor: .systemBackground)
}

struct NexdoAISuggestionCard: View {
    let intent: NexdoAIIntent
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: intent.icon)
                    .font(.body)
                    .frame(width: 36, height: 36)
                    .background(AskStyle.blue.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(intent.title).font(.subheadline.weight(.semibold))
                    Text(intent.detail).font(.caption).foregroundStyle(AskStyle.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(AskStyle.secondary).accessibilityHidden(true)
            }
            .foregroundStyle(AskStyle.ink)
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
            .background(Color.blue.opacity(0.055), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(AskStyle.blue.opacity(0.13)))
            .contentShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(intent.title + ". " + intent.detail)
        .accessibilityAddTraits(.isButton)
    }
}

struct AskNexdoView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var prompt = ""
    @State private var submitting = false
    @State private var failedQuery: String?
    @State private var pendingQuery: String?
    @State private var showConsent = false
    @State private var voiceInfo = false
    @FocusState private var composerFocused: Bool

    private var blocked: Bool { submitting || model.busy }
    private var validPrompt: Bool { !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && prompt.count <= 4000 }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Ask Nexdo").font(.title2.bold()).foregroundStyle(Color.nexdoInk)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.body).frame(width: 44, height: 44)
                }.accessibilityLabel("Close Ask Nexdo")
            }.padding(.horizontal, 20).padding(.top, 22)

            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Let’s make room for what matters.")
                        .font(.subheadline).foregroundStyle(AskStyle.secondary)
                        .padding(.top, 22).padding(.bottom, 8)
                    if model.turn == nil {
                        ForEach(NexdoAIIntent.allCases) { intent in
                            NexdoAISuggestionCard(intent: intent) { request(intent.query) }.disabled(blocked)
                        }
                    } else {
                        AskResponseView()
                        Button("Show suggestions") { model.turn = nil }.padding(.vertical, 12).disabled(blocked)
                    }
                    if submitting {
                        ProgressView("Asking Nexdo…").padding(.vertical, 16).accessibilityAddTraits(.updatesFrequently)
                    }
                    if let query = failedQuery {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Nexdo couldn’t complete that request. Please try again.")
                            Button("Retry") { request(query) }.disabled(blocked)
                        }.font(.subheadline).padding(.vertical, 12)
                    }
                }.padding(.horizontal, 20).padding(.bottom, 20)
            }.scrollDismissesKeyboard(.interactively)
        }
        .background(AskStyle.background)
        .tint(AskStyle.blue)
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        .interactiveDismissDisabled(composerFocused || submitting)
        .sheet(isPresented: $showConsent, onDismiss: { pendingQuery = nil }) {
            consentView.presentationDetents([.medium, .large])
        }
        .alert("Voice input", isPresented: $voiceInfo) {
            Button("OK", role: .cancel) { composerFocused = true }
        } message: {
            Text("Voice input isn’t available in the native app yet. You can type your question or use the keyboard’s dictation microphone.")
        }
    }

    private var composer: some View {
        VStack(spacing: 14) {
            Divider()
            if typeSize.isAccessibilitySize {
                field
                HStack { Spacer(); controls }
            } else {
                HStack(spacing: 8) { field; controls }
            }
            if prompt.count > 4000 {
                Text("Keep your question under 4,000 characters.").font(.caption).foregroundStyle(.secondary)
            }
        }.padding(.horizontal, 20).padding(.bottom, 12).background(AskStyle.background)
    }

    private var field: some View {
        TextField("Type a follow-up...", text: $prompt, axis: .vertical)
            .font(.subheadline).lineLimit(1...4).focused($composerFocused)
            .padding(.horizontal, 12).padding(.vertical, 12)
            .frame(minHeight: 44)
            .background(AskStyle.background, in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(Color.secondary.opacity(0.2)))
            .accessibilityLabel("Ask Nexdo follow-up")
    }

    @ViewBuilder private var controls: some View {
        Button { request(prompt) } label: {
            Group {
                if submitting { ProgressView().tint(.white) }
                else { Text("Ask").font(.subheadline.weight(.semibold)) }
            }.frame(minWidth: 58, minHeight: 44)
                .background(AskStyle.blue, in: RoundedRectangle(cornerRadius: 13)).foregroundStyle(.white)
        }.disabled(!validPrompt || blocked).opacity(validPrompt && !blocked ? 1 : 0.55).accessibilityLabel("Ask")
        Button { voiceInfo = true } label: {
            Image(systemName: "mic").frame(width: 44, height: 44)
                .background(AskStyle.blue, in: Circle()).foregroundStyle(.white)
        }.accessibilityLabel("Voice input unavailable").accessibilityHint("Explains how to use keyboard dictation")
    }

    private var consentView: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Before using Ask AI").font(.title2.bold())
            ScrollView {
                Text("Nexdo sends your question and relevant task and calendar information—including titles, notes, times, preferences, and conversation context—to OpenAI to generate answers. Do not include information you do not want shared. AI can make mistakes; review proposed changes before approving them.")
            }
            Link("OpenAI data privacy information", destination: URL(string: "https://openai.com/policies/privacy-policy/")!)
            Text("Optional. You can withdraw permission in Account; withdrawal stops future requests, not previous processing.").font(.footnote).foregroundStyle(.secondary)
            Button("Allow sharing with OpenAI") {
                let query = pendingQuery
                model.aiConsent = true
                showConsent = false
                if let query { request(query) }
            }.buttonStyle(.borderedProminent)
            Button("Not now", role: .cancel) { showConsent = false }
        }.padding(24)
    }

    private func request(_ text: String) {
        guard !blocked else { return }
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty, query.count <= 4000 else { return }
        guard model.aiConsent else {
            pendingQuery = query
            showConsent = true
            return
        }
        composerFocused = false
        submitting = true
        failedQuery = nil
        Task {
            let succeeded = await model.ask(query)
            if succeeded {
                if prompt.trimmingCharacters(in: .whitespacesAndNewlines) == query { prompt = "" }
            } else { failedQuery = query }
            submitting = false
        }
    }
}
