import FirebaseCore
import FirebaseCrashlytics
import Foundation

@MainActor enum NexdoCrashReporting {
    static func configure() {
        guard FirebaseApp.app() != nil else { return }
        let reporter = Crashlytics.crashlytics()
        reporter.setCrashlyticsCollectionEnabled(true)
        #if DEBUG
        reporter.setCustomValue("debug", forKey: "build_configuration")
        // Explicit launch argument only; never available in distributed Release builds.
        if ProcessInfo.processInfo.arguments.contains("-nexdo-crashlytics-test-crash") {
            reporter.setCustomValue(true, forKey: "controlled_test")
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                fatalError("NexDo controlled Crashlytics verification")
            }
        }
        #else
        reporter.setCustomValue("release", forKey: "build_configuration")
        #endif
    }
}
