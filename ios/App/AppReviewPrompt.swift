import SwiftUI
import StoreKit

@MainActor final class AppReviewPromptStore {
    static let shared = AppReviewPromptStore()
    private let key = "nexdo.appReviewSchedule.v1"
    private let defaults = UserDefaults.standard

    func recordFirstLaunch() {
        guard defaults.data(forKey: key) == nil else { return }
        if let data = try? JSONEncoder().encode(AppReviewSchedule(firstLaunch: Date())) {
            defaults.set(data, forKey: key)
        }
    }

    func consumeOpportunity() -> Bool {
        guard let data = defaults.data(forKey: key),
              var schedule = try? JSONDecoder().decode(AppReviewSchedule.self, from: data),
              schedule.consumeOpportunity(at: Date(), timeZone: .autoupdatingCurrent),
              let updated = try? JSONEncoder().encode(schedule) else { return false }
        defaults.set(updated, forKey: key)
        return true
    }
}

/// Apple's own rating/review screen; no custom pre-prompt or sentiment filtering.
struct AppReviewPromptModifier: ViewModifier {
    let busy: Bool
    @Environment(\.scenePhase) private var phase
    @Environment(\.requestReview) private var requestReview

    func body(content: Content) -> some View {
        content.task(id: phase == .active && !busy) {
            guard phase == .active, !busy else { return }
            while !Task.isCancelled {
                // Let navigation and initial loading settle; also catches crossing 5 p.m.
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                guard !busy, phase == .active, canPresentReview else { continue }
                if AppReviewPromptStore.shared.consumeOpportunity() { requestReview() }
            }
        }
    }

    @MainActor private var canPresentReview: Bool {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
              let window = scene.windows.first(where: \.isKeyWindow),
              let root = window.rootViewController,
              root.presentedViewController == nil else { return false }
        return !hasTextInputFocus(window)
    }

    @MainActor private func hasTextInputFocus(_ view: UIView) -> Bool {
        if view.isFirstResponder, view is UITextInput { return true }
        for child in view.subviews { if hasTextInputFocus(child) { return true } }
        return false
    }
}
