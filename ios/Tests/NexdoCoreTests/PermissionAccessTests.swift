import Testing
@testable import NexdoCore

@Test func permissionOnboardingRequestsOnlyUndecidedAccess() {
    for resource in [PermissionAccess.Resource.calendar, .contacts, .notifications] {
        #expect(PermissionAccess.decision(for: resource, status: .notDetermined) == .request)
        #expect(PermissionAccess.decision(for: resource, status: .authorized) == .allow)
        #expect(PermissionAccess.decision(for: resource, status: .denied) == .deny)
        #expect(PermissionAccess.decision(for: resource, status: .restricted) == .deny)
    }
}
@Test func limitedContactAccessDoesNotGrantCalendarOrNotificationAccess() {
    #expect(PermissionAccess.decision(for: .contacts, status: .limited) == .allow)
    #expect(PermissionAccess.decision(for: .calendar, status: .limited) == .deny)
    #expect(PermissionAccess.decision(for: .notifications, status: .limited) == .deny)
}
@Test func provisionalNotificationsAreUsableWithoutAnotherPrompt() {
    for status in [PermissionAccess.Status.provisional, .ephemeral] {
        #expect(PermissionAccess.decision(for: .notifications, status: status) == .allow)
        #expect(PermissionAccess.decision(for: .contacts, status: status) == .deny)
        #expect(PermissionAccess.decision(for: .calendar, status: status) == .deny)
    }
}
@Test func writeOnlyCalendarAccessNeedsUpgradeBeforeReading() {
    #expect(PermissionAccess.decision(for: .calendar, status: .writeOnly) == .request)
    #expect(PermissionAccess.decision(for: .contacts, status: .writeOnly) == .deny)
}


@Test @MainActor func deniedMicrophoneStopsSessionCreationAndAllowsRetry() async throws {
    var sessionsCreated = 0
    do {
        try await VoicePermissionGate.authorize { false }
        sessionsCreated += 1
        Issue.record("Denied microphone must stop startup")
    } catch VoicePermissionGate.Failure.microphoneDenied {
        #expect(sessionsCreated == 0)
    }
    // The same flow can recover after the user enables access in Settings.
    try await VoicePermissionGate.authorize { true }
    sessionsCreated += 1
    #expect(sessionsCreated == 1)
}

@Test @MainActor func cancellingMicrophonePromptStopsSessionCreation() async {
    var sessionsCreated = 0
    let task = Task { @MainActor in
        do {
            try await VoicePermissionGate.authorize {
                withUnsafeCurrentTask { $0?.cancel() }
                return true
            }
            sessionsCreated += 1
            Issue.record("Cancelled permission prompt must stop startup")
        } catch is CancellationError {
            // Expected when the screen closes while awaiting the OS prompt.
        } catch { Issue.record("Unexpected error: \(error)") }
    }
    await task.value
    #expect(sessionsCreated == 0)
}
