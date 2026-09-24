import Foundation
import Testing
@testable import NexdoCore

@MainActor private final class Counter { var calls = 0 }

@Test func wishGenerationWording() {
    #expect(WishGenerationGate.progressLabel == "Writing your wish…")
    #expect(WishGenerationTimedOut().localizedDescription == "The request timed out.")
}

@MainActor @Test func repeatTapsWhileGeneratingSendNoSecondRequest() async {
    let gate = WishGenerationGate()
    let counter = Counter()
    var release: CheckedContinuation<Void, Never>?
    #expect(!gate.isGenerating)
    let first = Task { @MainActor in
        await gate.run {
            counter.calls += 1
            await withCheckedContinuation { release = $0 }
            return "draft"
        }
    }
    while release == nil { await Task.yield() }
    #expect(gate.isGenerating)
    // Second and third taps while the first request runs: dropped, work never called.
    let second: String? = await gate.run { counter.calls += 1; return "again" }
    let third: String? = await gate.run { counter.calls += 1; return "again" }
    #expect(second == nil && third == nil)
    #expect(counter.calls == 1)
    #expect(gate.isGenerating)
    release?.resume()
    #expect(await first.value == "draft")
    #expect(!gate.isGenerating)
    // Re-enabled: the next tap sends a request.
    #expect(await gate.run { counter.calls += 1; return "next" } == "next")
    #expect(counter.calls == 2)
}

@MainActor @Test func failureReenables() async {
    struct Failed: Error {}
    let gate = WishGenerationGate()
    await #expect(throws: Failed.self) { try await gate.run { throw Failed() } }
    #expect(!gate.isGenerating)
    #expect(await gate.run { 1 } == 1)
}

@MainActor @Test func timeoutEndsAStuckRequest() async {
    let gate = WishGenerationGate(timeout: .milliseconds(50))
    let counter = Counter()
    let result: Result<String, Error>? = await gate.run {
        do {
            return .success(try await gate.withTimeout {
                counter.calls += 1
                try await Task.sleep(for: .seconds(30))
                return "late"
            })
        } catch { return .failure(error) }
    }
    guard case .failure(let error)? = result else { Issue.record("expected a timeout"); return }
    #expect(error as? WishGenerationTimedOut != nil)
    #expect(counter.calls == 1)
    #expect(!gate.isGenerating)
}

@MainActor @Test func timeoutPassesThroughResultsAndErrors() async throws {
    struct Failed: Error {}
    let gate = WishGenerationGate(timeout: .seconds(5))
    #expect(try await gate.withTimeout { "draft" } == "draft")
    await #expect(throws: Failed.self) { try await gate.withTimeout { () async throws -> String in throw Failed() } }
}

@MainActor @Test func savesAndTabChangesWaitForTheDraft() async {
    let gate = WishGenerationGate()
    // Not writing: the usual rules.
    #expect(gate.allowsSave(busy: false))
    #expect(!gate.allowsSave(busy: true))
    #expect(gate.tabChange(sameTab: false, busy: false, dirty: false) == .switchNow)
    #expect(gate.tabChange(sameTab: false, busy: false, dirty: true) == .saveFirst)
    #expect(gate.tabChange(sameTab: true, busy: false, dirty: true) == .ignore)
    #expect(gate.tabChange(sameTab: false, busy: true, dirty: false) == .ignore)
    var release: CheckedContinuation<Void, Never>?
    let writing = Task { @MainActor in await gate.run { await withCheckedContinuation { release = $0 } } }
    while release == nil { await Task.yield() }
    // Writing: save, approve and the card save are refused, and a tab change does nothing, with or
    // without unsaved edits, so no auto-save is left waiting.
    #expect(!gate.allowsSave(busy: false))
    #expect(gate.tabChange(sameTab: false, busy: false, dirty: true) == .ignore)
    #expect(gate.tabChange(sameTab: false, busy: false, dirty: false) == .ignore)
    release?.resume()
    await writing.value
    #expect(gate.allowsSave(busy: false))
    #expect(gate.tabChange(sameTab: false, busy: false, dirty: true) == .saveFirst)
}
