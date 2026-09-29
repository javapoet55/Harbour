import SwiftUI

struct TodayQuickAccess: View {
    let onPlanWeek: (String) -> Void
    let onWeekly: () -> Void
    var body: some View {
        HStack {
            Text("Quick Access").font(.title2.bold()).foregroundStyle(Color.nexdoInk)
            Spacer()
            Button(action: onWeekly) {
                Image(systemName: "chart.bar.xaxis")
                    .font(.system(size: 24, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(NexdoTheme.gradient, in: RoundedRectangle(cornerRadius: 15))
            }.buttonStyle(.plain).accessibilityLabel("Weekly Summary")
                .accessibilityIdentifier("quick-access-weekly")
        }
    }
}
