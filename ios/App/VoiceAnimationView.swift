import SwiftUI
import AVFoundation

/// Muted video: only the assistant's generated speech owns the audio session.
struct VoiceAnimationView: UIViewRepresentable {
    var paused = false
    final class Surface: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        let player = AVQueuePlayer()
        var looper: AVPlayerLooper?
        override init(frame: CGRect) {
            super.init(frame: frame)
            let layer = self.layer as! AVPlayerLayer
            layer.player = player
            layer.videoGravity = .resizeAspect
            player.isMuted = true
            if let url = Bundle.main.url(forResource: "VoiceAnimation", withExtension: "mp4") {
                looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
            }
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    }
    func makeUIView(context: Context) -> Surface { Surface(frame: .zero) }
    func updateUIView(_ view: Surface, context: Context) { if paused { view.player.pause() } else { view.player.play() } }
    static func dismantleUIView(_ view: Surface, coordinator: ()) { view.player.pause(); view.looper?.disableLooping(); view.player.removeAllItems() }
}
