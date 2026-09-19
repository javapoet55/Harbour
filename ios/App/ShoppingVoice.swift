import SwiftUI
import AVFoundation

/// Keeps one WebRTC transcription session open across multiple speech turns.
@MainActor final class ShoppingVoice:ObservableObject {
    @Published var listening=false
    @Published var connecting=false
    @Published var finishing=false
    @Published var text=""
    @Published var error:String?
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
        guard await AVAudioApplication.requestRecordPermission() else{connecting=false;error="Allow microphone access in iOS Settings, or type your items.";return}
        guard run==generation else{return}
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
    @State private var review:[GroceryItem]=[]
    @State private var reviewing=false
    @State private var parsing=false
    @State private var error:String?
    var body:some View {
        NavigationStack {
            ZStack{TodayBackdrop();ScrollView{VStack(spacing:22){
                Text(reviewing ? "Review your items":"Tell me what to add").font(.largeTitle.bold())
                Text("Try “six bananas, one gallon of milk, and two bags of rice 5 kg.”").foregroundStyle(.secondary)
                if !reviewing {
                    Button{
                        if !voice.listening { startBell.play() }
                        Task{if voice.listening{await voice.finish()}else{await voice.start(store:store)}}
                    }label:{
                        Image(systemName:voice.listening ? "pause.fill":"mic.fill").font(.system(size:48)).foregroundStyle(.white).frame(width:140,height:140).background(NexdoTheme.gradient,in:Circle()).shadow(color:.nexdoIndigo.opacity(0.2),radius:24)
                    }.disabled(!consent || voice.connecting || voice.finishing).accessibilityLabel(voice.listening ? "Pause listening":"Start listening")
                    Text(!consent ? "Enable live transcription below to start":voice.finishing ? "Finishing transcription…":voice.connecting ? "Connecting…":voice.listening ? "Listening — keep going":"Ready when you are").font(.headline)
                    Toggle("Allow live voice transcription",isOn:$consent).onChange(of:consent){_,value in if !value{voice.close()}}
                    Text("Tap the mic to transcribe in English. Audio is sent only while listening. Review items before adding them.").font(.caption).foregroundStyle(.secondary)
                    TextEditor(text:$voice.text).frame(minHeight:120).padding(10).background(.ultraThinMaterial,in:RoundedRectangle(cornerRadius:16)).accessibilityLabel("Shopping transcript")
                    MomentPrimary(title:parsing ? "Organizing…":"Review Items"){Task{
                        parsing=true;await voice.finish()
                        do{review=try await store.parse(voice.text);reviewing = !review.isEmpty;if review.isEmpty{error="No items found. Type or dictate an item."}}
                        catch{self.error=error.localizedDescription};parsing=false
                    }}.disabled(parsing || voice.text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                }else{
                    ForEach($review){$item in
                        MomentCard {
                            TextField("Item",text:$item.name)
                            HStack{TextField("Quantity",text:$item.quantity);TextField("Size",text:$item.size)}
                            Picker("Category",selection:$item.category){ForEach(GroceryItem.categories,id:\.self){Text($0)}}
                            TextField("Notes",text:$item.notes)
                            Button("Remove",role:.destructive){review.removeAll{$0.id==item.id}}
                        }
                    }
                    MomentPrimary(title:"Add \(review.count) Items"){onAdd(review);dismiss()}.disabled(review.isEmpty || review.contains{$0.name.trimmingCharacters(in:.whitespaces).isEmpty})
                    Button("Keep dictating"){reviewing=false}
                }
                if let message=error ?? voice.error {Text(message).foregroundStyle(.red)}
            }.padding(20)}}
            .navigationTitle("Add by Voice").navigationBarTitleDisplayMode(.inline)
            .toolbar{ToolbarItem(placement:.cancellationAction){Button("Close"){voice.close();dismiss()}}}
            .onDisappear{voice.close()}
            .onChange(of:phase){_,value in if value != .active{voice.close()}}
        }
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
