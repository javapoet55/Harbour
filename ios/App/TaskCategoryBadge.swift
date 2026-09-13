import SwiftUI

/// Scalable native artwork; no raster assets, network requests or persisted guesses.
struct TaskCategoryBadge: View {
    let appearance: TaskCategoryAppearance
    @Environment(\.colorSchemeContrast) private var contrast
    @ScaledMetric(relativeTo: .caption) private var iconSize = 23.0
    private var colors: [Color] {
        switch appearance.kind {
        case .fitness: [.purple, .blue]
        case .dental: [.pink, .purple]
        case .health: [.red, .pink]
        case .school: [.teal, .green]
        case .work: [.blue, .cyan]
        case .shopping: [.orange, .pink]
        case .food: [.orange, .red]
        case .travel: [.cyan, .blue]
        case .finance: [.green, .teal]
        case .home: [.indigo, .purple]
        case .social: [.pink, .orange]
        case .general: [.indigo, .blue]
        }
    }
    var body: some View {
        HStack(spacing: 6) {
            artwork.frame(width: iconSize, height: iconSize).accessibilityHidden(true)
            Text(appearance.label).font(.caption.weight(.medium)).lineLimit(1)
        }
        .foregroundStyle(contrast == .increased ? Color.primary : colors[0])
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(LinearGradient(colors: colors.map { $0.opacity(0.11) }, startPoint: .topLeading, endPoint: .bottomTrailing), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Category: \(appearance.label)")
    }
    @ViewBuilder private var artwork: some View {
        let gradient = LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
        switch appearance.kind {
        case .dental:
            GeometryReader { geometry in
                ToothShape().fill(gradient)
                ToothShape().stroke(colors[0].opacity(0.4), lineWidth: 0.6)
                Capsule().fill(.white.opacity(0.85))
                    .frame(width: geometry.size.width * 0.12, height: geometry.size.height * 0.24)
                    .rotationEffect(.degrees(20)).offset(x: geometry.size.width * 0.25, y: geometry.size.height * 0.19)
            }
        case .fitness:
            Canvas { context, size in
                func point(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * size.width, y: y * size.height) }
                var body = Path()
                body.move(to: point(0.5, 0.42)); body.addLine(to: point(0.5, 0.66))
                body.move(to: point(0.25, 0.25)); body.addLine(to: point(0.32, 0.49)); body.addLine(to: point(0.5, 0.46))
                body.addLine(to: point(0.68, 0.49)); body.addLine(to: point(0.75, 0.25))
                body.move(to: point(0.31, 0.91)); body.addLine(to: point(0.39, 0.72)); body.addLine(to: point(0.5, 0.65))
                body.addLine(to: point(0.61, 0.72)); body.addLine(to: point(0.69, 0.91))
                context.stroke(body, with: .color(colors[0]), style: StrokeStyle(lineWidth: size.width * 0.085, lineCap: .round, lineJoin: .round))
                context.fill(Path(ellipseIn: CGRect(x: size.width * 0.40, y: size.height * 0.25, width: size.width * 0.20, height: size.height * 0.18)), with: .color(colors[1]))
                var bar = Path(); bar.move(to: point(0.08, 0.20)); bar.addLine(to: point(0.92, 0.20))
                context.stroke(bar, with: .color(colors[1]), style: StrokeStyle(lineWidth: size.width * 0.07, lineCap: .round))
                for x in [0.10, 0.21, 0.72, 0.83] {
                    context.fill(Path(roundedRect: CGRect(x: x * size.width, y: size.height * 0.07, width: size.width * 0.07, height: size.height * 0.26), cornerRadius: size.width * 0.025), with: .color(colors[x < 0.5 ? 0 : 1]))
                }
            }
        default:
            Image(systemName: symbol).resizable().scaledToFit()
                .symbolRenderingMode(.monochrome).foregroundStyle(gradient).padding(2)
        }
    }
    private var symbol: String {
        switch appearance.kind {
        case .school: "graduationcap.fill"
        case .work: "briefcase.fill"
        case .shopping: "basket.fill"
        case .food: "fork.knife"
        case .travel: "airplane"
        case .finance: "banknote.fill"
        case .home: "house.fill"
        case .social: "person.2.fill"
        case .health: "heart.fill"
        default: "checklist"
        }
    }
}
private struct ToothShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0.5, y: 0.14))
        path.addCurve(to: CGPoint(x: 0.12, y: 0.30), control1: CGPoint(x: 0.18, y: -0.08), control2: CGPoint(x: 0.02, y: 0.09))
        path.addCurve(to: CGPoint(x: 0.25, y: 0.87), control1: CGPoint(x: 0.22, y: 0.51), control2: CGPoint(x: 0.12, y: 0.81))
        path.addCurve(to: CGPoint(x: 0.42, y: 0.73), control1: CGPoint(x: 0.35, y: 1.07), control2: CGPoint(x: 0.4, y: 0.90))
        path.addCurve(to: CGPoint(x: 0.58, y: 0.73), control1: CGPoint(x: 0.44, y: 0.54), control2: CGPoint(x: 0.56, y: 0.54))
        path.addCurve(to: CGPoint(x: 0.75, y: 0.87), control1: CGPoint(x: 0.60, y: 0.90), control2: CGPoint(x: 0.65, y: 1.07))
        path.addCurve(to: CGPoint(x: 0.88, y: 0.30), control1: CGPoint(x: 0.88, y: 0.81), control2: CGPoint(x: 0.78, y: 0.51))
        path.addCurve(to: CGPoint(x: 0.5, y: 0.14), control1: CGPoint(x: 0.98, y: 0.09), control2: CGPoint(x: 0.82, y: -0.08))
        path.closeSubpath()
        return path.applying(CGAffineTransform(a: rect.width, b: 0, c: 0, d: rect.height, tx: rect.minX, ty: rect.minY))
    }
}
