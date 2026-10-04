import SwiftUI

enum WellnessExit { case home, calendar, tasks, askAI }

struct WellnessChooserView: View {
    let onSelect: (WellnessExit) -> Void
    @EnvironmentObject private var model: AppModel
    @State private var destination: Destination?
    private enum Destination: String, Identifiable {
        case calories, pomodoro, moments, shopping, insights, profile
        var id: String { rawValue }
    }
    private let ink = Color(red: 0.035, green: 0.035, blue: 0.19)
    var body: some View {
        GeometryReader { proxy in
            let scale = min(proxy.size.width / 393, 1.4)
            ScrollView {
                VStack(spacing: 0) {
                    hero(scale: scale)
                    VStack(spacing: 10 * scale) {
                        module(.shopping, title: "Shopping List", subtitle: "Plan, shop and save time", tags: "Groceries  ·  Send to store  ·  Stay organized", color: Color(red: 0, green: 0.46, blue: 0.23), icon: CGRect(x: 1176, y: 428, width: 95, height: 94), art: CGRect(x: 1146, y: 691, width: 185, height: 177), scale: scale)
                        module(.calories, title: "Calorie Tracker", subtitle: "Track your meals, goals & nutrition", tags: "Eat well  ·  Feel great  ·  Stay healthy", color: Color(red: 0.78, green: 0.27, blue: 0), icon: CGRect(x: 43, y: 429, width: 93, height: 92), art: CGRect(x: 490, y: 695, width: 195, height: 171), scale: scale)
                        module(.pomodoro, title: "Pomodoro Focus", subtitle: "Make time for deep work", tags: "Focus  ·  Be productive  ·  Get more done", color: .nexdoIndigo, icon: CGRect(x: 422, y: 429, width: 99, height: 93), art: CGRect(x: 686, y: 690, width: 193, height: 176), scale: scale)
                        module(.moments, title: "Moments", subtitle: "Remember what matters", tags: "Birthdays  ·  Festivals  ·  Special occasions", color: Color(red: 0.87, green: 0.08, blue: 0.37), icon: CGRect(x: 798, y: 428, width: 94, height: 95), art: CGRect(x: 896, y: 693, width: 234, height: 178), scale: scale)
                    }.padding(.horizontal, 14 * scale)
                    HStack(alignment: .top, spacing: 16) {
                        Text("“").font(.system(size: 58 * scale, weight: .bold, design: .rounded)).foregroundStyle(.indigo.opacity(0.75))
                        VStack(alignment: .leading, spacing: 10) {
                            Text("“A more organized you,\na brighter tomorrow.”").font(.system(size: 17 * scale, weight: .medium))
                            Text("— NexDo").font(.system(size: 14 * scale)).foregroundStyle(Color.nexdoSecondary)
                        }.padding(.top, 10)
                        Spacer(minLength: 0)
                    }.padding(22 * scale).frame(maxWidth: .infinity, alignment: .leading)
                        .background(LinearGradient(colors: [.indigo.opacity(0.07), .blue.opacity(0.12)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 20 * scale))
                        .padding(.horizontal, 14 * scale).padding(.top, 17 * scale).padding(.bottom, 24)
                }
            }.background(LinearGradient(colors: [Color(red: 0.98, green: 0.97, blue: 1), .white, Color(red: 0.94, green: 0.96, blue: 1)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
                .foregroundStyle(ink)
        }
        .fullScreenCover(item: $destination) { target in
            switch target {
            case .calories: CalorieTrackerView(api: model.profile == nil ? nil : model.momentAPI)
            case .pomodoro:
                PomodoroView(api: model.momentAPI, owner: model.profile?.id ?? "preview", preview: model.profile == nil, onTasks: { destination = nil; onSelect(.tasks) })
            case .moments:
                NavigationStack { ImportantMomentsView().toolbar { ToolbarItem(placement: .cancellationAction) { backButton } } }
            case .shopping:
                WellnessShoppingDestination(api: model.momentAPI)
            case .insights:
                WellnessInsightsDestination()
            case .profile: AccountView()
            }
        }
    }
    private var backButton: some View { Button { destination = nil } label: { Label("Back", systemImage: "chevron.left") } }
    private func hero(scale: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(colors: [.pink.opacity(0.05), .blue.opacity(0.10), .purple.opacity(0.07)], startPoint: .topLeading, endPoint: .bottomTrailing)
            HStack(spacing: 0) {
                Spacer()
                WellnessPackRegion(rect: CGRect(x: 35, y: 18, width: 315, height: 384))
                    .frame(width: 140 * scale, height: 190 * scale).blendMode(.multiply)
            }.frame(maxHeight: .infinity, alignment: .bottom).padding(.trailing, 64 * scale)
            WellnessPackRegion(rect: CGRect(x: 498, y: 273, width: 244, height: 108))
                .frame(width: 75 * scale, height: 57 * scale).rotationEffect(.degrees(-8)).blendMode(.multiply)
                .frame(maxWidth: .infinity, alignment: .trailing).padding(.top, 42 * scale).padding(.trailing, 8)
            VStack(alignment: .leading, spacing: 10 * scale) {
                Text("A little time\nfor you").font(.system(size: 30 * scale, weight: .bold)).tracking(-0.8)
                Text("Nourish your day. Organize your life.\nFocus on what matters.")
                    .font(.system(size: 11.5 * scale)).foregroundStyle(Color.nexdoSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }.padding(.leading, 32 * scale).padding(.top, 28 * scale)
        }.frame(height: 192 * scale).clipped()
    }
    private func module(_ target: Destination, title: String, subtitle: String, tags: String, color: Color, icon: CGRect, art: CGRect, scale: CGFloat) -> some View {
        Button { destination = target } label: {
            HStack(spacing: 15 * scale) {
                WellnessPackRegion(rect: icon).frame(width: 51 * scale, height: 51 * scale).clipShape(RoundedRectangle(cornerRadius: 14)).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 5 * scale) {
                    Text(title).font(.system(size: 15 * scale, weight: .bold)).foregroundStyle(ink)
                    Text(subtitle).font(.system(size: 10.5 * scale)).foregroundStyle(Color.nexdoSecondary).frame(maxWidth: 158 * scale, alignment: .leading)
                    Text(tags).font(.system(size: 8.5 * scale, weight: .medium)).foregroundStyle(color)
                        .padding(.horizontal, 7 * scale).padding(.vertical, 4 * scale)
                        .background(color.opacity(0.08), in: Capsule()).background(.white.opacity(0.96), in: Capsule())
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "arrow.right").font(.system(size: 20 * scale, weight: .bold)).foregroundStyle(color)
                    .frame(width: 36 * scale, height: 36 * scale).background(.white.opacity(0.94), in: Circle())
            }.padding(.horizontal, 16 * scale).padding(.vertical, 17 * scale)
                .frame(maxWidth: .infinity, minHeight: 92 * scale, alignment: .leading)
                .background(alignment: .trailing) {
                    WellnessPackRegion(rect: art).frame(width: 77 * scale, height: 81 * scale)
                        .blendMode(.multiply).padding(.trailing, 30 * scale).opacity(0.9)
                }
                .background(LinearGradient(colors: [.white, color.opacity(0.055)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 18 * scale))
                .overlay(RoundedRectangle(cornerRadius: 18 * scale).stroke(color.opacity(0.10)))
                .contentShape(RoundedRectangle(cornerRadius: 18 * scale))
        }.buttonStyle(.plain).accessibilityIdentifier("wellness.\(target.rawValue)")
    }
    private var bottomBar: some View {
        HStack(alignment: .center, spacing: 0) {
            footer("Today", icon: "sun.max") { onSelect(.home) }
            footer("Tasks", icon: "checkmark.circle") { onSelect(.tasks) }
            Button {} label: {
                WellnessPackRegion(rect: CGRect(x: 302, y: 878, width: 130, height: 127))
                    .frame(width: 68, height: 68).clipShape(Circle())
            }.buttonStyle(.plain).frame(maxWidth: .infinity).accessibilityLabel("Wellness menu").accessibilityAddTraits(.isSelected)
            footer("Ask AI", icon: "sparkles") { onSelect(.askAI) }
            footer("Calendar", icon: "calendar") { onSelect(.calendar) }
        }.padding(.horizontal, 13).padding(.top, 10).padding(.bottom, 5)
            .background(.white.opacity(0.98), in: UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22))
    }
    private func footer(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 19))
                Text(title).font(.caption2)
            }
            .foregroundStyle(Color.nexdoSecondary)
            .frame(maxWidth: .infinity, minHeight: 52)
            .contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityLabel(title)
    }
}

/// Renders a region of the original asset sheet at the requested view size.
private struct WellnessPackRegion: View {
    let rect: CGRect
    private static let source = UIImage(named: "wellness-menu-pack")?.cgImage
    var body: some View {
        if let source = Self.source, let region = source.cropping(to: rect) {
            Image(decorative: region, scale: 1)
                .resizable().interpolation(.high).scaledToFit()
                .allowsHitTesting(false).accessibilityHidden(true)
        }
    }
}
private struct WellnessShoppingDestination: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var store: ShoppingStore
    init(api: APIClient) { _store = StateObject(wrappedValue: ShoppingStore(api: api)) }
    var body: some View {
        NavigationStack { ShoppingHome(store: store).toolbar { ToolbarItem(placement: .cancellationAction) { Button("Back", systemImage: "chevron.left") { dismiss() } } } }
    }
}
private struct WellnessInsightsDestination: View {
    @Environment(\.dismiss) private var dismiss
    @State private var prompt: String?
    @State private var asking = false
    var body: some View {
        NavigationStack {
            WeeklySummaryView(onPlanNextWeek: { prompt = $0; asking = true })
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Back", systemImage: "chevron.left") { dismiss() } } }
        }.fullScreenCover(isPresented: $asking) { AskNexdoView(initialPrompt: prompt ?? "") }
    }
}
