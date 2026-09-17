import SwiftUI
import ContactsUI
import OSLog

/// No personal payloads: only fixed event names leave this interface.
enum FestivalEvent: String { case opened="festival_manage_opened", tab="festival_tab_selected", saved="festival_details_saved", contactAdded="festival_contact_added", contactRemoved="festival_contact_removed", generated="festival_message_generated", approved="festival_message_approved", imageStarted="festival_image_generation_started", imageCompleted="festival_image_generation_completed", imageFailed="festival_image_generation_failed", imageSelected="festival_image_selected", scheduled="festival_wish_scheduled", disabled="festival_moment_disabled", deleted="festival_moment_deleted" }
struct FestivalAnalytics { func record(_ event:FestivalEvent) { Logger(subsystem:"com.pinslots.nexdo",category:"festival").info("\(event.rawValue, privacy:.public)") } }

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
                    UIColor.systemOrange.setFill()
                    let bowl=UIBezierPath(ovalIn:CGRect(x:size.width*0.25,y:size.height*0.53,width:size.width*0.5,height:size.height*0.24));bowl.fill()
                    UIColor.systemYellow.setFill();UIBezierPath(ovalIn:CGRect(x:size.width*0.45,y:size.height*0.29,width:size.width*0.10,height:size.height*0.29)).fill()
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
