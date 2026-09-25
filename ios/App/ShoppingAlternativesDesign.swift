import SwiftUI

struct AlternativesBackdrop: View {
    var body: some View {
        LinearGradient(colors: [Color(uiColor: .systemBackground), Color.nexdoBlue.opacity(0.06), Color.pink.opacity(0.05)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
    }
}
struct AlternativeBlueButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.headline).foregroundStyle(.white).padding(.horizontal, 16).frame(minHeight: 52)
            .background(Color.nexdoBlue, in: RoundedRectangle(cornerRadius: 16))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}
extension ShoppingGoal {
    var icon: String {
        switch self {
        case .lowerFat: "leaf"; case .lowerSugar: "cube"; case .lowerCalorie: "gauge.with.dots.needle.33percent"
        case .higherProtein: "dumbbell"; case .lactoseFree: "drop"; case .plantBased: "leaf.circle"
        case .lowerPrice: "tag"; case .glutenFree: "takeoutbag.and.cup.and.straw"; case .highFiber: "carrot"
        case .lowSodium: "drop.circle"; case .noArtificial: "checkmark.seal"
        }
    }
}
struct AlternativesGoalPicker: View {
    @Environment(\.dismiss) private var dismiss
    let original: GroceryItem
    let selected: ShoppingGoal?
    let apply: (ShoppingGoal?) -> Void
    @State private var draft: ShoppingGoal?
    @State private var expanded = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 14) {
                        AlternativeArtwork(item: original).frame(width: 50, height: 65)
                        VStack(alignment: .leading, spacing: 4) { Text(original.name).font(.headline); Text(original.amountLabel).font(.caption); Text("Original Item").font(.caption2).foregroundStyle(Color.nexdoBlue) }
                        Spacer()
                    }.modifier(AlternativeCardSurface())
                    Text("I’m looking for:").font(.title3.bold())
                    if expanded {
                        VStack(spacing: 2) { ForEach(ShoppingGoal.allCases) { value in goalRow(value) } }
                    } else {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            ForEach(Array(ShoppingGoal.allCases.prefix(8))) { value in
                                Button { draft = value } label: {
                                    VStack(spacing: 8) { Image(systemName: value.icon).font(.title2); Text(value.rawValue).font(.subheadline.weight(.medium)) }
                                        .frame(maxWidth: .infinity, minHeight: 88).padding(4)
                                        .foregroundStyle(draft == value ? Color.white : Color.nexdoInk)
                                        .background(draft == value ? Color.nexdoBlue : Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
                                        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.nexdoBlue.opacity(0.18)))
                                }.buttonStyle(.plain).accessibilityAddTraits(draft == value ? .isSelected : []).accessibilityIdentifier("alternatives.goal.\(value.rawValue)")
                            }
                        }
                        Button { expanded = true } label: { Label("Show more options", systemImage: "chevron.down").frame(maxWidth: .infinity, minHeight: 44) }.accessibilityIdentifier("alternatives.moreOptions")
                    }
                    if draft != nil { Button("Clear goal") { draft = nil }.frame(minHeight: 44) }
                }.padding(20)
            }.background { AlternativesBackdrop() }
                .safeAreaInset(edge: .bottom) {
                    HStack {
                        Button("Cancel") { dismiss() }.frame(maxWidth: .infinity, minHeight: 52).buttonStyle(.bordered)
                        Button { apply(draft); dismiss() } label: { Text("Apply").frame(maxWidth: .infinity) }.buttonStyle(AlternativeBlueButtonStyle()).accessibilityIdentifier("alternatives.applyGoal")
                    }.padding(20).background(.ultraThinMaterial)
                }
                .navigationTitle("Item Alternatives").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) } }
        }.onAppear { draft = selected }.tint(.nexdoBlue)
    }
    private func goalRow(_ value: ShoppingGoal) -> some View {
        Button { draft = value } label: {
            HStack(spacing: 14) { Image(systemName: draft == value ? "largecircle.fill.circle" : "circle").foregroundStyle(draft == value ? Color.nexdoBlue : Color.nexdoSecondary.opacity(0.4)); Text(value.rawValue); Spacer() }
                .font(.subheadline).frame(minHeight: 44).foregroundStyle(Color.nexdoInk)
        }.buttonStyle(.plain).accessibilityAddTraits(draft == value ? .isSelected : []).accessibilityIdentifier("alternatives.goal.\(value.rawValue)")
    }
}
struct AlternativesWhyView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Image(systemName: "lightbulb.max.fill").font(.system(size: 44)).foregroundStyle(Color.nexdoIndigo).frame(maxWidth: .infinity).padding(24)
                    Text("We suggest practical alternatives for the item in your list. When source data is available, we compare it against your selected goal.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    reason("Matches your goal", "Goal filters use available nutrition and explicit product-label information. Unverified matches are excluded.", "leaf.fill", .green)
                    reason("Comparable nutrition", "Nutrition is compared on compatible serving sizes. Generic USDA foods are labeled representative, not exact products.", "chart.bar.fill", .nexdoBlue)
                    reason("Common substitutes", "Suggestions help you explore familiar alternatives. Availability, taste, and prices vary by store and product.", "leaf", .orange)
                    reason("Check dietary suitability", "Allergens are shown when declared by a product source. Missing information never means allergen-free.", "checkmark.shield", .nexdoIndigo)
                    Divider()
                    Label("Always check the product label for the most current nutrition and allergen information.", systemImage: "info.circle.fill").font(.caption).foregroundStyle(Color.nexdoSecondary).padding(14).background(Color.nexdoBlue.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                }.padding(24)
            }.background { AlternativesBackdrop() }
                .safeAreaInset(edge: .bottom) { Button { dismiss() } label: { Text("Got it").frame(maxWidth: .infinity) }.buttonStyle(AlternativeBlueButtonStyle()).padding(20) }
                .navigationTitle("Why these alternatives?").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) } }
        }
    }
    private func reason(_ title: String, _ message: String, _ icon: String, _ color: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).foregroundStyle(color).frame(width: 44, height: 44).background(color.opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 5) { Text(title).font(.headline); Text(message).font(.subheadline).foregroundStyle(Color.nexdoSecondary) }
        }
    }
}
struct AlternativesSuccess: View {
    let original: String
    let replacement: String
    let close: () -> Void
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "checkmark").font(.system(size: 42, weight: .medium)).foregroundStyle(.white).frame(width: 94, height: 94).background(LinearGradient(colors: [.green, Color.green.opacity(0.75)], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
            Text("Item replaced!").font(.title.bold()).accessibilityIdentifier("alternatives.success")
            Text("\(original) has been replaced with \(replacement).").foregroundStyle(Color.nexdoSecondary).multilineTextAlignment(.center)
            Spacer()
            Button(action: close) { Text("Done").frame(maxWidth: .infinity) }.buttonStyle(AlternativeBlueButtonStyle())
            Button(action: close) { Label("View in Cart", systemImage: "cart").frame(maxWidth: .infinity, minHeight: 48) }.buttonStyle(.bordered)
        }.padding(28).padding(.bottom, 20).background { AlternativesBackdrop() }.interactiveDismissDisabled()
    }
}
/// Render the supplied flattened asset pack as a sprite sheet. It contains illustrations,
/// not transparent individual files or photographs of the user's exact products.
struct BreadPackArtwork: View {
    let name: String
    var hero = false
    private var region: CGRect {
        if hero { return CGRect(x: 25, y: 895, width: 251, height: 123) }
        let value = name.lowercased()
        let x: CGFloat = value.contains("whole") ? 126 : value.contains("multi") ? 229 : value.contains("sourdough") ? 333 : value.contains("rye") ? 436 : value.contains("low-carb") ? 538 : 26
        return CGRect(x: x, y: 1390, width: 99, height: 90)
    }
    var body: some View {
        GeometryReader { geometry in
            let box = region
            let scale = min(geometry.size.width / box.width, geometry.size.height / box.height)
            Image("alternatives-design-pack").resizable().frame(width: 1024 * scale, height: 1536 * scale)
                .offset(x: -box.minX * scale, y: -box.minY * scale)
                .frame(width: box.width * scale, height: box.height * scale, alignment: .topLeading).clipped()
                .clipShape(RoundedRectangle(cornerRadius: hero ? 16 : 12))
                .frame(width: geometry.size.width, height: geometry.size.height)
        }.contentShape(Rectangle()).accessibilityHidden(true)
    }
}

/// Mango illustration from the supplied flattened Item Details asset sheet.
struct NutritionPackArtwork: View {
    var body: some View {
        GeometryReader { geometry in
            let scale = min(geometry.size.width / 160, geometry.size.height / 160)
            Image("nutrition-detail-pack").resizable()
                .frame(width: 1024 * scale, height: 1536 * scale)
                .offset(x: -26 * scale, y: -1253 * scale)
                .frame(width: 160 * scale, height: 160 * scale, alignment: .topLeading)
                .clipped().frame(width: geometry.size.width, height: geometry.size.height)
        }.contentShape(Rectangle()).accessibilityHidden(true)
    }
}
