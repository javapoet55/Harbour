import SwiftUI

struct HelpView: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var query = ""
    @State private var category: HelpCategory?
    @State private var expanded: Set<String> = []
    @FocusState private var searching: Bool
    private var results: [HelpTopic] { HelpTopics.search(query, category: category) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 10) {
                    Label("NEXDO HELP", systemImage: "questionmark.circle.fill")
                        .font(.caption.weight(.bold)).foregroundStyle(Color.nexdoIndigo)
                    Text("How can we help you?").font(.title2.bold())
                    Text("Find quick answers for planning your day and getting things done.")
                        .foregroundStyle(Color.nexdoSecondary)
                }
                HStack(spacing: 12) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Color.nexdoIndigo)
                    TextField("Search help topics", text: $query)
                        .focused($searching).submitLabel(.search).onSubmit { searching = false }
                        .autocorrectionDisabled().accessibilityIdentifier("help-search")
                    if !query.isEmpty {
                        Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }
                            .accessibilityLabel("Clear search").frame(minWidth: 32, minHeight: 44)
                    }
                }.padding(.horizontal, 16).frame(minHeight: 56)
                    .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
                    .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.nexdoIndigo.opacity(0.22)))
                LazyVGrid(columns: [GridItem(.flexible())] + (typeSize.isAccessibilitySize ? [] : [GridItem(.flexible())]), spacing: 14) {
                    ForEach(HelpCategory.allCases) { item in categoryCard(item) }
                }
                HStack {
                    Text(category.map { "\($0.rawValue) questions" } ?? "Browse help topics").font(.title3.bold())
                    Spacer()
                    if category != nil { Button("View all") { category = nil; expanded = [] }.font(.subheadline.weight(.semibold)) }
                }
                if results.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "magnifyingglass").font(.largeTitle).foregroundStyle(Color.nexdoIndigo)
                        Text("No matching topics").font(.headline)
                        Text("Try “repeat”, “complete”, or “add an appointment”, or search all categories.")
                            .multilineTextAlignment(.center).foregroundStyle(Color.nexdoSecondary)
                        Button("Reset search") { query = ""; category = nil; searching = false }
                            .buttonStyle(.bordered)
                    }.frame(maxWidth: .infinity).padding(24).helpCard()
                } else {
                    if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("\(results.count) \(results.count == 1 ? "answer" : "answers") found")
                            .font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    }
                    ForEach(HelpCategory.allCases) { group in
                        let topics = results.filter { $0.category == group }
                        if !topics.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                if category == nil { Label(group.rawValue, systemImage: icon(group)).font(.headline).foregroundStyle(tint(group)) }
                                ForEach(topics) { topic in
                                    DisclosureGroup(isExpanded: Binding(get: { expanded.contains(topic.id) }, set: { value in
                                        if value { expanded.insert(topic.id) } else { expanded.remove(topic.id) }
                                    })) {
                                        Text(topic.answer).font(.body).foregroundStyle(Color.nexdoSecondary)
                                            .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12)
                                            .textSelection(.enabled)
                                    } label: {
                                        Text(topic.question).font(.subheadline.weight(.semibold))
                                            .foregroundStyle(Color.nexdoInk).fixedSize(horizontal: false, vertical: true)
                                            .padding(.vertical, 7)
                                    }.padding(16).helpCard().accessibilityIdentifier("help-topic-\(topic.id)")
                                }
                            }
                        }
                    }
                }
                NavigationLink { FeedbackView() } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "bubble.left.and.text.bubble.right").font(.title2)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Still need help?").font(.headline)
                            Text("Share a question or suggestion in Feedback.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                    }.padding(18).helpCard()
                }.buttonStyle(.plain)
            }.padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background { TodayBackdrop(subtle: true) }
        .foregroundStyle(Color.nexdoInk).tint(.nexdoIndigo)
        .navigationTitle("Help").navigationBarTitleDisplayMode(.inline)
        .onChange(of: query) { _, _ in expanded = [] }
    }
    private func icon(_ value: HelpCategory) -> String { value == .calendar ? "calendar" : "checkmark.circle" }
    private func tint(_ value: HelpCategory) -> Color { value == .calendar ? .blue : .nexdoIndigo }
    private func categoryCard(_ value: HelpCategory) -> some View {
        Button {
            category = category == value ? nil : value
            expanded = []; searching = false
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: icon(value)).font(.title2).foregroundStyle(tint(value))
                        .frame(width: 46, height: 46).background(tint(value).opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
                    Spacer()
                    Image(systemName: category == value ? "checkmark.circle.fill" : "chevron.right").foregroundStyle(tint(value))
                }
                Text(value.rawValue).font(.title3.bold()).foregroundStyle(Color.nexdoInk)
                Text(value == .calendar ? "Appointments, dates & scheduling" : "To-dos, priorities & progress")
                    .font(.subheadline).foregroundStyle(Color.nexdoSecondary).frame(maxWidth: .infinity, alignment: .leading)
                Text("10 questions").font(.caption.weight(.semibold)).foregroundStyle(tint(value))
            }.frame(maxWidth: .infinity, alignment: .leading).padding(16).helpCard()
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(category == value ? tint(value) : .clear, lineWidth: 2))
        }.buttonStyle(.plain).accessibilityAddTraits(category == value ? .isSelected : [])
    }
}
private extension View {
    func helpCard() -> some View {
        // The system card surface: white in light mode, dark grey in dark mode, where nexdoInk turns white.
        background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
            .shadow(color: Color.nexdoIndigo.opacity(0.04), radius: 10, y: 4)
    }
}
