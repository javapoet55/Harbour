import SwiftUI
import PhotosUI
import AVFoundation

struct ShoppingItemEditor:View {
    @ObservedObject var store:ShoppingStore
    @Environment(\.dismiss) private var dismiss
    @State var initial:GroceryItem
    let onSave:(GroceryItem)->Void
    @State private var selectedPhoto:PhotosPickerItem?
    @State private var camera=false
    @State private var busy=false
    @State private var error:String?
    @State private var aiConsent=false
    @State private var imageDetails=""
    @State private var imageExpanded=false
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
                    Picker("Category",selection:$initial.category){ForEach(GroceryItem.categories,id:\.self){Text($0)}}
                    HStack{Text("Quantity");TextField("1",text:$initial.quantity).multilineTextAlignment(.trailing).keyboardType(.decimalPad)}
                    TextField("Size, e.g. 1 gallon or 500 g",text:$initial.size)
                    TextField("Brand or notes",text:$initial.notes,axis:.vertical)
                }
                Section {
                    DisclosureGroup("Item Image",isExpanded:$imageExpanded) {
                        if let photo {
                            Image(uiImage:photo).resizable().scaledToFit().frame(maxWidth:.infinity,maxHeight:200)
                                .accessibilityLabel("Attached item image")
                            Button("Remove Image",role:.destructive){initial.imageData=nil}
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
                        Text("AI receives the item name and image description. Photos you attach are not sent to AI. The image is saved with the item when you tap Save.").font(.caption).foregroundStyle(.secondary)
                        Button{Task{await generate()}}label:{Label("Generate with AI",systemImage:"sparkles")}
                            .disabled(!aiConsent || initial.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                    }
                }.disabled(busy)
                if busy {ProgressView("Preparing image…")}
                if let error {Text(error).foregroundStyle(.red)}
            }
            .navigationTitle("Edit Item")
            .toolbar {
                ToolbarItem(placement:.cancellationAction){Button("Cancel"){generation=UUID();dismiss()}}
                ToolbarItem(placement:.confirmationAction){Button("Save"){onSave(initial);dismiss()}.disabled(busy || initial.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)}
            }
            .sheet(isPresented:$camera){ShoppingCamera{image in camera=false;if let image{attach(image)}}}
            .onChange(of:selectedPhoto){_,value in Task{
                guard let value else{return};busy=true;error=nil
                defer{busy=false}
                do{guard let data=try await value.loadTransferable(type:Data.self),let image=UIImage(data:data) else{throw APIError.invalidResponse};attach(image)}
                catch{self.error="Could not open that photo. Choose another image."}
            }}
            .onDisappear{generation=UUID()}
        }.tint(.nexdoIndigo)
    }
    private func attach(_ image:UIImage){
        // Redraw to normalize orientation and strip camera location/EXIF metadata.
        let ratio=min(1,480/max(image.size.width,image.size.height))
        let size=CGSize(width:max(1,image.size.width*ratio),height:max(1,image.size.height*ratio))
        let format=UIGraphicsImageRendererFormat();format.scale=1;format.opaque=true
        let rendered=UIGraphicsImageRenderer(size:size,format:format).image{context in
            UIColor.white.setFill();context.fill(CGRect(origin:.zero,size:size));image.draw(in:CGRect(origin:.zero,size:size))
        }
        for quality in [0.8,0.6,0.4,0.2] {
            if let data=rendered.jpegData(compressionQuality:quality),data.count<=67000 {initial.imageData=data.base64EncodedString();error=nil;return}
        }
        error="This image is too detailed. Choose a simpler or cropped photo."
    }
    private func openCamera() async {
        guard await AVCaptureDevice.requestAccess(for:.video) else{error="Camera access is off. Enable it for Nexdo in Settings, or choose a photo.";return}
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
