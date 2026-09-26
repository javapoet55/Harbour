import SwiftUI

/// A live briefing presented with the supplied Nexdo design pack.
struct DailyBriefView: View {
    let name: String
    let sections: [AssistantTurn.Section]
    @Binding var prompt: String
    @FocusState.Binding var typing: Bool
    let busy: Bool
    let close: () -> Void
    let ask: (String) -> Void
    let voice: () -> Void
    let read: (Int, String) -> Void
    let readingSection: Int?
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var selectedSection: SectionRoute?
    private struct SectionRoute: Identifiable { let id: Int }

    private let ink = Color(red: 0.04, green: 0.05, blue: 0.22)
    private let secondary = Color(red: 0.30, green: 0.34, blue: 0.53)

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                BriefArtwork(part: .logo).frame(width: 190, height: 53).accessibilityLabel("Nexdo. Get more done with AI")
                Spacer()
                Button(action: close) {
                    Image(systemName: "xmark").font(.title2).frame(width: 44, height: 44)
                        .background(Color.blue.opacity(0.09), in: Circle())
                }.accessibilityLabel("Close daily brief")
            }
            HStack(alignment: .center, spacing: 0) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Hi \(name) 👋").font(.title.bold()).fixedSize(horizontal: false, vertical: true)
                    Text("Here’s what you need to know today.").font(.subheadline).foregroundStyle(secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
                if !typeSize.isAccessibilitySize {
                    BriefArtwork(part: .robot).frame(width: 145, height: 110).accessibilityHidden(true)
                }
            }
            HStack(spacing: 14) {
                Image(systemName: "sparkles").font(.title).foregroundStyle(.purple)
                    .frame(width: 48, height: 48).background(.purple.opacity(0.09), in: RoundedRectangle(cornerRadius: 15))
                Text("Here’s your quick briefing for today, \(name). Focus on what matters most.")
                    .font(.subheadline).fixedSize(horizontal: false, vertical: true)
            }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white, lineWidth: 1))

            ForEach(Array(sections.enumerated()), id: \.offset) { index, section in
                sectionCard(index, section)
            }
            if sections.isEmpty {
                Text("No briefing details were returned. Try summarizing your day again.").font(.subheadline).foregroundStyle(secondary)
            }
            HStack(spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "sparkles").foregroundStyle(.blue)
                    TextField("Ask anything…", text: $prompt, axis: .vertical)
                        .lineLimit(1...4).focused($typing).accessibilityLabel("Ask anything")
                    if !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Button { ask(prompt) } label: { Image(systemName: "arrow.up.circle.fill").font(.title2).foregroundStyle(.blue) }
                            .disabled(busy || prompt.count > 4000).accessibilityLabel("Send request")
                    }
                }.padding(16).background(.white, in: RoundedRectangle(cornerRadius: 22))
                    .overlay(RoundedRectangle(cornerRadius: 22).stroke(.blue.opacity(0.16)))
                Button(action: voice) {
                    Image(systemName: "mic").font(.title2).foregroundStyle(.white).frame(width: 54, height: 54)
                        .background(LinearGradient(colors: [.blue, .indigo], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                }.disabled(busy).accessibilityLabel("Ask by voice")
            }.padding(.top, 4)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    suggestion("Summarize my day", query: NexdoAIIntent.dailyBriefing.query)
                    suggestion("Prioritize my tasks", query: NexdoAIIntent.topFocusTasks.query)
                    suggestion("Show conflicts", query: NexdoAIIntent.deadlinesAndRisks.query)
                }
            }
        }.foregroundStyle(ink).buttonStyle(.plain).padding(.top, 18)
            .onAppear {
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-open-brief-detail"), !sections.isEmpty { selectedSection = SectionRoute(id: 0) }
                #endif
            }
            .fullScreenCover(item: $selectedSection) { route in
                if sections.indices.contains(route.id) {
                    BriefSectionDetailView(title: style(sections[route.id].title).0,
                        items: sections[route.id].items, ask: ask,
                        read: { read(route.id, sections[route.id].items.joined(separator: "\n\n")) })
                }
            }
    }

    private func suggestion(_ title: String, query: String) -> some View {
        Button(title) { ask(query) }.font(.caption).padding(.horizontal, 14).frame(minHeight: 44)
            .background(.indigo.opacity(0.05), in: Capsule())
            .overlay(Capsule().stroke(.indigo.opacity(0.12))).disabled(busy)
    }

    private func style(_ title: String) -> (String, BriefArtwork.Part, Color) {
        let title = title.lowercased()
        if title.contains("priorit") { return ("Top Priorities", .priority, .pink) }
        if title.contains("deadline") { return ("Upcoming Deadlines", .calendar, .blue) }
        if title.contains("conflict") || title.contains("risk") { return ("Conflicts & Risks", .warning, .orange) }
        if title.contains("next") { return ("Next Move", .lightbulb, .green) }
        return (title.capitalized, .lightbulb, .green)
    }

    private func sectionCard(_ index: Int, _ section: AssistantTurn.Section) -> some View {
        let (title, artwork, color) = style(section.title)
        return Button { selectedSection = SectionRoute(id: index) } label: {
            HStack(spacing: 14) {
                BriefArtwork(part: artwork).frame(width: 52, height: 52).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text(title).font(.headline).fixedSize(horizontal: false, vertical: true)
                        Text("\(section.items.count)").font(.subheadline.bold()).foregroundStyle(color)
                            .padding(6).background(color.opacity(0.12), in: Circle())
                    }
                    Text(section.items.first ?? "Nothing to report.").font(.subheadline).foregroundStyle(secondary).lineLimit(2)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.caption)
            }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 22))
                .contentShape(RoundedRectangle(cornerRadius: 22))
        }.accessibilityIdentifier("brief-section-\(index)")
            .accessibilityHint("Opens \(title)")
    }
}

/// Sprite regions keep the supplied artwork intact; text and counts remain native and dynamic.
private struct BriefArtwork: View {
    enum Part: CaseIterable { case logo, robot, priority, calendar, warning, lightbulb
        var rect: CGRect {
            switch self {
            case .logo: CGRect(x: 30, y: 30, width: 418, height: 109)
            case .robot: CGRect(x: 713, y: 8, width: 515, height: 237)
            case .priority: CGRect(x: 59, y: 487, width: 126, height: 100)
            case .calendar: CGRect(x: 222, y: 487, width: 132, height: 100)
            case .warning: CGRect(x: 390, y: 487, width: 128, height: 100)
            case .lightbulb: CGRect(x: 549, y: 487, width: 129, height: 100)
            }
        }
    }
    let part: Part
    private static let sprites: [Part: UIImage] = {
        guard let source = UIImage(named: "daily-brief-pack")?.cgImage else { return [:] }
        return Dictionary(uniqueKeysWithValues: Part.allCases.compactMap { part in
            source.cropping(to: part.rect).map { (part, UIImage(cgImage: $0)) }
        })
    }()
    var body: some View {
        if let image = Self.sprites[part] {
            Image(uiImage: image).resizable().scaledToFit().blendMode(.multiply)
        }
    }
}
