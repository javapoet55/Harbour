import SwiftUI
import PhotosUI
import AVFoundation

struct ShoppingItemEditor:View {
    @ObservedObject var store:ShoppingStore
    @Environment(\.dismiss) private var dismiss
    @State var initial:GroceryItem
    var launchCamera=false
    let onSave:(GroceryItem)->Void
    @State private var selectedPhoto:PhotosPickerItem?
    @State private var camera=false
    @State private var didLaunchCamera=false
    @State private var cameraDenied=false
    @State private var busy=false
    @State private var error:String?
    @State private var aiConsent=false
    @State private var imageDetails=""
    @State private var recognitionConsent=false
    @State private var showingRecognitionConsent=false
    @State private var recognizing=false
    @State private var pendingPhotoRecognition=false
    @State private var recognitionNotice:String?
    @State private var imageExpanded=false
    @State private var previewPhoto:ShoppingPhotoPreviewImage?
    @State private var generation=UUID()
    private var photo:UIImage? {
        guard let value=initial.imageData,let data=Data(base64Encoded:value) else{return nil}
        return UIImage(data:data)
    }
    var body:some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Item name",text:$initial.name)
                        .textInputAutocapitalization(.sentences)
                        .foregroundStyle(Color.nexdoBlue)
                    Picker("Category",selection:$initial.category){ForEach(GroceryItem.categories,id:\.self){Text($0)}}
                    HStack{Text("Quantity");TextField("1",text:$initial.quantity).multilineTextAlignment(.trailing).keyboardType(.decimalPad)}
                    TextField("Size, e.g. 1 gallon or 500 g",text:$initial.size)
                    TextField("Brand",text:Binding(get:{initial.brand ?? ""},set:{initial.brand=$0.isEmpty ? nil : $0}))
                        .foregroundStyle(Color.nexdoBlue)
                        .accessibilityIdentifier("shopping.item.brand")
                    TextField("+ Add Notes",text:$initial.notes,axis:.vertical)
                        .accessibilityLabel("Notes")
                }
                Section {
                    DisclosureGroup("Item Image",isExpanded:$imageExpanded) {
                        if let photo {
                            Button { previewPhoto=ShoppingPhotoPreviewImage(image:photo) } label: {
                                Image(uiImage:photo).resizable().scaledToFit().frame(maxWidth:.infinity,maxHeight:200)
                                    .contentShape(Rectangle())
                            }.buttonStyle(.plain)
                                .accessibilityLabel("Enlarge item image")
                                .accessibilityHint("Opens a full-screen photo with zoom controls")
                                .accessibilityIdentifier("shopping.photo.preview")
                            Button("Remove Image",role:.destructive){initial.imageData=nil;recognitionNotice=nil}
                            Button("Fill details from photo with AI"){requestRecognition()}
                                .accessibilityIdentifier("shopping.photo.identify")
                        }else {
                            Label("Attach a photo or create an illustration",systemImage:"photo.badge.plus")
                                .foregroundStyle(.secondary)
                        }
                        PhotosPicker(selection:$selectedPhoto,matching:.images,preferredItemEncoding:.compatible){Label("Choose from Photos",systemImage:"photo.on.rectangle")}
                        Button{Task{await openCamera()}}label:{Label("Take a Picture",systemImage:"camera")}
                            .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                        if !UIImagePickerController.isSourceTypeAvailable(.camera){Text("Camera is available on a supported device.").font(.caption).foregroundStyle(.secondary)}
                        TextField("Describe the image (optional)",text:$imageDetails,axis:.vertical)
                        Toggle("Allow AI image generation",isOn:$aiConsent)
                        Text("AI receives the item name and image description. Photo identification sends the attached photo to OpenAI only with your permission. The image is saved with the item when you tap Save.").font(.caption).foregroundStyle(.secondary)
                        Button{Task{await generate()}}label:{Label("Generate with AI",systemImage:"sparkles")}
                            .disabled(!aiConsent || initial.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                    }
                }.disabled(busy)
                if busy {ProgressView(recognizing ? "Identifying item…" : "Preparing image…")}
                if let recognitionNotice {Text(recognitionNotice).font(.caption).foregroundStyle(.secondary)}
                if let error {Text(error).foregroundStyle(.red)}
            }
            .disabled(busy)
            .navigationTitle(launchCamera ? "Add Item" : "Edit Item")
            .toolbar {
                ToolbarItem(placement:.cancellationAction){Button("Cancel"){generation=UUID();dismiss()}}
                ToolbarItem(placement:.confirmationAction){Button("Save"){onSave(initial);dismiss()}.disabled(busy || initial.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)}
            }
            .fullScreenCover(isPresented:$camera,onDismiss:{
                if pendingPhotoRecognition{pendingPhotoRecognition=false;requestRecognition()}
            }){ShoppingCamera{image in
                camera=false
                if let image{pendingPhotoRecognition=attach(image);imageExpanded=true}
                else if launchCamera && initial.imageData == nil{dismiss()}
            }.ignoresSafeArea()}
            .fullScreenCover(item:$previewPhoto) { ShoppingPhotoPreview(image:$0.image) }
            .onAppear { capitalizeItemName() }
            .onChange(of:initial.name) { _,_ in capitalizeItemName() }
            .task {
                guard launchCamera && !didLaunchCamera else{return}
                didLaunchCamera=true;imageExpanded=true
                await openCamera()
            }
            .alert("Identify this photo with AI?",isPresented:$showingRecognitionConsent){
                Button("Fill Details"){recognitionConsent=true;Task{await identify()}}
                Button("Enter Manually",role:.cancel){}
            }message:{Text("Send this photo to OpenAI to suggest the item name and visible brand. Review the details before saving.")}
            .alert("Camera access is off",isPresented:$cameraDenied){
                Button("Open Settings"){if let url=URL(string:UIApplication.openSettingsURLString){UIApplication.shared.open(url)}}
                Button("Cancel",role:.cancel){}
            }message:{Text("Allow camera access in Settings to take an item photo. You can also choose a photo from your library.")}
            .onChange(of:selectedPhoto){_,value in Task{
                guard let value else{return};busy=true;error=nil
                let run=UUID();generation=run
                defer{if generation==run{busy=false}}
                do{
                    guard let data=try await value.loadTransferable(type:Data.self),let image=UIImage(data:data) else{throw APIError.invalidResponse}
                    guard generation==run else{return}
                    if attach(image){requestRecognition()}
                }
                catch{if generation==run{self.error="Could not open that photo. Choose another image."}}
            }}
            .onDisappear{generation=UUID()}
        }.tint(.nexdoIndigo)
    }
    private func capitalizeItemName() {
        guard let index=initial.name.firstIndex(where: { $0.isLetter }) else { return }
        let next=initial.name.index(after:index)
        let capitalized=String(initial.name[..<index])+String(initial.name[index]).uppercased()+String(initial.name[next...])
        if initial.name != capitalized { initial.name=capitalized }
    }
    @discardableResult private func attach(_ image:UIImage)->Bool{
        recognitionNotice=nil
        // Redraw to normalize orientation and strip camera location/EXIF metadata.
        let ratio=min(1,480/max(image.size.width,image.size.height))
        let size=CGSize(width:max(1,image.size.width*ratio),height:max(1,image.size.height*ratio))
        let format=UIGraphicsImageRendererFormat();format.scale=1;format.opaque=true
        let rendered=UIGraphicsImageRenderer(size:size,format:format).image{context in
            UIColor.white.setFill();context.fill(CGRect(origin:.zero,size:size));image.draw(in:CGRect(origin:.zero,size:size))
        }
        for quality in [0.8,0.6,0.4,0.2] {
            if let data=rendered.jpegData(compressionQuality:quality),data.count<=67000 {initial.imageData=data.base64EncodedString();error=nil;return true}
        }
        error="This image is too detailed. Choose a simpler or cropped photo."
        return false
    }
    private func requestRecognition(){
        guard initial.imageData != nil else{return}
        if recognitionConsent {Task{await identify()}} else {showingRecognitionConsent=true}
    }
    @MainActor private func identify() async {
        guard let imageData=initial.imageData,recognitionConsent else{return}
        busy=true;recognizing=true;error=nil;recognitionNotice=nil
        let run=UUID();generation=run
        let originalName=initial.name,originalBrand=initial.brand,originalCategory=initial.category
        defer{if generation==run{busy=false;recognizing=false}}
        do {
            struct Input:Encodable{let imageData:String;let consent:Bool}
            struct Result:Decodable,Sendable{let name:String;let brand:String;let category:String;let confidence:String}
            let result:Result=try await store.api.request("/api/shopping/recognize",method:"POST",body:JSONEncoder().encode(Input(imageData:imageData,consent:true)),timeout:40)
            guard generation==run,initial.imageData==imageData else{return}
            if initial.name==originalName{initial.name=result.name}
            if initial.brand==originalBrand{initial.brand=result.brand.isEmpty ? nil : result.brand}
            if initial.category==originalCategory{initial.category=result.category}
            recognitionNotice="AI suggested these details. Check the name and brand before saving."
        }catch{
            guard generation==run else{return}
            switch error {
            case APIError.response(404), APIError.server(404, _):
                self.error="Photo identification is temporarily unavailable. Your photo is still attached. Enter the item name and brand manually, or try again later."
            default: self.error=error.localizedDescription
            }
        }
    }
    private func openCamera() async {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else{
            error="Camera is unavailable on this device. Choose a photo from your library instead.";return
        }
        guard await AVCaptureDevice.requestAccess(for:.video) else{cameraDenied=true;return}
        camera=true
    }
    private func generate() async {
        busy=true;error=nil;let run=UUID();generation=run
        defer{if generation==run{busy=false}}
        do {
            struct Result:Decodable,Sendable{let data:String}
            struct Input:Encodable{let name:String;let details:String;let consent:Bool}
            let response:Result=try await store.api.request("/api/shopping/image",method:"POST",body:JSONEncoder().encode(Input(name:initial.name,details:imageDetails,consent:aiConsent)),timeout:150)
            guard generation==run else{return}
            guard let data=Data(base64Encoded:response.data),let image=UIImage(data:data) else{throw APIError.invalidResponse}
            attach(image)
        }catch{if generation==run{self.error=error.localizedDescription}}
    }
}
private struct ShoppingCamera:UIViewControllerRepresentable {
    let onFinish:(UIImage?)->Void
    func makeCoordinator()->Coordinator{Coordinator(onFinish:onFinish)}
    func makeUIViewController(context:Context)->UIImagePickerController{
        let picker=UIImagePickerController();picker.sourceType = .camera;picker.delegate=context.coordinator;return picker
    }
    func updateUIViewController(_ controller:UIImagePickerController,context:Context){}
    final class Coordinator:NSObject,UIImagePickerControllerDelegate,UINavigationControllerDelegate {
        let onFinish:(UIImage?)->Void
        init(onFinish:@escaping(UIImage?)->Void){self.onFinish=onFinish}
        func imagePickerControllerDidCancel(_ picker:UIImagePickerController){onFinish(nil)}
        func imagePickerController(_ picker:UIImagePickerController,didFinishPickingMediaWithInfo info:[UIImagePickerController.InfoKey:Any]){onFinish(info[.originalImage] as? UIImage)}
    }
}

private struct ShoppingPhotoPreviewImage:Identifiable {
    let id=UUID()
    let image:UIImage
}

private struct ShoppingPhotoPreview:View {
    let image:UIImage
    @Environment(\.dismiss) private var dismiss
    @State private var scale:CGFloat=1
    @State private var gestureStartScale:CGFloat=1
    var body:some View {
        NavigationStack {
            GeometryReader { geometry in
                ScrollView([.horizontal,.vertical]) {
                    Image(uiImage:image).resizable().scaledToFit()
                        .frame(width:geometry.size.width*scale,height:geometry.size.height*scale)
                        .accessibilityLabel("Item photo")
                        .gesture(MagnifyGesture()
                            .onChanged { scale=min(5,max(1,gestureStartScale*$0.magnification)) }
                            .onEnded { _ in gestureStartScale=scale })
                        .onTapGesture(count:2) { setZoom(scale>1 ? 1 : 2.5) }
                }.scrollIndicators(.hidden)
            }.background(Color.black)
                .navigationTitle("Item Image").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement:.cancellationAction) {
                        Button("Done") { dismiss() }.accessibilityIdentifier("shopping.photo.preview.done")
                    }
                    ToolbarItemGroup(placement:.primaryAction) {
                        Button { setZoom(scale-1) } label: { Image(systemName:"minus.magnifyingglass") }
                            .accessibilityLabel("Zoom out").disabled(scale<=1)
                        Button { setZoom(scale+1) } label: { Image(systemName:"plus.magnifyingglass") }
                            .accessibilityLabel("Zoom in").disabled(scale>=5)
                    }
                }
        }.tint(.nexdoBlue)
    }
    private func setZoom(_ value:CGFloat) { scale=min(5,max(1,value));gestureStartScale=scale }
}
