import SwiftUI

struct WellnessChooserView: View {
    let onSelect: (Bool) -> Void
    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 24) {
            Text("A little time for you").font(.largeTitle.bold())
            Text("Nourish your day. Find your focus.").foregroundStyle(.secondary)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 16) { calorie; focus }
                VStack(spacing: 16) { calorie; focus }
            }
            Spacer(minLength: 0)
        }.padding(24).padding(.top, 16)
            .foregroundStyle(Color(red: 0.06, green: 0.07, blue: 0.28))
            .background(LinearGradient(colors: [.purple.opacity(0.06), .white, .blue.opacity(0.05)], startPoint: .topLeading, endPoint: .bottomTrailing))
        }
    }
    private var calorie: some View {
        tile("Calorie Tracker", subtitle: "Meals, goals & nutrition", symbol: "flame.fill", tint: .orange, preview: true) { onSelect(true) }
    }
    private var focus: some View {
        tile("Pomodoro Focus", subtitle: "Make time for deep work", symbol: "timer", tint: .indigo, preview: false) { onSelect(false) }
    }
    private func tile(_ title: String, subtitle: String, symbol: String, tint: Color, preview: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 16) {
                Image(systemName: symbol).font(.system(size: 30)).foregroundStyle(tint)
                    .frame(width: 60, height: 60).background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 18))
                Text(title).font(.title3.bold()).fixedSize(horizontal: false, vertical: true)
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                HStack { Text(preview ? "UI Preview" : "Start focusing").font(.caption.bold()); Spacer(); Image(systemName: "arrow.right") }.foregroundStyle(tint)
            }.frame(minWidth: 100, maxWidth: .infinity, minHeight: 210, alignment: .topLeading)
                .padding(20).background(.white, in: RoundedRectangle(cornerRadius: 24))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(tint.opacity(0.15)))
                .shadow(color: tint.opacity(0.08), radius: 12, y: 6)
        }.buttonStyle(.plain)
    }
}
