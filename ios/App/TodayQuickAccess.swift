import SwiftUI

/// Compact shortcuts share the same stores and destinations as their full screens.
struct TodayQuickAccess: View {
    @EnvironmentObject private var model: AppModel
    let onPlanWeek: (String) -> Void
    let onWeekly: () -> Void
    var body: some View {
        TodayQuickAccessContent(api: model.momentAPI, onPlanWeek: onPlanWeek, onWeekly: onWeekly).id(model.profile?.id)
    }
}
private struct TodayQuickAccessContent: View {
    @EnvironmentObject private var moments: ImportantMomentsStore
    @Environment(\.scenePhase) private var phase
    @Environment(\.dynamicTypeSize) private var typeSize
    @StateObject private var shopping: ShoppingStore
    let onPlanWeek: (String) -> Void
    let onWeekly: () -> Void
    init(api: APIClient, onPlanWeek: @escaping (String) -> Void, onWeekly: @escaping () -> Void) {
        _shopping = StateObject(wrappedValue: ShoppingStore(api: api))
        self.onPlanWeek = onPlanWeek
        self.onWeekly = onWeekly
    }
    private var nextList: GroceryList? {
        shopping.lists.filter { $0.completedAt == nil }.sorted { $0.date < $1.date }.first
    }
    private var upcomingCount: Int {
        MomentDisplayGroup.groups(moments.moments.filter {
            $0.enabled && $0.nextOccurrence >= MomentDates.day(Date(), zone: $0.timeZoneID)
        }).count
    }
    private var shoppingSubtitle: String {
        guard shopping.error == nil else { return "View lists" }
        guard let list = nextList else { return "Your lists" }
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.timeZone = TimeZone(identifier: list.timeZone)
        formatter.dateFormat = "EEE"
        return "\(list.remaining) items · \(formatter.string(from: MomentDates.date(list.date, zone: list.timeZone)))"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Quick Access").font(.title2.bold()).foregroundStyle(Color.nexdoInk)
                Spacer()
            }
            Group {
                if typeSize.isAccessibilitySize {
                    VStack(spacing: 20) { shortcuts }
                } else {
                    HStack(alignment: .top, spacing: 0) { shortcuts }
                }
            }
            .padding(.vertical, 22).padding(.horizontal, 8)
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.nexdoIndigo.opacity(0.18)))
        }
        .tint(.nexdoIndigo)
        .task { await shopping.refresh() }
        .onChange(of: phase) { _, value in if value == .active { Task { await shopping.refresh() } } }
    }
    @ViewBuilder private var shortcuts: some View {
        Button(action: onWeekly) {
            tile("Weekly", subtitle: "Summary", symbol: "chart.bar.xaxis", color: .white, gradient: true)
        }.buttonStyle(.plain).accessibilityLabel("Weekly Summary").accessibilityIdentifier("quick-access-weekly")
        separator
        NavigationLink { ImportantMomentsView() } label: {
            tile("Moments", subtitle: "\(upcomingCount) upcoming", symbol: "gift.fill", color: .purple)
        }.buttonStyle(.plain).accessibilityIdentifier("quick-access-moments")
        separator
        NavigationLink {
            if shopping.error == nil, let list = nextList { ShoppingDetail(store: shopping, initial: list) }
            else { ShoppingHome(store: shopping) }
        } label: {
            tile("Shopping", subtitle: shoppingSubtitle, symbol: "cart.fill", color: .green)
        }.buttonStyle(.plain).accessibilityIdentifier("quick-access-shopping")
    }
    @ViewBuilder private var separator: some View {
        if !typeSize.isAccessibilitySize {
            Rectangle().fill(Color.nexdoIndigo.opacity(0.14)).frame(width: 1, height: 100)
        }
    }
    private func tile(_ title: String, subtitle: String, symbol: String, color: Color, gradient: Bool = false) -> some View {
        VStack(spacing: 8) {
            Image(systemName: symbol).font(.system(size: 28, weight: .semibold)).foregroundStyle(color)
                .frame(width: 54, height: 54)
                .background {
                    if gradient { RoundedRectangle(cornerRadius: 17).fill(NexdoTheme.gradient) }
                    else { RoundedRectangle(cornerRadius: 17).fill(color.opacity(0.14)) }
                }
            VStack(spacing: 3) {
                Text(title).font(.subheadline.bold()).foregroundStyle(Color.nexdoInk)
                Text(subtitle).font(.caption).foregroundStyle(Color.nexdoSecondary)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
        }.frame(maxWidth: .infinity).padding(.horizontal, 4).contentShape(Rectangle())
    }
}
private struct QuickAccessDirectory: View {
    @ObservedObject var shopping: ShoppingStore
    let onPlanWeek: (String) -> Void
    let onWeekly: () -> Void
    var body: some View {
        ZStack {
            TodayBackdrop()
            List {
                NavigationLink { WeeklySummaryView(onPlanNextWeek: onPlanWeek) } label: { Label("Weekly Summary", systemImage: "chart.bar.xaxis") }
                NavigationLink { ImportantMomentsView() } label: { Label("Important Moments", systemImage: "gift.fill") }
                NavigationLink { ShoppingHome(store: shopping) } label: { Label("Shopping Lists", systemImage: "cart.fill") }
                NavigationLink { RecurringHub(store: shopping) } label: { Label("Recurring Tasks", systemImage: "repeat") }
            }.scrollContentBackground(.hidden)
        }.navigationTitle("Quick Access").tint(.nexdoIndigo)
    }
}
