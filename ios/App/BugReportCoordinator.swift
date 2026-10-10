import SwiftUI
import UIKit
import CoreMotion

@MainActor final class BugReportCoordinator: ObservableObject {
    static let shared = BugReportCoordinator()
    @Published private(set) var shakeEnabled = false
    private var owner: String?
    private weak var model: AppModel?
    private weak var host: UIViewController?
    private let motion = CMMotionManager()
    private var gate = BugShakeGate()
    private var active = false
    var screen = "app"
    func configure(model: AppModel, active: Bool) {
        self.model = model; self.active = active
        let id = model.profile?.id
        if owner != id {
            host?.dismiss(animated: false); host = nil
            owner = id; shakeEnabled = id.map { UserDefaults.standard.bool(forKey: "bug.shake.\($0)") } ?? false
        }
        updateMotion()
    }
    func setShake(_ value: Bool) {
        guard let owner else { return }
        shakeEnabled = value; UserDefaults.standard.set(value, forKey: "bug.shake.\(owner)"); updateMotion()
    }
    private func updateMotion() {
        motion.stopAccelerometerUpdates()
        guard active, owner != nil, shakeEnabled, host == nil, motion.isAccelerometerAvailable else { return }
        motion.accelerometerUpdateInterval = 0.1
        motion.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let a = data?.acceleration else { return }
            let magnitude = sqrt(a.x*a.x + a.y*a.y + a.z*a.z)
            Task { @MainActor in
                guard let self else { return }
                if self.gate.accept(enabled: self.shakeEnabled, active: self.active, presenting: self.host != nil, acceleration: magnitude, now: ProcessInfo.processInfo.systemUptime) { self.open() }
            }
        }
    }
    func open(from screen: String? = nil) {
        guard host == nil, let model, model.profile != nil,
              let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive })?.keyWindow,
              var presenter = window.rootViewController else { return }
        while let next = presenter.presentedViewController { presenter = next }
        guard !presenter.isBeingDismissed, !(presenter is UIAlertController) else { return }
        let origin = screen ?? self.screen
        let diagnostics = Self.diagnostics(screen: origin)
        let flow = BugReportView(diagnostics: diagnostics, capture: { [weak self, weak window] in
            guard let self, let window, let host = self.host else { return nil }
            // Hide only our overlay; overFullScreen retains the original app hierarchy underneath.
            host.view.isHidden = true
            defer { host.view.isHidden = false }
            // Password inputs cannot be included, even if the user enables screenshots.
            func containsSecure(_ view: UIView) -> Bool {
                if let field = view as? UITextField, field.isSecureTextEntry, !field.isHidden { return true }
                return view.subviews.contains(where: containsSecure)
            }
            guard !containsSecure(presenter.view) else { return nil }
            let format = UIGraphicsImageRendererFormat(); format.scale = min(2, 1170 / window.bounds.width)
            let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
            return image.jpegData(compressionQuality: 0.7)
        }, onDone: { [weak self] in self?.close() }).environmentObject(model)
        let controller = UIHostingController(rootView: flow)
        controller.modalPresentationStyle = .overFullScreen
        controller.isModalInPresentation = true
        host = controller; updateMotion()
        presenter.present(controller, animated: true)
    }
    func close() {
        host?.dismiss(animated: true) { [weak self] in self?.host = nil; self?.updateMotion() }
    }
    static func diagnostics(screen: String) -> BugDiagnostics {
        var system = utsname(); uname(&system)
        let device = withUnsafeBytes(of: &system.machine) { buffer in String(decoding: buffer.prefix(while: { $0 != 0 }), as: UTF8.self) }
        return BugDiagnostics(appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0",
            buildNumber: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0", deviceModel: device,
            iosVersion: UIDevice.current.systemVersion, screen: screen, timestamp: ISO8601DateFormatter().string(from: Date()), correlationID: UUID().uuidString)
    }
}

// Route identifiers are static labels, never titles, contacts, search terms or URLs.
struct BugScreenTag: ViewModifier {
    let name: String
    @State private var previous = "app"
    func body(content: Content) -> some View {
        content.onAppear { previous = BugReportCoordinator.shared.screen; BugReportCoordinator.shared.screen = name }
            .onDisappear { if BugReportCoordinator.shared.screen == name { BugReportCoordinator.shared.screen = previous } }
    }
}
extension View { func bugReportScreen(_ name: String) -> some View { modifier(BugScreenTag(name: name)) } }
