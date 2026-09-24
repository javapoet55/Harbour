import Foundation
import Observation

/// One wish draft request at a time. While it runs, Regenerate shows `progressLabel` and the tone chips and AI
/// toggle are disabled; repeat taps are dropped without a second request. Same rule and wording as Android.
@MainActor @Observable public final class WishGenerationGate {
    public nonisolated static let progressLabel = "Writing your wish…"
    /// Longer than the 50 s request timeout, so it only fires when a response trickles in and never finishes.
    public nonisolated static let defaultTimeout: Duration = .seconds(60)

    public private(set) var isGenerating = false
    public let timeout: Duration

    public init(timeout: Duration = WishGenerationGate.defaultTimeout) { self.timeout = timeout }

    /// Runs `work` unless a request is already running, in which case it returns nil without calling it.
    /// `isGenerating` is cleared however `work` ends.
    @discardableResult
    public func run<T>(_ work: @MainActor () async throws -> T) async rethrows -> T? {
        guard !isGenerating else { return nil }
        isGenerating = true; defer { isGenerating = false }
        return try await work()
    }

    /// `request`, abandoned with `WishGenerationTimedOut` after `timeout` so the screen can't stay stuck;
    /// a result arriving later is dropped.
    public func withTimeout<T: Sendable>(_ request: @escaping @MainActor () async throws -> T) async throws -> T {
        let timeout = self.timeout
        let once = WishRequestOnce()
        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<T, Error>) in
            let finish: @MainActor (Result<T, Error>) -> Void = { result in
                guard !once.done else { return }
                once.done = true; once.tasks.forEach { $0.cancel() }
                continuation.resume(with: result)
            }
            once.tasks = [
                Task { @MainActor in
                    do { finish(.success(try await request())) } catch { finish(.failure(error)) }
                },
                Task { @MainActor in
                    try? await Task.sleep(for: timeout)
                    if !Task.isCancelled { finish(.failure(WishGenerationTimedOut())) }
                },
            ]
        }
    }
}

/// While a wish is being written nothing saves, so the text it replaces is never saved over it. Save, approve and
/// the greeting-card save are refused, and so is a tab change: it auto-saves unsaved edits, and a refused save would
/// leave it pending. Same rule as Android (24c0eb4).
public enum WishTabChange: Equatable, Sendable { case ignore, switchNow, saveFirst }
extension WishGenerationGate {
    public func allowsSave(busy: Bool) -> Bool { !busy && !isGenerating }
    public func tabChange(sameTab: Bool, busy: Bool, dirty: Bool) -> WishTabChange {
        guard !sameTab, allowsSave(busy: busy) else { return .ignore }
        return dirty ? .saveFirst : .switchNow
    }
}

/// Settles `withTimeout` once, whichever of the request and the timer ends first.
@MainActor private final class WishRequestOnce { var done = false; var tasks: [Task<Void, Never>] = [] }

/// Same wording as URLSession's own timeout, so the existing error notice reads the same either way.
public struct WishGenerationTimedOut: LocalizedError, Equatable {
    public init() {}
    public var errorDescription: String? { "The request timed out." }
}
