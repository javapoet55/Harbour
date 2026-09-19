import SwiftUI

/// A single short celebration on arrival, with no interaction or accessibility obstruction.
struct MomentConfetti: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var active = false
    @State private var started = Date()
    private let colors: [Color] = [.pink, .purple, .blue, .cyan, .orange, .yellow]

    var body: some View {
        // Keep a real, full-size view mounted even before the animation starts.
        // An empty conditional Group has no appearance lifecycle to start its task.
        GeometryReader { geometry in
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !active)) { timeline in
                Canvas { context, size in
                    guard active && !reduceMotion else { return }
                    let elapsed = timeline.date.timeIntervalSince(started)
                    for index in 0..<48 {
                        let delay = Double(index % 8) * 0.06
                        let progress = max(0, min(1, (elapsed - delay) / 2.8))
                        guard elapsed >= delay, progress < 1 else { continue }
                        let seed = Double(index)
                        let x = size.width * Double((index * 37) % 101) / 100
                            + sin(progress * 7 + seed) * 24
                        let y = -24 + (size.height + 48) * progress
                        var particle = context
                        particle.opacity = min(1, (1 - progress) * 5)
                        particle.translateBy(x: x, y: y)
                        particle.rotate(by: .degrees(seed * 31 + progress * 480))
                        let rect = CGRect(x: -4, y: -6, width: 8, height: index.isMultiple(of: 3) ? 8 : 12)
                        particle.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(colors[index % colors.count]))
                    }
                }
                .frame(width: geometry.size.width, height: geometry.size.height)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task(id: reduceMotion) {
            active = false
            guard !reduceMotion else { return }
            do {
                // Let the navigation transition finish before starting the visible burst.
                try await Task.sleep(for: .milliseconds(350))
                started = Date()
                active = true
                try await Task.sleep(for: .seconds(3.4))
                active = false
            } catch {
                active = false
            }
        }
        .onDisappear { active = false }
    }
}
