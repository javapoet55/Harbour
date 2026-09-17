#if os(macOS)
import Foundation

// macOS stand-ins for the UIKit types AppModel uses to present its schedule-warning alert,
// so the real AppModel compiles in these command-line checks. Checks never show that alert.
enum UISceneActivationState { case foregroundActive, background }

@MainActor class UIScene {
    var activationState = UISceneActivationState.background
}

@MainActor final class UIWindowScene: UIScene {
    var windows: [UIWindow] = []
}

@MainActor final class UIWindow {
    var isKeyWindow = false
    var rootViewController: UIViewController?
}

@MainActor class UIViewController {
    var presentedViewController: UIViewController?
    func present(_ viewController: UIViewController, animated: Bool) {}
}

@MainActor final class UIAlertController: UIViewController {
    enum Style { case alert, actionSheet }
    init(title: String?, message: String?, preferredStyle: Style) {}
    func addAction(_ action: UIAlertAction) {}
}

@MainActor final class UIAlertAction {
    enum Style { case `default`, cancel, destructive }
    init(title: String?, style: Style, handler: ((UIAlertAction) -> Void)? = nil) {}
}

@MainActor final class UIApplication {
    static let shared = UIApplication()
    var connectedScenes: [UIScene] = []
}
#endif
