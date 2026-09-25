import SwiftUI

struct ShoppingAlternativesView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: ShoppingStore
    let original: GroceryItem
    let onReplace: (ShoppingAlternative) async -> Bool
    let onAdd: (ShoppingAlternative) async -> Bool
    let onFavorite: (String?) async -> Bool
    @State private var result: ShoppingAlternativesResponse?
    @State private var selectedID: String?
    @State private var goal: ShoppingGoal = .lowerFat
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var retry = 0
    @State private var detail: AlternativePresentation?
    private var selected: ShoppingAlternative? { result?.alternatives.first { $0.id == selectedID } }
    private var savedOriginal: GroceryItem { store.lists.flatMap(\.items).first { $0.id == original.id } ?? original }
    private var ranked: [ShoppingAlternative] { goal.ranked(result?.alternatives ?? [], original: result?.originalFacts) }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    originalCard
                    Text("AI Recommended Alternatives").font(.title2.bold())
                    Text("Practical swaps based on the item in your list.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    if loading { ProgressView("Finding useful alternatives…").frame(maxWidth: .infinity).padding() }
                    if let result {
                        goalPicker
                        if !result.alternatives.contains(where: { goal.supported(by: $0, original: result.originalFacts) }) {
                            Text("No verified matches for this goal yet. Showing other suggested swaps; check product labels.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        }
                        ForEach(ranked) { alternative in alternativeCard(alternative) }
                        if ranked.isEmpty { Text("No alternatives available for this item yet.") }
                    }
                    if let error {
                        Text(error).foregroundStyle(.red).accessibilityIdentifier("alternatives.error")
                        if result == nil { Button("Try again") { retry += 1 } }
                    }
                }.padding(18)
            }.background { TodayBackdrop() }
                .safeAreaInset(edge: .bottom) { actionBar }
                .navigationTitle("Item Alternatives").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly).accessibilityLabel("Close alternatives") } }
                .foregroundStyle(Color.nexdoInk)
                .disabled(saving)
                .sheet(item: $detail) { presentation in
                    ShoppingAlternativeDetails(original: original, originalFacts: result?.originalFacts, alternative: presentation.alternative, initialTab: presentation.tab, onView: { tab in track(tab.event, alternative: presentation.alternative) }, onReplace: { await apply(presentation.alternative, add: false) }, onAdd: { await apply(presentation.alternative, add: true) }, failure: { error })
                }
        }.task(id: retry) { await load() }
    }
    private var originalCard: some View {
        HStack(spacing: 14) {
            AlternativeArtwork(item: original).frame(width: 58, height: 80)
            VStack(alignment: .leading, spacing: 6) {
                Text(original.name).font(.headline)
                Text(original.amountLabel).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                Text("Original Item").font(.caption.bold()).foregroundStyle(Color.nexdoBlue).padding(6).background(Color.nexdoBlue.opacity(0.1), in: Capsule())
            }
            Spacer()
            favoriteButton(nil, active: savedOriginal.favorite == true)
        }.modifier(AlternativeCardSurface())
    }
    private var goalPicker: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("What are you looking for?", systemImage: "sparkles").font(.headline)
            ViewThatFits(in: .horizontal) {
                goalGrid(minimum: 118)
                goalGrid(minimum: 150)
            }
        }.modifier(AlternativeCardSurface())
    }
    private func goalGrid(minimum: CGFloat) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: minimum))], spacing: 8) {
            ForEach(ShoppingGoal.allCases) { value in
                Button { goal = value; track("alternative_goal_selected") } label: {
                    Text(value.rawValue).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(goal == value ? Color.white : Color.nexdoInk)
                        .background(goal == value ? Color.nexdoBlue : Color.nexdoBlue.opacity(0.05), in: Capsule())
                        .overlay(Capsule().stroke(Color.nexdoIndigo.opacity(0.18)))
                }.buttonStyle(.plain).accessibilityAddTraits(goal == value ? .isSelected : [])
                    .accessibilityIdentifier("alternatives.goal.\(value.rawValue)")
            }
        }
    }
    private func alternativeCard(_ alternative: ShoppingAlternative) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Button { show(alternative, tab: .nutrition) } label: { AlternativeArtwork(item: alternative.groceryItem, productImageURL: alternative.facts?.imageURL).frame(width: 58, height: 88) }.buttonStyle(.plain).accessibilityLabel("View \(alternative.name)")
                VStack(alignment: .leading, spacing: 6) {
                    Button { show(alternative, tab: .nutrition) } label: { Text(alternative.name).font(.headline).frame(minHeight: 44, alignment: .leading) }.buttonStyle(.plain)
                    Label(goal.supported(by: alternative, original: result?.originalFacts) ? goal.rawValue : "Suggested alternative", systemImage: "leaf.fill").font(.caption).foregroundStyle(Color.green)
                    if let facts = alternative.facts, facts.hasSource, let nutrition = facts.nutrition {
                        Text(nutritionSummary(nutrition)).font(.caption)
                        Text("Per \(nutrition.servingSize)").font(.caption2).foregroundStyle(Color.nexdoSecondary)
                        if let label = facts.matchLabel { Text(label).font(.caption2).foregroundStyle(Color.nexdoSecondary) }
                    }
                    if !alternative.usages.isEmpty { Text("Best for: " + alternative.usages.joined(separator: " · ")).font(.caption).foregroundStyle(Color.nexdoIndigo) }
                }
                Spacer(minLength: 0)
                favoriteButton(alternative.id, active: savedOriginal.favoriteAlternatives?.contains(alternative.id) == true)
            }
            HStack {
                VStack(alignment: .leading) {
                    if let price = alternative.facts?.priceLabel { Text(price).font(.subheadline.bold()) }
                    Text(alternative.groceryItem.amountLabel).font(.caption).foregroundStyle(Color.nexdoSecondary)
                }
                Spacer()
                Button {
                    selectedID = alternative.id; track("alternative_selected", alternative: alternative)
                } label: { Label(selectedID == alternative.id ? "Selected" : "Replace", systemImage: selectedID == alternative.id ? "checkmark" : "arrow.left.arrow.right").font(.subheadline.bold()).padding(.horizontal, 12).frame(minHeight: 44) }
                    .buttonStyle(.bordered).tint(.nexdoBlue).accessibilityIdentifier("alternatives.select.\(alternative.name)")
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { detailButtons(alternative) }
                VStack(alignment: .leading, spacing: 8) { detailButtons(alternative) }
            }
        }.modifier(AlternativeCardSurface())
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(selectedID == alternative.id ? Color.nexdoBlue : .clear, lineWidth: 1.5))
    }
    @ViewBuilder private func detailButtons(_ item: ShoppingAlternative) -> some View {
        ForEach([AlternativeTab.nutrition, .allergens, .why]) { tab in
            Button { show(item, tab: tab) } label: { Label(tab.rawValue, systemImage: tab.icon).font(.caption).frame(minHeight: 44) }
                .buttonStyle(.bordered).tint(.nexdoBlue).accessibilityIdentifier("alternatives.\(tab.id).\(item.name)")
        }
    }
    private func favoriteButton(_ id: String?, active: Bool) -> some View {
        Button { Task { saving = true; defer { saving = false }; if !(await onFavorite(id)) { error = store.error ?? "Couldn’t save favorite. Please try again." } } } label: {
            Image(systemName: active ? "star.fill" : "star").font(.title3).foregroundStyle(Color.nexdoBlue).frame(width: 44, height: 44)
        }.buttonStyle(.plain).accessibilityLabel(active ? "Remove favorite" : "Add favorite")
            .accessibilityIdentifier("alternatives.favorite.\(id ?? "original")")
    }
    private var actionBar: some View {
        VStack(spacing: 4) {
            if let selected {
                Button { Task { await apply(selected, add: false) } } label: { Text("Replace with \(selected.name)").font(.headline).frame(maxWidth: .infinity) }.buttonStyle(NexdoGradientButtonStyle()).accessibilityIdentifier("alternatives.confirm")
                Button("Add to Cart Instead") { Task { await apply(selected, add: true) } }.frame(minHeight: 44).accessibilityIdentifier("alternatives.add")
            } else {
                Button { dismiss() } label: { Label("View in Cart", systemImage: "cart").frame(maxWidth: .infinity) }.buttonStyle(NexdoGradientButtonStyle())
            }
            if saving { ProgressView("Saving…") }
        }.padding(.horizontal, 18).padding(.vertical, 8).background(.ultraThinMaterial)
    }
    private func show(_ alternative: ShoppingAlternative, tab: AlternativeTab) {
        track("alternative_viewed", alternative: alternative)
        detail = .init(alternative: alternative, tab: tab)
    }
    @MainActor private func apply(_ alternative: ShoppingAlternative, add: Bool) async {
        guard !saving else { return }; saving = true; error = nil; defer { saving = false }
        let success = add ? await onAdd(alternative) : await onReplace(alternative)
        if success { track(add ? "alternative_added_instead" : "alternative_replaced", alternative: alternative); detail = nil; dismiss() }
        else { error = store.error ?? "Couldn’t save this change. Please try again." }
    }
    private func track(_ event: String, alternative: ShoppingAlternative? = nil) {
        NexdoAnalytics.logEvent(event, parameters: ["original_category": original.category, "alternative_category": alternative?.category ?? "", "goal": goal.rawValue, "source": result?.usedAI == true ? "ai_suggestion" : "curated_suggestion"])
    }
    @MainActor private func load() async {
        loading = true; error = nil; defer { loading = false }
        do { let response = try await store.alternatives(for: original); try Task.checkCancellation(); result = response; track("shopping_alternatives_opened") }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

struct AlternativeCardSurface: ViewModifier {
    func body(content: Content) -> some View {
        content.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.nexdoIndigo.opacity(0.1)))
            .shadow(color: Color.nexdoIndigo.opacity(0.04), radius: 8, y: 3)
    }
}
private func nutritionSummary(_ facts: ShoppingNutrition) -> String {
    [ShoppingNutrient.calories, .protein, .totalFat].compactMap { nutrient in nutrient.value(facts).map { "\($0.formatted())\(nutrient.unit) \(nutrient == .calories ? "cal" : nutrient.rawValue.lowercased())" } }.joined(separator: " · ")
}
struct AlternativePresentation: Identifiable {
    let id = UUID()
    let alternative: ShoppingAlternative
    let tab: AlternativeTab
}
enum AlternativeTab: String, CaseIterable, Identifiable {
    case nutrition = "Nutrition", allergens = "Allergens", why = "Why this?", bestFor = "Best For"
    var id: String { rawValue }
    var icon: String { switch self { case .nutrition: "chart.bar.fill"; case .allergens: "checkmark.shield"; case .why: "lightbulb"; case .bestFor: "fork.knife" } }
    var event: String { switch self { case .nutrition: "nutrition_comparison_viewed"; case .allergens: "allergen_info_viewed"; case .why: "why_swap_viewed"; case .bestFor: "best_for_viewed" } }
}

/// Illustrations from the supplied pack are category artwork, not brand/package evidence.
struct AlternativeArtwork: View {
    let item: GroceryItem
    var productImageURL: String? = nil
    private var asset: String? {
        let name = item.name.lowercased()
        if name.contains("half-and-half") { return "swap-half" }
        guard name.contains("milk"), !["oat", "soy", "almond", "coconut", "plant"].contains(where: name.contains) else { return nil }
        if name.contains("lactose") { return "swap-lactosefree" }
        if name.contains("2%") || name.contains("low-fat") { return "swap-2percent" }
        if name.contains("1%") { return "swap-1percent" }
        return "swap-whole"
    }
    var body: some View {
        Group {
            if item.imageData == nil, let value = productImageURL, let url = URL(string: value), url.scheme == "https", url.host == "images.openfoodfacts.org" {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFit() }
                    else { illustration }
                }
            } else { illustration }
        }.accessibilityHidden(true)
    }
    private var illustration: some View {
        Group {
            if let asset, item.imageData == nil { Image(asset).resizable().scaledToFit() }
            else { GroceryArtwork(item: item) }
        }.accessibilityHidden(true)
    }
}

struct ShoppingAlternativeDetails: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    let original: GroceryItem
    let originalFacts: ShoppingProductFacts?
    let alternative: ShoppingAlternative
    let initialTab: AlternativeTab
    let onView: (AlternativeTab) -> Void
    let onReplace: () async -> Void
    let onAdd: () async -> Void
    let failure: () -> String?
    @State private var tab: AlternativeTab = .nutrition
    @State private var saving = false
    @State private var error: String?
    private var comparison: ShoppingComparison { .init(original: originalFacts, alternative: alternative.facts) }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(spacing: 18) {
                        AlternativeArtwork(item: alternative.groceryItem, productImageURL: alternative.facts?.imageURL).frame(width: 76, height: 114)
                        VStack(alignment: .leading, spacing: 8) {
                            Text(alternative.name).font(.title2.bold())
                            Text(alternative.groceryItem.amountLabel).font(.subheadline)
                            Label("Recommended Alternative", systemImage: "sparkles").font(.caption).foregroundStyle(Color.nexdoBlue)
                            if let price = alternative.facts?.priceLabel { Text(price).font(.headline) }
                        }
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(AlternativeTab.allCases) { value in
                                Button { tab = value; onView(value) } label: {
                                    Label(value.rawValue, systemImage: value.icon).font(.subheadline.weight(.semibold)).padding(.horizontal, 12).frame(minHeight: 44)
                                        .background(tab == value ? Color.nexdoBlue.opacity(0.12) : Color.clear, in: Capsule())
                                }.buttonStyle(.plain).foregroundStyle(tab == value ? Color.nexdoBlue : Color.nexdoSecondary)
                                    .accessibilityAddTraits(tab == value ? .isSelected : []).accessibilityIdentifier("alternative.tab.\(value.rawValue)")
                            }
                        }
                    }
                    switch tab {
                    case .nutrition: nutrition; reasonCard
                    case .allergens: allergens
                    case .why: reasonCard
                    case .bestFor: bestFor
                    }
                    if let facts = alternative.facts, facts.hasSource {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Product source: \(facts.source)")
                            if let label = facts.matchLabel { Text(label) }
                            if let name = facts.name { Text("Source food: \(name)") }
                            if facts.freshness == "stale" { Text("Cached data — refresh pending") }
                            if let updated = facts.lastUpdated { Text("Updated: \(updated)") }
                            if let value = facts.sourceURL, let url = URL(string: value), url.scheme == "https" { Link("View product source", destination: url) }
                        }.font(.caption).foregroundStyle(Color.nexdoSecondary)
                    }
                    if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("alternative.saveError") }
                }.padding(18)
            }.background { TodayBackdrop(subtle: true) }
                .safeAreaInset(edge: .bottom) {
                    VStack(spacing: 4) {
                        Button { perform(add: false) } label: { Text("Replace with \(alternative.name)").font(.headline).frame(maxWidth: .infinity) }.buttonStyle(NexdoGradientButtonStyle()).accessibilityIdentifier("alternative.detail.replace")
                        Button("Add to Cart Instead") { perform(add: true) }.frame(minHeight: 44).accessibilityIdentifier("alternative.detail.add")
                        if saving { ProgressView("Saving…") }
                    }.padding(16).background(.ultraThinMaterial).disabled(saving)
                }
                .navigationTitle("Alternative Details").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
                .foregroundStyle(Color.nexdoInk)
        }.onAppear { tab = initialTab; onView(tab) }.interactiveDismissDisabled(saving)
    }
    private var nutrition: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Nutrition Comparison").font(.title3.bold())
            if comparison.original == nil || comparison.alternative == nil { Text("Nutrition details unavailable").foregroundStyle(Color.nexdoSecondary) }
            if let original = comparison.original { Text("Per \(original.servingSize)").font(.subheadline) }
            if let source = originalFacts, let label = source.matchLabel { Text("Original: \(source.name ?? original.name) · \(source.source) · \(label)").font(.caption).foregroundStyle(Color.nexdoSecondary) }
            if comparison.factor == nil, comparison.original != nil, comparison.alternative != nil {
                Text("Serving sizes cannot be matched. Differences are unavailable.").font(.caption)
            }
            ForEach(ShoppingNutrient.allCases.filter { $0.value(comparison.original) != nil || $0.value(comparison.alternative) != nil }) { nutrient in
                VStack(alignment: .leading, spacing: 6) {
                    Text(nutrient.rawValue).font(.subheadline.bold())
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .top) { nutrientValues(nutrient) }
                        VStack(alignment: .leading, spacing: 8) { nutrientValues(nutrient) }
                    }
                }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.nexdoBlue.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityElement(children: .combine)
            }
        }.accessibilityIdentifier("alternative.nutrition")
    }
    @ViewBuilder private func nutrientValues(_ nutrient: ShoppingNutrient) -> some View {
        VStack(alignment: .leading) { Text(original.name).font(.caption); Text(value(nutrient.value(comparison.original), nutrient: nutrient)) }
            .frame(maxWidth: .infinity, alignment: .leading)
        VStack(alignment: .leading) { Text(alternative.name).font(.caption); Text(value(comparison.alternativeValue(nutrient), nutrient: nutrient)) }
            .frame(maxWidth: .infinity, alignment: .leading)
        Text(difference(nutrient)).font(.subheadline.weight(.semibold)).frame(minWidth: 65, alignment: .trailing)
    }
    private func value(_ value: Double?, nutrient: ShoppingNutrient) -> String { value.map { $0.formatted(.number.precision(.fractionLength(0...2))) + (nutrient.unit.isEmpty ? "" : " " + nutrient.unit) } ?? "—" }
    private func difference(_ nutrient: ShoppingNutrient) -> String {
        switch comparison.difference(nutrient) {
        case .lower(let amount): "↓ " + value(amount, nutrient: nutrient)
        case .higher(let amount): "↑ " + value(amount, nutrient: nutrient)
        case .same: "= Same"
        case .unknown: "—"
        }
    }
    private var reasonCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Why NexDo suggested this", systemImage: "leaf.fill").font(.headline)
            Text(alternative.whyThisSwap ?? alternative.explanation(comparedTo: originalFacts)).font(.subheadline)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 20))
            .accessibilityIdentifier("alternative.reason")
    }
    private var allergens: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Allergen & Dietary Info").font(.title3.bold())
            let labels = alternative.facts?.allergenLabels ?? []
            if labels.isEmpty { Text("Allergen information unavailable — check product label.") }
            ForEach(labels, id: \.self) { label in Label(label, systemImage: "info.circle").padding(8).background(Color.nexdoBlue.opacity(0.08), in: Capsule()) }
            if alternative.facts?.hasSource == true {
                ForEach(alternative.facts?.mayContain ?? [], id: \.self) { label in Label("May contain \(label)", systemImage: "exclamationmark.circle").font(.subheadline) }
                if let ingredients = alternative.facts?.ingredientText, !ingredients.isEmpty {
                    Text("Ingredients").font(.headline)
                    Text(ingredients).font(.subheadline)
                } else { Text("Ingredient information unavailable").font(.caption).foregroundStyle(Color.nexdoSecondary) }
            }
            if alternative.facts?.hasSource == true {
                ForEach(alternative.facts?.dietary ?? [], id: \.self) { label in Label(label, systemImage: "leaf").font(.subheadline) }
            }
            Text("Always check the product label for the most current ingredient and allergen information. Product formulations may change.").font(.caption).foregroundStyle(Color.nexdoSecondary)
        }.accessibilityIdentifier("alternative.allergens")
    }
    private var bestFor: some View {
        VStack(alignment: .leading, spacing: 14) {
            if alternative.usages.isEmpty { Text("Usage recommendations unavailable") }
            else {
                Text("Best for").font(.title3.bold())
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 16) {
                    ForEach(alternative.usages, id: \.self) { usage in
                        VStack(spacing: 8) {
                            Image(systemName: usageIcon(usage)).font(.title2).foregroundStyle(Color.nexdoBlue).frame(width: 54, height: 54).background(Color.nexdoBlue.opacity(0.1), in: Circle())
                            Text(usage).font(.subheadline)
                        }.accessibilityElement(children: .combine)
                    }
                }
                Text("General culinary suggestions; suitability varies by product and recipe.").font(.caption).foregroundStyle(Color.nexdoSecondary)
            }
        }.accessibilityIdentifier("alternative.bestFor")
    }
    private func usageIcon(_ usage: String) -> String {
        switch usage.lowercased() { case "coffee": "cup.and.saucer"; case "cereal": "bowl"; case "cooking": "frying.pan"; case "baking": "birthday.cake"; case "smoothies": "takeoutbag.and.cup.and.straw"; default: "fork.knife" }
    }
    private func perform(add: Bool) {
        guard !saving else { return }; saving = true
        Task { if add { await onAdd() } else { await onReplace() }; error = failure(); saving = false }
    }
}
