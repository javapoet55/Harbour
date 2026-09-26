import SwiftUI

/// The dashboard only chooses an entry point; requests retain the assistant's
/// existing consent, review, and execution flow.
struct AskAILandingView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var typeSize
    @Binding var prompt: String
    let busy: Bool
    let sendEnabled: Bool
    let ask: (String) -> Void
    let voice: () -> Void
    let close: () -> Void
    @FocusState.Binding var typing: Bool
    @State private var destination: Destination?
    enum Destination: String, Identifiable { case shopping, moments; var id: String { rawValue } }

    private let cards: [(String, String, String, Color)] = [
        ("My Daily Brief", "Priorities and\nyour next move", "calendar", .blue),
        ("Top 3 Tasks", "Urgency, effort\nand impact", "scope", .green),
        ("Due & Risks", "Due in the\nnext 5 days", "exclamationmark.triangle", .orange),
        ("Find Time", "Free time around\nyour plans", "clock", .purple)
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                NexdoLogoMark().frame(width: 42, height: 42)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Nexdo").font(.title2.bold())
                    Text("Your AI productivity companion").font(.caption).foregroundStyle(Color.nexdoSecondary)
                }
                Spacer(minLength: 0)
                Button(action: close) { Image(systemName: "xmark").font(.title3).frame(width: 44, height: 44).background(.white.opacity(0.65), in: Circle()) }
                    .accessibilityLabel("Close Ask Nexdo")
            }.padding(.top, 12)
            HStack(alignment: .center, spacing: 0) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Hi \(ProfileName.firstName(from: model.profile?.name ?? "") ?? "there"),").font(.largeTitle.bold())
                    Text("How can I help you today?").font(.title2.bold())
                    Text("Plan smarter. Do more. Stress less.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
                if !typeSize.isAccessibilitySize {
                    NexdoAIOrb().frame(width: 64, height: 64).frame(width: 94)
                }
            }.padding(.vertical, 6)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: 8) {
                ForEach(cards.indices, id: \.self) { index in
                    Button { select(index) } label: { card(index) }
                        .buttonStyle(.plain).disabled(busy).accessibilityIdentifier("ask-card-\(index)")
                }
            }
            VStack(spacing: 8) {
                Button(action: voice) {
                    VStack(spacing: 8) {
                        HStack(spacing: 12) {
                            waveform
                            Image(systemName: "mic.fill").font(.system(size: 30)).foregroundStyle(.white).frame(width: 64, height: 64)
                                .background(NexdoTheme.gradient, in: Circle()).shadow(color: .nexdoIndigo.opacity(0.3), radius: 8)
                            waveform
                        }
                        Text("Ask by Voice").font(.headline)
                        Text("Tap and speak naturally. I’m listening…").font(.caption).foregroundStyle(Color.nexdoSecondary)
                    }.frame(maxWidth: .infinity).contentShape(Rectangle())
                }.buttonStyle(.plain).disabled(busy).accessibilityIdentifier("ask-voice")
                HStack(spacing: 8) {
                    Image(systemName: "keyboard").font(.title3).padding(10).background(Color.nexdoIndigo.opacity(0.05), in: Circle())
                    TextField("Or type your request…", text: $prompt, axis: .vertical).font(.subheadline).lineLimit(1...4).focused($typing).accessibilityLabel("Type your request")
                    Button { typing = false; ask(prompt) } label: {
                        Image(systemName: "arrow.up").font(.title3.bold()).foregroundStyle(.white).frame(width: 42, height: 42).background(Color.nexdoIndigo.opacity(sendEnabled ? 1 : 0.45), in: Circle())
                    }.disabled(!sendEnabled || busy).accessibilityLabel("Send request")
                }.padding(7).background(.white, in: RoundedRectangle(cornerRadius: 28))
                if prompt.count > 4000 { Text("Keep your request under 4,000 characters.").font(.caption).foregroundStyle(.red) }
            }.padding(12).frame(minHeight:300).background(pastel(.purple), in: RoundedRectangle(cornerRadius: 20))
            Label("Powered by Nexdo AI", systemImage: "sparkles").font(.caption).foregroundStyle(Color.nexdoSecondary.opacity(0.65)).frame(maxWidth: .infinity).padding(.vertical, 12)
        }
        .foregroundStyle(Color.nexdoInk)
        .background { LinearGradient(colors: [.cyan.opacity(0.08), .purple.opacity(0.06), .white], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea() }
        .sheet(item: $destination) { destination in
            NavigationStack {
                Group {
                    if destination == .moments { ImportantMomentsView() }
                    else { AskShoppingDestination(api: model.momentAPI) }
                }.toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { self.destination = nil } } }
            }
        }
    }
    private func pastel(_ color: Color) -> LinearGradient { LinearGradient(colors: [color.opacity(0.10), color.opacity(0.045)], startPoint: .topLeading, endPoint: .bottomTrailing) }
    private func card(_ index: Int) -> some View {
        let item = cards[index]
        return HStack(alignment: .top, spacing: 7) {
            Image(systemName: item.2).font(.system(size: 20)).foregroundStyle(item.3).frame(width: 34, height: 36).background(item.3.opacity(0.18), in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 5) {
                Text(item.0).font(typeSize.isAccessibilitySize ? .headline : .system(size: 15, weight: .bold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(item.1).font(typeSize.isAccessibilitySize ? .body : .system(size: 13))
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                    .minimumScaleFactor(0.85)
                    .foregroundStyle(Color.nexdoSecondary)
            }.frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Color.nexdoSecondary).padding(.top, 24)
        }.padding(10).frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading).background(pastel(item.3), in: RoundedRectangle(cornerRadius: 17))
    }
    private var waveform: some View {
        HStack(spacing: 4) { ForEach(0..<7) { index in Capsule().fill(Color.nexdoIndigo.opacity(0.09)).frame(width: 4, height: CGFloat(12 + (3 - abs(3 - index)) * 9)) } }.accessibilityHidden(true)
    }
    private func select(_ index: Int) {
        switch index {
        case 5: destination = .shopping
        case 6: destination = .moments
        case 7: typing = true
        default: ask(NexdoAIIntent.allCases[index].query)
        }
    }
}

private struct AskShoppingDestination: View {
    @StateObject private var store: ShoppingStore
    init(api: APIClient) { _store = StateObject(wrappedValue: ShoppingStore(api: api)) }
    var body: some View { ShoppingHome(store: store) }
}

/// Custom scalable brand illustration, rather than a tinted system icon.
private struct NexdoAIOrb: View {
    var body: some View {
        ZStack {
            Circle().fill(AngularGradient(colors: [.cyan, .blue, .purple, .pink, .cyan], center: .center)).blur(radius: 4)
            Circle().fill(RadialGradient(colors: [.nexdoIndigo, .purple.opacity(0.8), .clear], center: .center, startRadius: 12, endRadius: 42)).padding(3)
            Circle().stroke(.white.opacity(0.7), lineWidth: 1)
            VStack(spacing: 5) {
                HStack(spacing: 19) { Capsule().frame(width: 7, height: 10); Capsule().frame(width: 7, height: 10) }
                Path { path in path.move(to: CGPoint(x: 0, y: 0)); path.addQuadCurve(to: CGPoint(x: 16, y: 0), control: CGPoint(x: 8, y: 13)) }.stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .round)).frame(width: 16, height: 10)
            }.foregroundStyle(.white)
        }.shadow(color: .purple.opacity(0.3), radius: 12, y: 6).accessibilityHidden(true)
    }
}
