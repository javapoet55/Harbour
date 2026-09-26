import SwiftUI

struct ShoppingAlternativesView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: ShoppingStore
    let original: GroceryItem
    let onReplace: (ShoppingAlternative) async -> Bool
    let onAdd: (ShoppingAlternative) async -> Bool
    let onFavorite: (String?) async -> Bool
    @State private var result: ShoppingAlternativesResponse?
    @State private var goal: ShoppingGoal?
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var retry = 0
    @State private var detail: AlternativePresentation?
    @State private var panel: AlternativesPanel?
    @State private var completed: ShoppingAlternative?
    @State private var savedReplacement: ShoppingAlternative?
    private var savedOriginal: GroceryItem { store.lists.flatMap(\.items).first { $0.id == original.id } ?? original }
    private var cartCount: Int { store.lists.first { $0.items.contains { $0.id == original.id } }?.items.count ?? 0 }
    private var visibleItems: [ShoppingAlternative] {
        let items = result?.alternatives ?? []
        return goal.map { value in items.filter { value.supported(by: $0, original: result?.originalFacts) } } ?? items
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    originalCard
                    HStack(alignment: .firstTextBaseline) {
                        Text("AI Recommended Alternatives").font(.subheadline.bold())
                        Spacer(minLength: 4)
                        Button { panel = .why } label: { Label("Why these?", systemImage: "lightbulb").font(.caption).fixedSize().frame(minHeight: 44).contentShape(Rectangle()) }
                            .buttonStyle(.plain).accessibilityIdentifier("alternatives.whyThese")
                    }
                    Text("Practical swaps based on the item in your list.").font(.caption).foregroundStyle(Color.nexdoSecondary).padding(.top, -4)
                    if loading { ProgressView("Finding useful alternatives…").frame(maxWidth: .infinity).padding() }
                    if let result {
                        goalChips
                        if let goal {
                            HStack {
                                Text(visibleItems.isEmpty ? "No verified matches for \(goal.rawValue.lowercased())." : "\(visibleItems.count) matches · \(goal.rawValue)")
                                    .font(.caption).accessibilityIdentifier("alternatives.goalStatus")
                                Spacer()
                                Button("Show all") { self.goal = nil }.font(.caption).frame(minHeight: 44).accessibilityIdentifier("alternatives.showAll")
                            }.foregroundStyle(Color.nexdoSecondary)
                        }
                        if visibleItems.isEmpty { emptyState(filtered: !result.alternatives.isEmpty) }
                        ForEach(visibleItems) { alternative in compactRow(alternative) }
                        Label("Always check the product label for the most current nutrition and allergen information.", systemImage: "lightbulb")
                            .font(.caption).foregroundStyle(Color.nexdoSecondary).padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading).background(Color.nexdoBlue.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                    }
                    if let error {
                        Text(error).font(.subheadline).foregroundStyle(.red).accessibilityIdentifier("alternatives.error")
                        Button("Try again") { retry += 1 }.frame(minHeight: 44)
                    }
                }.padding(16)
            }.background { AlternativesBackdrop() }
                .safeAreaInset(edge: .bottom) {
                    Button { dismiss() } label: { Label("View in Cart (\(cartCount))", systemImage: "cart").frame(maxWidth: .infinity) }
                        .buttonStyle(NexdoGradientButtonStyle()).accessibilityIdentifier("alternatives.cart")
                        .padding(16).background(.ultraThinMaterial)
                }
                .navigationTitle("Item Alternatives").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly).accessibilityLabel("Close alternatives") } }
                .foregroundStyle(Color.nexdoInk)
                .navigationDestination(isPresented: Binding(get: { detail != nil }, set: { if !$0 { detail = nil } })) {
                    if let presentation = detail {
                        ShoppingAlternativeDetails(original: original, originalFacts: result?.originalFacts, alternative: presentation.alternative, initialTab: presentation.tab,
                            onView: { track($0.event) }, onReplace: { panel = .confirm(presentation.alternative) },
                            onAdd: { await apply(presentation.alternative, add: true) }, failure: { error },
                            favorite: savedOriginal.favoriteAlternatives?.contains(presentation.alternative.id) == true,
                            onFavorite: { favorite(presentation.alternative.id) })
                    }
                }
        }
        .sheet(item: $panel, onDismiss: { if let savedReplacement { completed = savedReplacement; self.savedReplacement = nil } }) { value in
            switch value {
            case .goals: AlternativesGoalPicker(original: original, selected: goal) { goal = $0; track("alternative_goal_selected") }
            case .why: AlternativesWhyView()
            case .confirm(let item):
                replacementPanel(item)
            }
        }
        .fullScreenCover(item: $completed) { alternative in
            AlternativesSuccess(original: original.name, replacement: alternative.name) { completed = nil; dismiss() }
        }
        .task(id: retry) { await load() }
    }
    private var originalCard: some View {
        HStack(spacing: 12) {
            AlternativeArtwork(item: original).frame(width: 46, height: 50)
            VStack(alignment: .leading, spacing: 4) {
                Text(original.name).font(.headline)
                Text(original.amountLabel).font(.caption).foregroundStyle(Color.nexdoSecondary)
                Text("Original Item").font(.caption2.weight(.semibold)).foregroundStyle(Color.nexdoBlue).padding(.horizontal, 7).padding(.vertical, 3).background(Color.nexdoBlue.opacity(0.1), in: Capsule())
            }
            Spacer(); favoriteButton(nil, active: savedOriginal.favorite == true)
        }.padding(12).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
    }
    private var goalChips: some View {
        HStack(spacing: 4) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                ForEach([ShoppingGoal.lowerFat, .lowerSugar, .lowerCalorie]) { value in
                    Button { goal = goal == value ? nil : value; track("alternative_goal_selected") } label: {
                        Label(value.rawValue, systemImage: value.icon).font(.caption.weight(.medium)).padding(.horizontal, 10).frame(minHeight: 44)
                            .foregroundStyle(goal == value ? Color.white : Color.nexdoInk)
                            .background(goal == value ? Color.nexdoBlue : Color(uiColor: .secondarySystemGroupedBackground), in: Capsule())
                            .overlay(Capsule().stroke(Color.nexdoBlue.opacity(0.12)))
                    }.buttonStyle(.plain).accessibilityAddTraits(goal == value ? .isSelected : []).accessibilityIdentifier("alternatives.goal.\(value.rawValue)")
                }
                }
            }
                Button { panel = .goals } label: { Label("More", systemImage: "ellipsis").font(.caption).padding(.horizontal, 10).frame(minHeight: 44).background(.thinMaterial, in: Capsule()) }
                    .buttonStyle(.plain).accessibilityIdentifier("alternatives.moreGoals")
        }
    }
    private func compactRow(_ item: ShoppingAlternative) -> some View {
        HStack(spacing: 10) {
            Button { show(item) } label: { AlternativeArtwork(item: item.groceryItem, productImageURL: item.facts?.imageURL).frame(width: 56, height: 68) }
                .buttonStyle(.plain).accessibilityLabel("View \(item.name)")
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .top, spacing: 0) {
                    Button { show(item) } label: { Text(item.name).font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).multilineTextAlignment(.leading) }
                        .buttonStyle(.plain).accessibilityIdentifier("alternatives.details.\(item.name)")
                    favoriteButton(item.id, active: savedOriginal.favoriteAlternatives?.contains(item.id) == true)
                    Button { panel = .confirm(item) } label: { Label("Replace", systemImage: "arrow.left.arrow.right").font(.caption2.weight(.semibold)).padding(.horizontal, 7).frame(minHeight: 44).background(Color.nexdoBlue.opacity(0.09), in: Capsule()) }
                        .buttonStyle(.plain).accessibilityIdentifier("alternatives.select.\(item.name)")
                }
                let labels = ShoppingGoal.allCases.filter { $0.supported(by: item, original: result?.originalFacts) }.prefix(2).map(\.rawValue)
                Label(labels.isEmpty ? "Suggested alternative" : labels.joined(separator: " · "), systemImage: "leaf.fill").font(.caption2).foregroundStyle(.green)
                HStack(alignment: .bottom) {
                    if let facts = item.facts, facts.hasSource, let nutrition = facts.nutrition {
                        Text(nutritionSummary(nutrition) + " · per " + nutrition.servingSize).font(.caption2).foregroundStyle(Color.nexdoSecondary)
                    } else { Text("Nutrition details unavailable").font(.caption2).foregroundStyle(Color.nexdoSecondary) }
                    Spacer(minLength: 0)
                    Button { show(item) } label: { Image(systemName: "chevron.right").font(.caption).frame(width: 32, height: 44) }.buttonStyle(.plain).accessibilityLabel("Details for \(item.name)")
                }
            }
        }.padding(10).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.nexdoBlue.opacity(0.06)))
    }
    private func favoriteButton(_ id: String?, active: Bool) -> some View {
        Button { favorite(id) } label: { Image(systemName: active ? "star.fill" : "star").font(.body).foregroundStyle(Color.nexdoBlue).frame(width: 44, height: 44) }
            .buttonStyle(.plain).disabled(saving).accessibilityLabel(active ? "Remove favorite" : "Add favorite").accessibilityIdentifier("alternatives.favorite.\(id ?? "original")")
    }
    private func favorite(_ id: String?) {
        Task { saving = true; defer { saving = false }; if !(await onFavorite(id)) { error = store.error ?? "Couldn’t save favorite. Please try again." } }
    }
    private func show(_ item: ShoppingAlternative) { detail = .init(alternative: item, tab: .why); track("alternative_viewed") }
    private func emptyState(filtered: Bool) -> some View {
        VStack(spacing: 16) {
            ZStack { Circle().fill(Color.nexdoBlue.opacity(0.08)).frame(width: 140, height: 140); Image(systemName: "magnifyingglass").font(.system(size: 72)).foregroundStyle(Color.nexdoBlue.opacity(0.25)); AlternativeArtwork(item: original).frame(width: 75, height: 85).offset(x: 30, y: 15) }.padding(.top, 20)
            Text(filtered ? "No matching alternatives yet" : "No alternatives found yet").font(.title3.bold())
            Text(filtered ? "Try another goal or view all suggestions. We only show matches supported by available product data." : "We’re working on finding the best alternatives for this item. Please check back later.").font(.subheadline).foregroundStyle(Color.nexdoSecondary).multilineTextAlignment(.center)
            Button(filtered ? "Show all alternatives" : "OK") { if filtered { goal = nil } else { dismiss() } }.buttonStyle(.bordered).frame(minHeight: 44)
        }.frame(maxWidth: .infinity).padding(20).accessibilityIdentifier("alternatives.empty")
    }
    private func replacementPanel(_ item: ShoppingAlternative) -> some View {
        VStack(spacing: 18) {
            Spacer(minLength: 12)
            Image(systemName: "arrow.left.arrow.right").font(.largeTitle).foregroundStyle(Color.nexdoBlue).frame(width: 78, height: 78).background(Color.nexdoBlue.opacity(0.08), in: Circle())
            Text("Replace item?").font(.title2.bold())
            Text("Replace “\(original.name)” with “\(item.name)”? ").foregroundStyle(Color.nexdoSecondary).multilineTextAlignment(.center)
            VStack(spacing: 10) {
                replacementItem(original)
                Image(systemName: "arrow.down").foregroundStyle(Color.nexdoBlue)
                replacementItem(item.groceryItem)
            }.modifier(AlternativeCardSurface())
            if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("alternative.saveError") }
            Button { Task { await apply(item, add: false) } } label: { Text(saving ? "Replacing…" : "Replace").frame(maxWidth: .infinity) }.buttonStyle(AlternativeBlueButtonStyle()).disabled(saving).accessibilityIdentifier("alternatives.confirm")
            Button("Cancel") { panel = nil; error = nil }.frame(minHeight: 44).disabled(saving)
            Spacer(minLength: 12)
        }.padding(24).background { AlternativesBackdrop() }.foregroundStyle(Color.nexdoInk).interactiveDismissDisabled(saving)
    }
    private func replacementItem(_ item: GroceryItem) -> some View {
        HStack(spacing: 14) { AlternativeArtwork(item: item).frame(width: 58, height: 62); VStack(alignment: .leading) { Text(item.name).font(.headline); Text(original.amountLabel).font(.caption).foregroundStyle(Color.nexdoSecondary) }; Spacer() }
    }
    @MainActor private func apply(_ item: ShoppingAlternative, add: Bool) async {
        guard !saving else { return }; saving = true; error = nil; defer { saving = false }
        if await (add ? onAdd(item) : onReplace(item)) {
            track(add ? "alternative_added_instead" : "alternative_replaced")
            if add { panel = nil; dismiss() } else { savedReplacement = item; panel = nil }
        } else { error = store.error ?? "Couldn’t save this change. Please try again." }
    }
    private func track(_ event: String) { NexdoAnalytics.logEvent(event, parameters: ["original_category": original.category, "goal": goal?.rawValue ?? "All"]) }
    @MainActor private func load() async {
        loading = true; error = nil; defer { loading = false }
        do { result = try await store.alternatives(for: original, refresh: retry > 0); try Task.checkCancellation(); track("shopping_alternatives_opened") }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}
private enum AlternativesPanel: Identifiable {
    case goals, why, confirm(ShoppingAlternative)
    var id: String {
        switch self {
        case .goals: "goals"
        case .why: "why"
        case .confirm(let item): "confirm-" + item.id
        }
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
    [ShoppingNutrient.calories, .protein, .totalFat, .carbohydrates].compactMap { nutrient in nutrient.value(facts).map { "\($0.rounded().formatted(.number.precision(.fractionLength(0))))\(nutrient.unit) \(nutrient == .calories ? "cal" : nutrient == .totalFat ? "fat" : nutrient == .carbohydrates ? "carbs" : "protein")" } }.joined(separator: " · ")
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
            else if item.imageData == nil, item.name.lowercased().contains("bread") { BreadPackArtwork(name: item.name) }
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
    var favorite = false
    var onFavorite: () -> Void = {}
    @State private var tab: AlternativeTab = .nutrition
    @State private var showingFoodVoice = false
    @State private var showingNutritionInfo = false
    @State private var sortColumn: ShoppingNutritionSortColumn?
    @State private var sortAscending = false
    @ScaledMetric(relativeTo: .caption) private var nutritionTableFontSize: CGFloat = 13.2
    private let nutritionInfo = "Values are based on available food-provider data. Actual products may vary. Always check the product label."
    @State private var saving = false
    @State private var error: String?
    private var comparison: ShoppingComparison { .init(original: originalFacts, alternative: alternative.facts) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                itemHeader
                Button { showingFoodVoice = true } label: {
                    Label("Ask AI about this item", systemImage: "sparkles").font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 48)
                        .foregroundStyle(.white).background(NexdoTheme.gradient, in: RoundedRectangle(cornerRadius: 16))
                }.buttonStyle(.plain).accessibilityIdentifier("alternative.askAI")
                nutrition
                DisclosureGroup("Allergens & dietary information") { allergens.padding(.top, 12) }
                    .accessibilityIdentifier("alternative.tab.Allergens")
                DisclosureGroup("Best for") { bestFor.padding(.top, 12) }
                    .accessibilityIdentifier("alternative.tab.Best For")
                if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("alternative.saveError") }
                VStack(spacing: 10) {
                    Button { perform(add: false) } label: { Text("Replace with this item").frame(maxWidth: .infinity) }
                        .buttonStyle(AlternativeBlueButtonStyle()).accessibilityIdentifier("alternative.detail.replace")
                    Button("Add to Cart Instead") { perform(add: true) }.font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                        .accessibilityIdentifier("alternative.detail.add")
                    if saving { ProgressView("Saving…") }
                }.disabled(saving)
            }.padding(18)
        }
        .background(Color(uiColor: .systemBackground))
        .navigationTitle("Item Details").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(action: onFavorite) { Image(systemName: favorite ? "star.fill" : "star") }.accessibilityLabel(favorite ? "Remove favorite" : "Add favorite") } }
        .foregroundStyle(Color.nexdoInk).tint(.nexdoBlue)
        .fullScreenCover(isPresented: $showingFoodVoice) {
            AddTaskByVoiceView(askMode: true, foodContext: FoodVoiceContext(
                original: .init(name: original.name, brand: original.brand, barcode: original.barcode),
                alternative: .init(name: alternative.name, brand: alternative.facts?.brand, barcode: alternative.facts?.barcode)))
        }
        .alert("About Nutrition Facts", isPresented: $showingNutritionInfo) {
            Button("Got it", role: .cancel) {}
        } message: { Text(nutritionInfo) }
        .onAppear { onView(.nutrition) }
    }
    private var itemHeader: some View {
        VStack(spacing: 12) {
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
            layout {
                comparisonCard(item: original, facts: originalFacts, source: true)
                comparisonCard(item: alternative.groceryItem, facts: alternative.facts, source: false)
            }
            .overlay {
                Text("VS").font(.caption.bold()).foregroundStyle(Color.nexdoIndigo)
                    .frame(width: 34, height: 34).background(Color(uiColor: .systemBackground), in: Circle())
                    .overlay(Circle().stroke(Color.nexdoIndigo.opacity(0.12)))
                    .accessibilityHidden(true)
            }
            if originalFacts?.matchQuality == "representative_generic" || alternative.facts?.matchQuality == "representative_generic" {
                Text("Representative food — not an exact product.").font(.caption).foregroundStyle(Color.nexdoSecondary)
            }
        }
    }
    private func comparisonCard(item: GroceryItem, facts: ShoppingProductFacts?, source: Bool) -> some View {
        VStack(spacing: 10) {
            Text(source ? "Your item" : "Alternative").font(.caption.weight(.semibold))
                .foregroundStyle(source ? Color.nexdoBlue : Color.nexdoIndigo)
            AlternativeArtwork(item: item, productImageURL: facts?.imageURL)
                .frame(height: 100).accessibilityHidden(true)
            Text(item.name).font(.subheadline.bold()).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: typeSize.isAccessibilitySize ? 0 : 44)
                .accessibilityIdentifier(source ? "alternative.originalName" : "alternative.targetName")
            let calories = source ? ShoppingNutrient.calories.value(comparison.original) : comparison.alternativeValue(.calories)
            Text(calories.map { value($0, nutrient: .calories) + " cal" } ?? "Calories unavailable")
                .font(.headline).multilineTextAlignment(.center)
            if let serving = comparison.original?.servingSize {
                Text("Per \(serving)").font(.caption).foregroundStyle(Color.nexdoSecondary)
            }
        }.padding(14).frame(maxWidth: .infinity)
            .background(Color.nexdoBlue.opacity(0.025), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.nexdoIndigo.opacity(0.12)))
    }
    private func sortHeader(_ column: ShoppingNutritionSortColumn, width: CGFloat) -> some View {
        Button {
            if sortColumn == column { sortAscending.toggle() }
            else { sortColumn = column; sortAscending = false }
        } label: {
            VStack(spacing: 2) {
                Text(column.rawValue).lineLimit(1).fixedSize()
                Image(systemName: sortColumn == column ? (sortAscending ? "arrow.up" : "arrow.down") : "arrow.up.arrow.down")
                    .font(.caption2).foregroundStyle(Color.nexdoBlue)
            }.font(.system(size: nutritionTableFontSize, weight: .semibold))
                .padding(.horizontal, 6).frame(minWidth: width, minHeight: 48, alignment: .leading)
        }.buttonStyle(.plain)
            .accessibilityLabel("Sort by " + column.rawValue)
            .accessibilityValue(sortColumn == column ? (sortAscending ? "Low to high" : "High to low") : "Not sorted")
            .accessibilityIdentifier("alternative.sort." + column.rawValue)
    }
    private var nutrition: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text("Nutrition Facts").font(.title3.bold())
                Button { showingNutritionInfo = true } label: {
                    Image(systemName: "info.circle").font(.body).frame(width: 44, height: 44)
                }.buttonStyle(.plain).foregroundStyle(Color.nexdoBlue)
                    .accessibilityLabel("About nutrition data")
                    .accessibilityIdentifier("alternative.nutritionInfo")
            }
            if let serving = comparison.original?.servingSize { Text("Per \(serving)").font(.caption).foregroundStyle(Color.nexdoSecondary) }
            if comparison.original == nil || comparison.alternative == nil { Text("Nutrition details unavailable").font(.subheadline).foregroundStyle(Color.nexdoSecondary) }
            if comparison.factor == nil, comparison.original != nil, comparison.alternative != nil {
                Text("Serving sizes cannot be matched. Differences are unavailable.").font(.caption)
            }
            if let sortColumn {
                HStack {
                    Text("\(sortColumn.rawValue): \(sortAscending ? "low to high" : "high to low")")
                    Spacer()
                    Button("Reset") { self.sortColumn = nil }
                }.font(.caption).foregroundStyle(Color.nexdoSecondary)
                Text("Sorted by displayed numbers; units vary by nutrient.").font(.caption2).foregroundStyle(Color.nexdoSecondary)
            }
            ScrollView(.horizontal, showsIndicators: true) {
                Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                    GridRow {
                        tableCell("Nutrient", width: 100, header: true)
                        sortHeader(.original, width: 76)
                        sortHeader(.alternative, width: 82)
                        sortHeader(.difference, width: 82)
                    }.background(Color.nexdoBlue.opacity(0.06))
                    ForEach(comparison.sortedNutrients(by: sortColumn, ascending: sortAscending)) { nutrient in
                        GridRow {
                            tableCell(nutrient.rawValue, width: 100)
                            tableCell(value(nutrient.value(comparison.original), nutrient: nutrient), width: 76)
                            tableCell(value(comparison.alternativeValue(nutrient), nutrient: nutrient), width: 82)
                            Text(difference(nutrient)).font(.system(size: nutritionTableFontSize, weight: .semibold)).foregroundStyle(differenceColor(nutrient))
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                                .padding(.vertical, 8).frame(minWidth: 82, maxWidth: .infinity, alignment: .center)
                                .background(differenceColor(nutrient).opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
                        }.overlay(alignment: .bottom) { Rectangle().fill(Color.nexdoBlue.opacity(0.1)).frame(height: 0.5) }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }
    private func tableCell(_ text: String, width: CGFloat, header: Bool = false) -> some View {
        Text(text).font(.system(size: nutritionTableFontSize, weight: header ? .semibold : .regular))
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, 6)
            .frame(minWidth: width, alignment: .leading).frame(minHeight: 44)
    }
    private func differenceColor(_ nutrient: ShoppingNutrient) -> Color {
        switch comparison.difference(nutrient) {
        case .lower where [.saturatedFat, .sugar, .sodium].contains(nutrient): return .green
        case .higher where [.protein, .fiber].contains(nutrient): return .green
        case .higher where [.saturatedFat, .sugar, .sodium].contains(nutrient): return .red
        default: return .nexdoBlue
        }
    }
    private func value(_ value: Double?, nutrient: ShoppingNutrient) -> String { value.map { $0.rounded().formatted(.number.precision(.fractionLength(0))) + (nutrient.unit.isEmpty ? "" : " " + nutrient.unit) } ?? "—" }
    private func difference(_ nutrient: ShoppingNutrient) -> String {
        switch comparison.difference(nutrient) {
        case .lower(let amount): "↓ " + value(amount, nutrient: nutrient)
        case .higher(let amount): "↑ " + value(amount, nutrient: nutrient)
        case .same: "= Same"
        case .unknown: "—"
        }
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
