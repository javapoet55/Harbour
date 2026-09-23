import SwiftUI
import AVFoundation

/// Keeps one WebRTC transcription session open across multiple speech turns.
@MainActor final class ShoppingVoice:ObservableObject {
    @Published var listening=false
    @Published var connecting=false
    @Published var finishing=false
    @Published var text=""
    @Published var error:String?
    /// True while iOS shows the microphone permission alert, which makes the scene inactive.
    @Published private(set) var requestingPermission=false
    private var transcript=ShoppingTranscript()
    private var connection:(any VoiceRealtimeTransport)?
    private var run=UUID()
    private var timer:Task<Void,Never>?
    private var speaking=false
    private var waiting=Set<String>()
    func start(store:ShoppingStore) async {
        guard !listening && !connecting else{return}
        transcript=ShoppingTranscript()
        if !text.isEmpty{transcript.append(id:UUID().uuidString,text:text,completed:true)}
        connecting=true;error=nil;let generation=UUID();run=generation
        requestingPermission=true
        let granted=await AVAudioApplication.requestRecordPermission()
        requestingPermission=false
        guard granted else{connecting=false;error="Allow microphone access in your phone’s Settings, or type your items.";return}
        guard run==generation else{if error==nil{error="Listening stopped before it started. Tap the mic to try again."};return}
        do {
            let credential=try await store.credential()
            guard run==generation else{return}
            let transport=VoiceWebRTCTransport();connection=transport
            transport.onEvent={ [weak self] data in
                guard let self,self.run==generation else{return};self.receive(data)
            }
            transport.onFailure={ [weak self] in self?.error="Voice disconnected. Your transcript is kept. Review it or reconnect.";self?.close()}
            try await transport.connect(credential:credential)
            guard run==generation else{transport.close();return}
            connecting=false;listening=true
            timer=Task{[weak self] in
                try? await Task.sleep(for:.seconds(300))
                guard !Task.isCancelled else{return};self?.error="Five-minute session ended. Your transcript is ready to review.";self?.close()
            }
        }catch{
            guard run==generation else{return}
            self.error=error.localizedDescription+" Your transcript is kept; retry or type your items."
            close()
        }
    }
    private func receive(_ data:Data) {
        guard let event=try? JSONSerialization.jsonObject(with:data) as? [String:Any],let type=event["type"] as? String else{return}
        switch type {
        case "input_audio_buffer.speech_started":speaking=true
        case "input_audio_buffer.speech_stopped":speaking=false
        case "input_audio_buffer.committed":if let id=event["item_id"] as? String{waiting.insert(id);transcript.append(id:id,text:"",completed:false)}
        case "conversation.item.input_audio_transcription.delta","conversation.item.input_audio_transcription.completed":
            guard let id=event["item_id"] as? String else{return}
            let done=type.hasSuffix(".completed")
            if done{waiting.remove(id)}
            transcript.append(id:id,text:event[done ? "transcript":"delta"] as? String ?? "",completed:done)
            text=transcript.text
            if text.count>12000{error="Transcript is full. Review these items before adding more.";close()}
        case "error","conversation.item.input_audio_transcription.failed":
            error="Some speech could not be transcribed. Review the transcript or try again.";close()
        default:break
        }
    }
    func finish() async {
        guard !finishing, connection != nil else{return};finishing=true;connection?.setMuted(true)
        if speaking {try? connection?.send(JSONSerialization.data(withJSONObject:["type":"input_audio_buffer.commit"]))}
        // Keep transport alive until outstanding final transcripts arrive.
        for count in 0..<40 {
            try? await Task.sleep(for:.milliseconds(200))
            if Task.isCancelled{break}
            if count>=8 && waiting.isEmpty && !transcript.hasPending {break}
        }
        if !waiting.isEmpty || transcript.hasPending {error="Some speech is unfinished. Check the transcript before adding items."}
        close();finishing=false
    }
    func sceneChanged(to phase:ScenePhase) {
        let scene:ShoppingVoiceScene = switch phase{case .active:.active;case .background:.background;default:.inactive}
        if ShoppingVoiceScene.shouldClose(scene,requestingPermission:requestingPermission){close()}
    }
    func close(){run=UUID();timer?.cancel();timer=nil;connection?.onEvent=nil;connection?.onFailure=nil;connection?.close();connection=nil;listening=false;connecting=false;speaking=false;waiting=[]}
}
struct ShoppingVoiceView:View {
    @ObservedObject var store:ShoppingStore
    let onAdd:([GroceryItem])->Void
    @StateObject private var voice=ShoppingVoice()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @AppStorage("shopping.liveTranscriptionEnabled") private var consent = true
    @State private var startBell = ShoppingVoiceBell()
    @State private var parsing=false
    @State private var error:String?
    var body:some View {
        NavigationStack {
            ZStack{TodayBackdrop();ScrollView{VStack(spacing:22){
                Text("Tell me what to add").font(.largeTitle.bold())
                Text("Try “six bananas, one gallon of milk, and two bags of rice 5 kg.”").foregroundStyle(.secondary)
                Button{
                    if !voice.listening { startBell.play() }
                    Task{if voice.listening{await voice.finish()}else{await voice.start(store:store)}}
                }label:{
                    Image(systemName:voice.listening ? "pause.fill":"mic.fill").font(.system(size:48)).foregroundStyle(.white).frame(width:140,height:140).background(NexdoTheme.gradient,in:Circle()).shadow(color:.nexdoIndigo.opacity(0.2),radius:24)
                }.disabled(!consent || voice.connecting || voice.finishing).accessibilityLabel(voice.listening ? "Pause listening":"Start listening")
                Text(!consent ? "Enable live transcription below to start":voice.finishing ? "Finishing transcription…":voice.connecting ? "Connecting…":voice.listening ? "Listening — keep going":"Tap Mic and Talk").font(.headline)
                if let message=voice.error {Text(message).font(.callout).foregroundStyle(.red).multilineTextAlignment(.center)}
                Toggle("Allow live voice transcription",isOn:$consent).onChange(of:consent){_,value in if !value{voice.close()}}
                Text("Tap the mic to transcribe in English. Audio is sent only while listening. Nexdo organizes your words into grocery items before adding them.").font(.caption).foregroundStyle(.secondary)
                TextEditor(text:$voice.text).frame(minHeight:120).padding(10).background(.ultraThinMaterial,in:RoundedRectangle(cornerRadius:16)).accessibilityLabel("Shopping transcript")
                MomentPrimary(title:parsing ? "Adding…":"Add to List"){Task{await addItems()}}
                    .disabled(parsing || voice.text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                if let message=error {Text(message).foregroundStyle(.red)}
            }.padding(20)}}
            .navigationTitle("Add by Voice").navigationBarTitleDisplayMode(.inline)
            .toolbar{ToolbarItem(placement:.cancellationAction){Button("Close"){voice.close();dismiss()}}}
            .onDisappear{voice.close()}
            .onChange(of:phase){_,value in voice.sceneChanged(to:value)}
        }
    }
    @MainActor private func addItems() async {
        parsing=true;error=nil
        await voice.finish()
        do {
            let items=try await store.parse(voice.text).filter{!$0.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}
            guard !items.isEmpty else{error="No items found. Type or dictate an item.";parsing=false;return}
            onAdd(items);dismiss()
        } catch {self.error=error.localizedDescription;parsing=false}
    }
}


/// A short local cue; it does not start recording or change the shared audio session.
@MainActor private final class ShoppingVoiceBell {
    private var player: AVAudioPlayer?
    func play() {
        guard let url = Bundle.main.url(forResource: "shopping-mic-bell", withExtension: "wav") else { return }
        player = try? AVAudioPlayer(contentsOf: url)
        player?.volume = 0.5
        player?.prepareToPlay()
        player?.play()
    }
}
