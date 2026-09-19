import FirebaseCore
import FirebaseAnalytics
import WebKit
import OSLog

@MainActor enum NexdoAnalytics {
    static func configureIfAvailable() {
        guard FirebaseApp.app() == nil else { return }
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let options = FirebaseOptions(contentsOfFile: path),
              options.bundleID == Bundle.main.bundleIdentifier else {
            Logger(subsystem: "com.pinslots.nexdo", category: "analytics").notice("Firebase inactive: add the matching GoogleService-Info.plist to the app target.")
            return
        }
        FirebaseApp.configure(options: options)
    }
    static func logEvent(_ name: String, parameters: [String: Any]?) {
        guard FirebaseApp.app() != nil else { return }
        Analytics.logEvent(name, parameters: parameters)
    }
}

/// A controller retains this handler, not the view/controller that owns the web view.
/// Use a fresh configuration so registration cannot replace another handler.
@MainActor final class FirebaseAnalyticsBridge: NSObject, WKScriptMessageHandler {
    private let trustedOrigin: URL
    init(trustedOrigin: URL) { self.trustedOrigin = trustedOrigin }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.name == "firebase", message.frameInfo.isMainFrame,
              trustedOrigin.scheme == "https", origin.protocol == "https",
              origin.host == trustedOrigin.host,
              (origin.port == 0 ? 443 : origin.port) == (trustedOrigin.port ?? 443),
              let event = FirebaseBridgeEvent(body: message.body) else { return }
        NexdoAnalytics.logEvent(event.name, parameters: event.parameters)
    }

    /// Retained by WKUserContentController for exactly the lifetime of this web view.
    static func makeWebView(trustedOrigin: URL) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(FirebaseAnalyticsBridge(trustedOrigin: trustedOrigin), name: "firebase")
        return WKWebView(frame: .zero, configuration: configuration)
    }
}
