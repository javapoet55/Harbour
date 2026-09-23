import SwiftUI
import ContactsUI
import OSLog

/// No personal payloads: only fixed event names leave this interface.
enum FestivalEvent: String { case opened="festival_manage_opened", tab="festival_tab_selected", saved="festival_details_saved", contactAdded="festival_contact_added", contactRemoved="festival_contact_removed", generated="festival_message_generated", approved="festival_message_approved", imageStarted="festival_image_generation_started", imageCompleted="festival_image_generation_completed", imageFailed="festival_image_generation_failed", imageSelected="festival_image_selected", scheduled="festival_wish_scheduled", disabled="festival_moment_disabled", deleted="festival_moment_deleted" }
@MainActor struct FestivalAnalytics { func record(_ event:FestivalEvent) { NexdoAnalytics.logEvent(event.rawValue, parameters:nil); Logger(subsystem:"com.pinslots.nexdo",category:"festival").info("\(event.rawValue, privacy:.public)") } }

/// Preview-only provider: local artwork, no AI request and no production claims.
struct MockFestivalImageService: FestivalImageGenerationService {
    func generate(_ request:FestivalImageRequest) async throws -> [FestivalImageVariation] {
        try await Task.sleep(for:.milliseconds(800)); try Task.checkCancellation()
        return await MainActor.run {
            (0..<3).map { index in
                let size = request.aspect == "Portrait" ? CGSize(width:400,height:600) : request.aspect == "Landscape" ? CGSize(width:600,height:400) : CGSize(width:512,height:512)
                let data=UIGraphicsImageRenderer(size:size).pngData { context in
                    let rect=CGRect(origin:.zero,size:size)
                    UIColor(red:0.15+Double(index)*0.08,green:0.08,blue:0.35,alpha:1).setFill();context.fill(rect)
                    if !request.festival.localizedCaseInsensitiveContains("diwali") {
                        let symbol=request.festival.localizedCaseInsensitiveContains("anniversary") ? "heart.fill" : request.festival.localizedCaseInsensitiveContains("well") ? "sun.max.fill" : "gift.fill"
                        UIImage(systemName:symbol)?.withTintColor(.systemYellow,renderingMode:.alwaysOriginal).draw(in:CGRect(x:size.width*0.25,y:size.height*0.3,width:size.width*0.5,height:size.width*0.5))
                    } else {
                    UIColor.systemOrange.setFill()
                    let bowl=UIBezierPath(ovalIn:CGRect(x:size.width*0.25,y:size.height*0.53,width:size.width*0.5,height:size.height*0.24));bowl.fill()
                    UIColor.systemYellow.setFill();UIBezierPath(ovalIn:CGRect(x:size.width*0.45,y:size.height*0.29,width:size.width*0.10,height:size.height*0.29)).fill()
                    }
                    for i in 0..<12 { UIColor.systemYellow.withAlphaComponent(0.35).setFill(); UIBezierPath(ovalIn:CGRect(x:CGFloat(i)*size.width/12,y:CGFloat((i*53)%150)+12,width:8,height:8)).fill() }
                }
                return FestivalImageVariation(id:UUID().uuidString,data:data,isMock:true)
            }
        }
    }
    func cancel() async {}
}
protocol FestivalImageStorageService { func store(_ image:FestivalImageVariation) throws -> String; func load(_ id:String) -> Data?; func delete(_ id:String) }
struct ProtectedFestivalImageStorage: FestivalImageStorageService {
    private var folder:URL { FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("FestivalImages") }
    func store(_ image:FestivalImageVariation) throws -> String {
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        let name=UUID().uuidString+".png";let url=folder.appendingPathComponent(name)
        try image.data.write(to:url,options:[.atomic,.completeFileProtection])
        var protected=url;var values=URLResourceValues();values.isExcludedFromBackup=true;try protected.setResourceValues(values)
        return name
    }
    func load(_ id:String) -> Data? { guard id==URL(fileURLWithPath:id).lastPathComponent,!id.isEmpty else { return nil };return try? Data(contentsOf:folder.appendingPathComponent(id)) }
    func delete(_ id:String) { guard !id.isEmpty,id==URL(fileURLWithPath:id).lastPathComponent else {return};try? FileManager.default.removeItem(at:folder.appendingPathComponent(id)) }
}
struct FestivalContactChoice: Identifiable {
    var id:String;var name:String;var phones:[String];var emails:[String]
}
struct ManagedFestivalContactsPicker: UIViewControllerRepresentable {
    let selected:([FestivalContactChoice])->Void
    func makeCoordinator()->Coordinator {Coordinator(selected)}
    func makeUIViewController(context:Context)->CNContactPickerViewController {
        let c=CNContactPickerViewController();c.delegate=context.coordinator
        c.displayedPropertyKeys=[CNContactPhoneNumbersKey,CNContactEmailAddressesKey];return c
    }
    func updateUIViewController(_ c:CNContactPickerViewController,context:Context) {}
    @MainActor final class Coordinator:NSObject,@preconcurrency CNContactPickerDelegate {
        let selected:([FestivalContactChoice])->Void
        init(_ selected:@escaping ([FestivalContactChoice])->Void) {self.selected=selected}
        func contactPicker(_ picker:CNContactPickerViewController,didSelect contacts:[CNContact]) {
            selected(contacts.map { c in FestivalContactChoice(id:c.identifier,name:CNContactFormatter.string(from:c,style:.fullName) ?? c.givenName,phones:c.isKeyAvailable(CNContactPhoneNumbersKey) ? c.phoneNumbers.map(\.value.stringValue):[],emails:c.isKeyAvailable(CNContactEmailAddressesKey) ? c.emailAddresses.map {String($0.value)}:[]) })
        }
    }
}
@MainActor struct FestivalContactsService {
    func validate(_ recipients:[ManagedFestivalRecipient]) throws {
        let status=CNContactStore.authorizationStatus(for:.contacts)
        // Picker-granted records remain usable without a whole-address-book grant.
        guard status == .authorized else { return }
        let store=CNContactStore()
        for r in recipients where r.selected && !r.contactIdentifier.isEmpty {
            guard let c=try? store.unifiedContact(withIdentifier:r.contactIdentifier,keysToFetch:[CNContactPhoneNumbersKey as CNKeyDescriptor,CNContactEmailAddressesKey as CNKeyDescriptor]) else {throw FestivalError.message("A selected contact was deleted. Re-select or enter the recipient manually.")}
            if !r.phone.isEmpty && !c.phoneNumbers.contains(where:{FestivalValidation.phone($0.value.stringValue)==FestivalValidation.phone(r.phone)}) {throw FestivalError.message("A contact’s phone number changed. Review their delivery address.")}
            if !r.email.isEmpty && !c.emailAddresses.contains(where:{String($0.value).lowercased()==r.email.lowercased()}) {throw FestivalError.message("A contact’s email changed. Review their delivery address.")}
        }
    }
}
enum FestivalError:LocalizedError {case message(String);var errorDescription:String? {if case let .message(value)=self{return value};return nil}}

/// Native typesetting keeps the greeting and signature editable and legible.
struct FestivalGreetingCard: View {
    let artwork:UIImage
    let title,message,signature:String
    var body:some View {
        VStack(spacing:0) {
            Image(uiImage:artwork).resizable().scaledToFit().frame(maxWidth:.infinity).frame(height:230).background(Color(red:0.15,green:0.08,blue:0.35))
            VStack(spacing:16) {
                Text(title).font(.system(size:30,weight:.semibold,design:.serif)).foregroundStyle(Color(red:0.25,green:0.12,blue:0.37))
                Rectangle().fill(Color.orange.opacity(0.5)).frame(width:48,height:2)
                Text(message).font(.system(size:17,design:.serif)).lineSpacing(5).foregroundStyle(Color(red:0.25,green:0.22,blue:0.29)).fixedSize(horizontal:false,vertical:true)
                if !signature.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {
                    Text(signature).font(.system(size:23,weight:.medium,design:.serif)).italic().foregroundStyle(Color(red:0.48,green:0.25,blue:0.13)).fixedSize(horizontal:false,vertical:true).padding(.top,6)
                }
            }.multilineTextAlignment(.center).padding(26).frame(maxWidth:.infinity)
                .background(Color(red:1,green:0.97,blue:0.91))
        }.clipShape(RoundedRectangle(cornerRadius:20))
            .overlay(RoundedRectangle(cornerRadius:20).stroke(Color.orange.opacity(0.25)))
            .accessibilityIdentifier("greeting-card-preview")
    }
}
/// The finished card as displayed, as a JPEG for scheduled emails (PUT /api/moments/{id}/card).
enum GreetingCardRenderer {
    static let width:CGFloat=380
    @MainActor static func jpeg(artwork:UIImage,title:String,message:String,signature:String,encoding:GreetingCardEncoding) throws -> Data {
        // JPEG has no transparency: the rounded corners sit on white rather than black.
        let renderer=ImageRenderer(content:FestivalGreetingCard(artwork:artwork,title:title,message:message,signature:signature).frame(width:width).background(Color.white).environment(\.colorScheme,.light))
        renderer.isOpaque=true
        renderer.scale=1
        guard let measured=renderer.uiImage else {throw GreetingCardUploadError.renderFailed}
        renderer.scale=min(3,encoding.longestSide/max(measured.size.width,measured.size.height))
        guard let image=renderer.uiImage,let data=image.jpegData(compressionQuality:encoding.quality) else {throw GreetingCardUploadError.renderFailed}
        return data
    }
}
/// A card saved on another device: the finished image only, since its artwork is not on this one.
struct StoredGreetingCard:View {
    let image:UIImage
    var body:some View {
        VStack(alignment:.leading,spacing:6) {
            Image(uiImage:image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius:20)).accessibilityLabel("Saved greeting card").accessibilityIdentifier("stored-greeting-card")
            Text("Your saved card. Create new artwork to change it.").font(.caption).foregroundStyle(.secondary)
        }
    }
}
/// Shown after a card save when the card could not be attached to scheduled emails, with Retry.
struct GreetingCardUploadStatus:View {
    @ObservedObject var model:ManageFestivalModel
    var body:some View {
        if model.uploadingCard {
            ProgressView("Attaching card to scheduled emails…").font(.caption)
        } else if model.cardUploadFailed {
            HStack(alignment:.firstTextBaseline) {
                Label(ManageFestivalModel.cardUploadFailedNote,systemImage:"exclamationmark.triangle.fill").font(.caption).foregroundStyle(.orange)
                Spacer()
                Button("Retry"){Task{await model.uploadCard()}}.font(.caption.bold()).accessibilityIdentifier("card-upload-retry")
            }.accessibilityIdentifier("card-upload-failed")
        }
    }
}
struct FestivalGreetingCardEditor:View {
    @ObservedObject var model:ManageFestivalModel
    @EnvironmentObject private var appModel: AppModel
    var saveOnUse=false
    @Environment(\.dismiss) private var dismiss
    @State private var selected:FestivalImageVariation?
    @State private var shared:CardShareItem?
    @FocusState private var editing:Bool
    private var artwork:UIImage? { (selected?.data ?? model.imageData).flatMap(UIImage.init(data:)) }
    private var greeting:Binding<String> {Binding(get:{model.settings.cardGreeting ?? model.settings.baseMessage},set:{model.settings.cardGreeting=String($0.prefix(500))})}
    private var signature:Binding<String> {Binding(get:{model.settings.cardSignature ?? ""},set:{model.settings.cardSignature=String($0.prefix(80))})}
    var body:some View {
        NavigationStack {
            ZStack {TodayBackdrop();ScrollView {
                VStack(alignment:.leading,spacing:22) {
                    Text("A little more personal.").font(.title.bold())
                    Text("Create artwork for your occasion, then finish your card with a greeting and signature.").foregroundStyle(.secondary)
                    if let artwork {
                        FestivalGreetingCard(artwork:artwork,title:model.title,message:greeting.wrappedValue,signature:signature.wrappedValue)
                    } else if let data=model.storedCardImage,let stored=UIImage(data:data) {
                        StoredGreetingCard(image:stored)
                    } else {
                        VStack(spacing:16){Image(systemName:"envelope.open.fill").font(.system(size:54)).foregroundStyle(Color.nexdoIndigo);Text(model.title).font(.title2.bold());Text("Your greeting card will appear here").foregroundStyle(.secondary)}.frame(maxWidth:.infinity,minHeight:240).background(.ultraThinMaterial,in:RoundedRectangle(cornerRadius:22))
                    }
                    MomentCard {
                        Label("Make it yours",systemImage:"pencil.and.outline").font(.headline)
                        Text("Greeting").font(.subheadline.bold())
                        TextField("Your greeting",text:greeting,axis:.vertical).lineLimit(3...8).focused($editing).accessibilityIdentifier("card-greeting")
                        Divider()
                        Text("Your signature").font(.subheadline.bold())
                        TextField("Your signature",text:signature,axis:.vertical).lineLimit(1...3).focused($editing).accessibilityIdentifier("card-signature")
                        Text("Appears at the bottom of your card. \(signature.wrappedValue.count)/80").font(.caption).foregroundStyle(.secondary)
                    }
                    MomentCard {
                        Label("Artwork",systemImage:"sparkles").font(.headline)
                        Picker("Style",selection:$model.settings.imageStyle){ForEach(["Traditional","Modern","Minimal","Colorful","Elegant"],id:\.self){Text($0)}}
                        Picker("Artwork format",selection:$model.settings.imageAspect){ForEach(["Portrait","Square","Landscape"],id:\.self){Text($0)}}
                        TextField("Describe the artwork (optional)",text:$model.settings.imagePrompt,axis:.vertical).focused($editing).onChange(of:model.settings.imagePrompt){_,value in model.settings.imagePrompt=String(value.prefix(1000))}
                        Text("Generate sends the occasion, style and scene description to OpenAI. Your greeting, signature and contacts stay out of that request.").font(.caption).foregroundStyle(.secondary)
                        if model.isDesignPreview {Text("Design preview · sample artwork").font(.caption).foregroundStyle(.orange)}
                        if model.generatingImage {ProgressView("Creating your artwork…");Button("Cancel generation"){model.cancelImage()}}
                        else {Button(artwork == nil ? "Generate AI Greeting Card":"Regenerate Artwork",systemImage:"sparkles"){editing=false;model.generateImage()}.buttonStyle(.borderedProminent)}
                    }
                    if !model.images.isEmpty {
                        Text("Choose artwork").font(.headline)
                        ScrollView(.horizontal){HStack{ForEach(model.images){variation in
                            if let image=UIImage(data:variation.data) {
                                Button{selected=variation}label:{Image(uiImage:image).resizable().scaledToFill().frame(width:90,height:110).clipped().clipShape(RoundedRectangle(cornerRadius:12)).overlay(RoundedRectangle(cornerRadius:12).stroke(selected?.id==variation.id ? Color.nexdoIndigo:Color.clear,lineWidth:3))}.accessibilityLabel("Choose artwork \(model.images.firstIndex(where:{$0.id==variation.id})!+1)")
                            }
                        }}}
                    }
                    if let error=model.error {Text(error).foregroundStyle(.red)}
                    if artwork != nil {
                        MomentPrimary(title:"Use This Card") {
                            model.settings.cardGreeting=greeting.wrappedValue
                            if let selected {model.chooseImage(selected)}
                            if model.error == nil {
                                if saveOnUse {Task{if await model.saveGreetingCard(){dismiss()}}}
                                else {dismiss()}
                            }
                        }
                        .disabled(model.busy || model.generatingImage)
                        if model.busy {ProgressView("Saving card…")}
                        Button("Share Card",systemImage:"square.and.arrow.up") {share()}.frame(maxWidth:.infinity,minHeight:44).buttonStyle(.bordered)
                        Text(saveOnUse ? "Use This Card saves the greeting and signature to this moment. Artwork is stored on this device." : "Use This Card applies it to this moment. Tap Save Message on the next screen to save your changes.").font(.caption).foregroundStyle(.secondary)
                    }
                    GreetingCardUploadStatus(model:model)
                    if artwork != nil || model.storedCardImage != nil {
                        Button("Remove card",systemImage:"trash",role:.destructive){Task{await model.removeCard(saveSettings:saveOnUse);if model.error == nil {dismiss()}}}
                            .frame(maxWidth:.infinity,minHeight:44).disabled(model.busy).accessibilityIdentifier("remove-greeting-card")
                    }
                }.padding(18)
            }.scrollDismissesKeyboard(.interactively)}
            .navigationTitle("Greeting Card").navigationBarTitleDisplayMode(.inline)
            .toolbar{ToolbarItem(placement:.topBarTrailing){Button("Done"){model.cancelImage();dismiss()}};ToolbarItemGroup(placement:.keyboard){Spacer();Button("Done"){editing=false}}}
            .onAppear {
                if model.settings.cardSignature == nil {
                    model.settings.cardSignature = GreetingCardSignature.defaultValue(profileName: appModel.profile?.name ?? "")
                }
            }
            .task{await model.loadStoredCard()}
            .onChange(of:model.images.map(\.id)){_,_ in selected=model.images.first}
            .onDisappear{model.cancelImage()}
            .sheet(item:$shared){CardActivitySheet(image:$0.image)}
        }
    }
    @MainActor private func share() {
        guard let artwork else{return}
        let renderer=ImageRenderer(content:FestivalGreetingCard(artwork:artwork,title:model.title,message:greeting.wrappedValue,signature:signature.wrappedValue).frame(width:380).environment(\.colorScheme,.light))
        renderer.scale=3
        if let image=renderer.uiImage {shared=CardShareItem(image:image)}else{model.error="The card could not be prepared for sharing."}
    }
}
private struct CardShareItem:Identifiable {let id=UUID();let image:UIImage}
private struct CardActivitySheet:UIViewControllerRepresentable {
    let image:UIImage
    func makeUIViewController(context:Context)->UIActivityViewController {UIActivityViewController(activityItems:[image],applicationActivities:nil)}
    func updateUIViewController(_ controller:UIActivityViewController,context:Context){}
}

/// Reuses the festival card editor without changing a moment's recipients or scheduled text.
struct MomentGreetingCardSection:View {
    @StateObject private var model:ManageFestivalModel
    @State private var showingEditor=false
    var greeting:String?
    init(moment:ImportantMoment,store:ImportantMomentsStore,greeting:String?=nil) {
        let current=store.moments.first(where:{$0.id==moment.id}) ?? moment
        _model=StateObject(wrappedValue:ManageFestivalModel(group:MomentDisplayGroup.groups([current])[0],store:store))
        self.greeting=greeting
    }
    var body:some View {
        VStack(alignment:.leading,spacing:14) {
            if let data=model.imageData,let artwork=UIImage(data:data) {
                FestivalGreetingCard(artwork:artwork,title:model.title,message:model.settings.cardGreeting ?? model.settings.baseMessage,signature:model.settings.cardSignature ?? "")
            } else if let data=model.storedCardImage,let stored=UIImage(data:data) {
                StoredGreetingCard(image:stored)
            }
            Button(model.imageData == nil ? "Create AI Greeting Card":"Edit Greeting Card",systemImage:"sparkles") {
                if let greeting,!greeting.isEmpty {model.settings.baseMessage=greeting}
                showingEditor=true
            }.buttonStyle(.borderedProminent).accessibilityIdentifier("moment-greeting-card")
            Text("Create and share a card with your greeting and signature. Scheduled emails include your saved card; Messages send the text only.").font(.caption).foregroundStyle(.secondary)
            GreetingCardUploadStatus(model:model)
            if model.imageData != nil || model.storedCardImage != nil {
                Button("Remove card",role:.destructive){Task{await model.removeCard(saveSettings:true)}}.disabled(model.busy).accessibilityIdentifier("remove-greeting-card")
            }
            if let notice=model.notice {Text(notice).font(.caption)}
        }.sheet(isPresented:$showingEditor){FestivalGreetingCardEditor(model:model,saveOnUse:true)}
            .task{await model.loadStoredCard()}
    }
}
