import AVFoundation
import SwiftUI

@MainActor
final class VoicePlayback: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var isPlaying = false
    @Published private(set) var error: String?
    private var player: AVAudioPlayer?
    private var completion: ((Bool) -> Void)?
    func play(_ data: Data, onComplete: ((Bool) -> Void)? = nil) {
        stop()
        completion = onComplete
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
            let next = try AVAudioPlayer(data: data)
            next.delegate = self
            guard next.prepareToPlay(), next.play() else { throw APIError.invalidResponse }
            player = next; isPlaying = true; error = nil
        }
        catch {
            // Swift's implicit catch binding is named `error`; qualify the
            // published property so the compiler does not treat this as an
            // assignment to the caught Error value.
            self.error = "Nexdo could not play the voice response."
            isPlaying = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            let callback = completion; completion = nil; callback?(false)
        }
    }
    func stop() { completion = nil; player?.delegate = nil; player?.stop(); player = nil; isPlaying = false; error = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        let identity = ObjectIdentifier(player)
        Task { @MainActor in
            guard let current = self.player, ObjectIdentifier(current) == identity else { return }
            let callback = self.completion
            self.stop()
            if !flag { self.error = "Voice playback was interrupted. You can retry the voice reply." }
            callback?(flag)
        }
    }
}
