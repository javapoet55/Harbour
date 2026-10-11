import Foundation

/// Shared permission decisions; platform adapters supply the current OS status.
public enum PermissionAccess {
    public enum Status { case notDetermined, denied, restricted, authorized, limited, provisional, ephemeral, writeOnly }
    public enum Resource { case calendar, contacts, notifications }
    public enum Decision { case request, allow, deny }

    public static func decision(for resource: Resource, status: Status) -> Decision {
        switch status {
        case .notDetermined: return .request
        case .authorized: return .allow
        case .limited: return resource == .contacts ? .allow : .deny
        case .provisional, .ephemeral: return resource == .notifications ? .allow : .deny
        // Calendar needs read access to display events; write-only can be upgraded.
        case .writeOnly: return resource == .calendar ? .request : .deny
        case .denied, .restricted: return .deny
        }
    }
}

/// Checks permission before creating a voice session, including cancellation while
/// the system permission dialog is open.
@MainActor
public enum VoicePermissionGate {
    public enum Failure: LocalizedError {
        case microphoneDenied
        public var errorDescription: String? {
            "Microphone access is off. Enable it in Settings to use voice, or close this screen to type."
        }
    }

    public static func authorize(_ request: () async -> Bool) async throws {
        try Task.checkCancellation()
        let allowed = await request()
        try Task.checkCancellation()
        guard allowed else { throw Failure.microphoneDenied }
    }
}
