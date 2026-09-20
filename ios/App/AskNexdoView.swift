import SwiftUI

/// Stable entry actions routed through the existing conversational assistant.
enum NexdoAIIntent: String, CaseIterable, Identifiable {
    case dailyBriefing, topFocusTasks, deadlinesAndRisks, findScheduleTime, planTomorrow
    var id: String { rawValue }
    var title: String {
        switch self {
        case .dailyBriefing: "Give me my full day briefing"
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
        case .deadlinesAndRisks: "See what is due in the next 5 days"
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
        case .dailyBriefing: "Give me my full day briefing for today: priorities, deadlines, conflicts, and my next move."
        case .topFocusTasks: "Pick my top 3 focus tasks, ranked by urgency, estimated effort, and impact."
        case .deadlinesAndRisks: "Show upcoming deadlines in the next 5 days, overdue work, conflicts, overloaded days, and high-priority unfinished tasks."
        case .findScheduleTime: "Find practical free time in my schedule around my calendar commitments using my availability."
        case .planTomorrow: "Do I have enough time to finish everything tomorrow? Consider tasks, events, deadlines, and estimated durations."
        }
    }
}

enum AskStyle {
    static let blue = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.42, green: 0.72, blue: 1.00, alpha: 1)
            : UIColor(red: 0.18, green: 0.35, blue: 0.56, alpha: 1)
    })
    static let ink = Color(uiColor: .label)
    static let secondary = Color(uiColor: .secondaryLabel)
    static let background = Color(uiColor: .systemBackground)
    static let cardBackground = Color(uiColor: .secondarySystemBackground)
    static let separator = Color(uiColor: .separator)
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
                    .background(AskStyle.blue.opacity(0.16), in: RoundedRectangle(cornerRadius: 12))
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
            .background(AskStyle.cardBackground, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(AskStyle.blue.opacity(0.28)))
            .contentShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(intent.title + ". " + intent.detail)
        .accessibilityAddTraits(.isButton)
    }
}

struct ShoppingRecommendationContext:Sendable {
    let listName:String
    let itemNames:[String]
    var assistantContext:String {
        "Review my shopping list \"\(listName)\". Current items: \(itemNames.isEmpty ? "none yet":itemNames.joined(separator:", ")). Give practical grocery advice for this list. Do not add, replace, remove, or complete anything without my explicit approval."
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
    @State private var showingVoice = false
    @State private var showingText = false
    @State private var voiceError: String?
    @State private var preparingSpeech = false
    @State private var readingSection: Int?
    @State private var lastSpeechText: String?
    @Environment(\.scenePhase) private var scenePhase
    @State private var speechTask: Task<Void, Never>?
    @State private var requestTask: Task<Void, Never>?
    @State private var lastRequestWasVoice = false
    @State private var openedInitialVoice = false
    @StateObject private var playback = VoicePlayback()
    private let startWithVoice: Bool
    private let textPage: Bool
    private let shoppingContext:ShoppingRecommendationContext?
    @FocusState private var composerFocused: Bool

    init(initialPrompt: String = "", startWithVoice: Bool = false, textPage: Bool = false, shoppingContext:ShoppingRecommendationContext? = nil) {
        _prompt = State(initialValue: initialPrompt)
        self.startWithVoice = startWithVoice
        self.textPage = textPage
        self.shoppingContext=shoppingContext
    }

    private let policyRefusal = "I can’t help with political, violent, sexual, or general-knowledge questions. I can help with your tasks, calendar, and scheduling questions instead."
    private let policyCommonQuestionRefusal = "I can’t help with that request. Ask me about your tasks, deadlines, or schedule instead."

    private let politicalPatterns = [
        #"\b(election|politic|politician|president|senator|governor|congress|senate|campaign|parties?|vote|government|parliament|politics)\b"#,
        #"\b(trump|biden|obama|democrat|republican|gop|left-wing|right-wing)\b"#,
    ]
    private let sexualPatterns = [
        #"\b(sex(?:ual)?|porn(?:ography)?|nude|naked|masturbat|explicit content|erotic|hookup|orgasm|intercourse)\b"#,
        #"\b(tits|boobs|dick|cock|vagina|penis|clit|breasts)\b"#,
    ]
    private let violentPatterns = [
        #"\b(kill(ing|s|ed)?|murder|shoot|stab|beating|assault|attack|violent|violence|explosive|bomb|terror|suicide|self[ -]?harm|abuse|abusive|rape|sexual assault)\b"#,
        #"\b(punch|beat|slaughter|lynch|shooting|homicid|weapon|knife|gun|firearm|poison)\b"#,
    ]
    private let commonPatterns = [
        #"\bwhy\s+(?:is|are)\s+the\s+sky\s+blue\b"#,
        #"\bwhat\s+(?:is|are)\s+(?:the\s+)?(?:meaning|definition|origin|reason)\b"#,
        #"\bwho\s+(?:is|are|was)\b"#,
        #"\bwhat\s+(?:is|are|were)\b"#,
        #"\bwhy\s+(?:is|are|did|does|do|can|would|should|could)\b"#,
        #"\bhow\s+(?:does|do|can|should|to|doesn't|does not)\b"#,
    ]
    private let taskIntentHints = #"\b(shopping|groceries|moments?|birthdays?|anniversar(?:y|ies)|festivals?|task|tasks|todo|brief|briefing|deadline|due|overdue|schedule|appointments?|calendar|meeting|focus|remind|create|update|reschedule|complete|delete|move|today|tomorrow|weekly|next|hour|minute|plan|time|priority|free\s+time|working\s+day)\b"#

    private var blocked: Bool { submitting || model.busy }
    private var validPrompt: Bool { !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && prompt.count <= 4000 }

    private func containsPattern(_ pattern: String, in value: String) -> Bool {
        return value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    private func policyGuardRefusal(for query: String) -> String? {
        let normalized = query.lowercased()
        if violentPatterns.contains(where: { containsPattern($0, in: query) }) { return policyRefusal }
        if sexualPatterns.contains(where: { containsPattern($0, in: query) }) { return policyRefusal }
        if politicalPatterns.contains(where: { containsPattern($0, in: query) }) { return policyRefusal }

        if commonPatterns.contains(where: { containsPattern($0, in: query) }) && !containsPattern(taskIntentHints, in: query) {
            return policyCommonQuestionRefusal
        }

        if (normalized.hasPrefix("why ") || normalized.hasPrefix("what ") || normalized.hasPrefix("who ") || normalized.hasPrefix("how ") || normalized.hasPrefix("when ") || normalized.hasPrefix("where ")) && query.contains("?") {
            if !containsPattern(taskIntentHints, in: query) { return policyCommonQuestionRefusal }
        }
        return nil
    }

    private func blockedTurn(for query: String) -> AssistantTurn {
        let refusal = policyGuardRefusal(for: query) ?? policyRefusal
        return AssistantTurn(
            createdTaskId: nil,
            spoken: refusal,
            visual: .init(summary: refusal, sections: [
                .init(title: "AI Response", items: [refusal])
            ], tasks: [], appointments: [], overdue: [], next: nil),
            contextActionId: nil,
            confirmation: nil,
            executive: nil
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            if textPage || model.turn != nil { HStack {
                Text(shoppingContext == nil ? (textPage ? "Free form Text" : "Ask Nexdo") : "Shopping Recommendations").font(.title2.bold()).foregroundStyle(Color.nexdoInk)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button {
                    composerFocused = false
                    requestTask?.cancel()
                    stopSpeech()
                    failedQuery = nil
                    pendingQuery = nil
                    model.turn = nil
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Color.nexdoBlue)
                        .frame(width: 56, height: 56)
                        .background(Color.nexdoBlue.opacity(0.12), in: Circle())
                        .overlay(Circle().stroke(Color.nexdoBlue.opacity(0.22), lineWidth: 1))
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close Ask Nexdo")
                .accessibilityHint("Closes Ask Nexdo")
            }.padding(.horizontal, 20).padding(.top, 22) }

            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if model.turn == nil {
                        if textPage {
                            if let shoppingContext {shoppingRecommendationIntro(shoppingContext)}
                            else {
                                Text("What would you like help with?").font(.title2.bold())
                                Text("Type a question or tell Nexdo what to plan, create, or change.").font(.subheadline).foregroundStyle(.secondary)
                            }
                            field
                            HStack { Spacer(); controls }
                            Text(shoppingContext == nil ? "Try a prompt":"Try asking about your list").font(.headline).padding(.top, 16)
                            ForEach(promptSuggestions,id:\.self) { example in
                                Button { prompt = example; composerFocused = true } label: {
                                    HStack(spacing:12) {
                                        if shoppingContext != nil {Image(systemName:suggestionIcon(example)).foregroundStyle(Color.nexdoBlue).frame(width:24)}
                                        Text(example).multilineTextAlignment(.leading); Spacer(); Image(systemName: "arrow.up.left")
                                    }
                                        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                                        .background(Color.nexdoIndigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                                }.buttonStyle(.plain).disabled(blocked)
                            }
                        } else {
                            AskAILandingView(prompt: $prompt, busy: blocked, sendEnabled: validPrompt,
                                ask: { request($0) }, voice: { stopSpeech(); showingVoice = true },
                                close: { requestTask?.cancel(); stopSpeech(); dismiss() }, typing: $composerFocused)

                        }
                    } else {
                        if let query = model.lastAssistantPrompt {
                            Label {
                                Text(query).lineLimit(2)
                            } icon: {
                                Image(systemName: "questionmark.circle")
                            }
                            .font(.subheadline).foregroundStyle(AskStyle.secondary)
                            .padding(.top, 16).padding(.bottom, 2)
                            .accessibilityLabel("Your question: " + query)
                        }
                        AskResponseView(readingSection: readingSection, preparingSpeech: preparingSpeech) { index, text in
                            if readingSection == index { stopSpeech() }
                            else { speakAnswer(text: text, section: index) }
                        }.disabled(blocked)
                        Button("Show suggestions") { stopSpeech(); model.turn = nil }.padding(.vertical, 12).disabled(blocked)
                    }
                    if submitting {
                        ProgressView("Asking Nexdo…").padding(.vertical, 16).accessibilityAddTraits(.updatesFrequently)
                    }
                    if let query = failedQuery {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Nexdo couldn’t complete that request. Please try again.")
                            Button("Retry") { request(query, speakResponse: lastRequestWasVoice) }.disabled(blocked)
                        }.font(.subheadline).padding(.vertical, 12)
                    }
                }.padding(.horizontal, 20).padding(.bottom, 20)
            }.scrollDismissesKeyboard(.interactively)
        }
        .background(AskStyle.background)
        .tint(.nexdoIndigo)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if composerFocused {
                    HStack {
                        Spacer()
                        Button("Done") { composerFocused = false }
                            .font(.body.weight(.semibold))
                            .frame(minWidth: 60, minHeight: 44)
                            .accessibilityIdentifier("ask-keyboard-done")
                    }
                    .padding(.horizontal, 16)
                    .background(.regularMaterial)
                }
                if model.turn != nil { composer }
            }
        }
        .interactiveDismissDisabled(composerFocused || submitting)
        .sheet(isPresented: $showConsent, onDismiss: { pendingQuery = nil }) {
            consentView.presentationDetents([.medium, .large])
        }
        .fullScreenCover(isPresented: $showingVoice) { AddTaskByVoiceView(askMode: true) }
        .fullScreenCover(isPresented: $showingText) { AskNexdoView(textPage: true) }
        .onAppear {
            if startWithVoice && !openedInitialVoice { openedInitialVoice = true; showingVoice = true }
        }
        .onDisappear { if !showingVoice { requestTask?.cancel(); stopSpeech() } }
        .onChange(of: scenePhase) { _, phase in if phase != .active { stopSpeech() } }
        .onChange(of: model.aiConsent) { _, allowed in if !allowed { stopSpeech() } }
    }

    private var promptSuggestions:[String] {
        shoppingContext == nil ? ["What should I focus on today?", "Find 30 minutes free tomorrow for a walk.", "Remind me to call Damien tomorrow at 11 AM."] : [
            "What practical essentials are missing from this list?",
            "Suggest groceries for three balanced dinners.",
            "Find budget-friendly swaps for items on this list.",
            "Check whether these quantities look right for one week."
        ]
    }

    private func suggestionIcon(_ prompt:String)->String {
        if prompt.contains("dinners"){return "fork.knife"}
        if prompt.contains("budget"){return "dollarsign.circle"}
        if prompt.contains("quantities"){return "number.circle"}
        return "basket.fill"
    }

    private func shoppingRecommendationIntro(_ context:ShoppingRecommendationContext)->some View {
        VStack(alignment:.leading,spacing:14){
            HStack(spacing:13){
                Image(systemName:"sparkles").font(.title2).foregroundStyle(.white)
                    .frame(width:48,height:48).background(NexdoTheme.gradient,in:RoundedRectangle(cornerRadius:15,style:.continuous))
                VStack(alignment:.leading,spacing:3){
                    Text("Plan a smarter cart").font(.title2.bold()).foregroundStyle(Color.nexdoInk)
                    Text(context.listName).font(.subheadline.weight(.semibold)).foregroundStyle(Color.nexdoIndigo)
                }
            }
            Text("Ask Nexdo to spot missing staples, suggest meal ideas, compare alternatives, or check quantities using the items already on this list.")
                .font(.subheadline).foregroundStyle(Color.nexdoSecondary).fixedSize(horizontal:false,vertical:true)
            HStack(spacing:8){
                Image(systemName:"checkmark.shield.fill").foregroundStyle(Color.green)
                Text("Suggestions only—your list changes after you approve them.").font(.caption.weight(.medium)).foregroundStyle(Color.nexdoSecondary)
            }
        }.padding(16).frame(maxWidth:.infinity,alignment:.leading)
            .background(LinearGradient(colors:[Color.nexdoBlue.opacity(0.10),Color.nexdoMagenta.opacity(0.07)],startPoint:.topLeading,endPoint:.bottomTrailing),in:RoundedRectangle(cornerRadius:20,style:.continuous))
            .overlay(RoundedRectangle(cornerRadius:20,style:.continuous).stroke(Color.nexdoIndigo.opacity(0.12)))
    }

    private var entryCards: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            entryCard("Ask by Voice", detail: "Tap and speak", icon: "mic.fill", voice: true) {
                stopSpeech(); showingVoice = true
            }
            entryCard("Free form Text", detail: "Type your prompt", icon: "text.bubble", voice: false) {
                stopSpeech(); showingText = true
            }
        }
        .padding(16)
        .background(LinearGradient(colors: [Color.nexdoMagenta.opacity(0.05), Color.nexdoIndigo.opacity(0.03)], startPoint: .leading, endPoint: .trailing))
        .padding(.horizontal, 16).padding(.vertical, 14)
        .background(AskStyle.background)
    }
    private func entryCard(_ title: String, detail: String, icon: String, voice: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(.title2).foregroundStyle(voice ? Color.white : Color.nexdoIndigo)
                    .frame(width: 40, height: 40)
                    .background(voice ? AnyShapeStyle(LinearGradient(colors: [.nexdoIndigo, .nexdoBlue], startPoint: .leading, endPoint: .trailing)) : AnyShapeStyle(Color.nexdoMagenta.opacity(0.08)), in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.footnote.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.75)
                    Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.75)
                }
                Spacer(minLength: 0)
            }.foregroundStyle(Color.nexdoInk).padding(12).frame(maxWidth: .infinity, minHeight: 76)
                .background(voice ? Color.nexdoIndigo.opacity(0.05) : AskStyle.background, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.nexdoIndigo.opacity(0.14)))
        }.buttonStyle(.plain).disabled(blocked)
    }

    private var composer: some View {
        VStack(spacing: 14) {
            Divider()
            if preparingSpeech { HStack { ProgressView("Preparing voice reply…"); Button("Cancel") { stopSpeech() } } }
            if playback.isPlaying { Button("Stop speaking", systemImage: "stop.circle") { stopSpeech() } }
            if let message = voiceError ?? playback.error {
                VStack(alignment: .leading, spacing: 6) {
                    Text(message).font(.caption)
                    Button("Retry voice reply") { speakAnswer(text: lastSpeechText) }.disabled(blocked || preparingSpeech)
                }
            }
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
        TextField(shoppingContext == nil ? "Type your prompt…":"Ask about this shopping list…", text: $prompt, axis: .vertical)
            .font(.subheadline).lineLimit(textPage && model.turn == nil ? 4...8 : 1...4).focused($composerFocused)
            .padding(.horizontal, 12).padding(.vertical, 12)
            .frame(minHeight: 44)
            .background(AskStyle.cardBackground, in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(AskStyle.separator))
            .accessibilityLabel("Ask Nexdo follow-up")
    }

    @ViewBuilder private var controls: some View {
        Button { request(prompt) } label: {
            Group {
                if submitting { ProgressView().tint(.white) }
                else { Text(shoppingContext == nil ? "Ask Nexdo":"Get Recommendations").font(.subheadline.weight(.semibold)) }
            }.padding(.horizontal, 16).frame(minHeight: 44)
                .background(AskStyle.blue, in: RoundedRectangle(cornerRadius: 13)).foregroundStyle(.white)
        }.disabled(!validPrompt || blocked).opacity(validPrompt && !blocked ? 1 : 0.55).accessibilityLabel(shoppingContext == nil ? "Ask Nexdo":"Get shopping recommendations")
        if !textPage {
            Button { composerFocused = false; stopSpeech(); showingVoice = true } label: {
                Image(systemName: playback.isPlaying ? "speaker.wave.2.fill" : "mic").frame(width: 44, height: 44)
                    .background(AskStyle.blue, in: Circle()).foregroundStyle(.white)
            }.disabled(blocked).accessibilityLabel("Start voice input").accessibilityHint("Record a question or create a task with OpenAI voice")
        }
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

    private func request(_ text: String, speakResponse: Bool = false) {
        guard !blocked else { return }
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty, query.count <= 4000 else { return }
        if policyGuardRefusal(for: query) != nil {
            model.turn = blockedTurn(for: query)
            model.lastAssistantPrompt = query
            failedQuery = nil
            submitting = false
            if prompt.trimmingCharacters(in: .whitespacesAndNewlines) == query { prompt = "" }
            return
        }
        guard model.aiConsent else {
            pendingQuery = query
            showConsent = true
            return
        }
        composerFocused = false
        stopSpeech()
        voiceError = nil
        lastRequestWasVoice = speakResponse
        submitting = true
        failedQuery = nil
        requestTask = Task {
            let submitted=shoppingContext.map{$0.assistantContext+"\n\nCustomer request: "+query} ?? query
            let succeeded = await model.ask(submitted)
            guard !Task.isCancelled else { submitting = false; return }
            if succeeded {
                if shoppingContext != nil {model.lastAssistantPrompt=query}
                if prompt.trimmingCharacters(in: .whitespacesAndNewlines) == query { prompt = "" }
                if speakResponse { speakAnswer() }
            } else { failedQuery = query }
            submitting = false
        }
    }

    private func stopSpeech() {
        speechTask?.cancel(); speechTask = nil
        preparingSpeech = false
        readingSection = nil
        playback.stop()
    }

    private func speakAnswer(text: String? = nil, section: Int? = nil) {
        guard model.aiConsent else { voiceError = "Allow OpenAI sharing in Account to use Read Loud."; return }
        guard let text = text ?? model.turn?.displaySections.flatMap(\.items).joined(separator: "\n\n"), !text.isEmpty else { return }
        stopSpeech(); voiceError = nil
        lastSpeechText = text; readingSection = section
        speakChunks(SpeechText.chunks(text), index: 0)
    }

    private func speakChunks(_ chunks: [String], index: Int) {
        guard index < chunks.count else { readingSection = nil; return }
        preparingSpeech = true
        speechTask = Task {
            do {
                let data = try await model.speechAudio(for: chunks[index])
                guard !Task.isCancelled, model.aiConsent else { return }
                preparingSpeech = false
                playback.play(data) { succeeded in
                    if succeeded { speakChunks(chunks, index: index + 1) }
                    else { readingSection = nil }
                }
            } catch {
                guard !Task.isCancelled else { return }
                preparingSpeech = false; readingSection = nil
                voiceError = "Your answer is ready to read. " + error.localizedDescription
            }
        }
    }
}
