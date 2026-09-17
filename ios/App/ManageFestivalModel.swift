import SwiftUI
import CryptoKit

@MainActor final class ManageFestivalModel: ObservableObject {
    enum Tab:String,CaseIterable {case details="Details",contacts="Contacts",message="Wish Message",schedule="Schedule"}
    @Published var tab:Tab = .details
    @Published var title:String
    @Published var date:Date
    @Published var zone:String
    @Published var yearly:Bool
    @Published var active:Bool
    @Published var recipients:[ManagedFestivalRecipient]
    @Published var settings=FestivalSettings()
    @Published var sendDate=Date()
    @Published var notify=true
    @Published var busy=false
    @Published var generatingImage=false
    @Published var error:String?
    @Published var notice:String?
    @Published var images:[FestivalImageVariation]=[]
    @Published var catalog:[FestivalCatalogEntry]=[]
    @Published var savedPlans:[WishDeliveryPlan]=[]
    @Published var scheduleCompleted=false
    @Published var imageData:Data?
    private(set) var originals:[ImportantMoment]
    let store:ImportantMomentsStore
    private let imageService:any FestivalImageGenerationService
    private let imageStorage:any FestivalImageStorageService
    private var imageTask:Task<Void,Never>?
    private var baseline=""
    private var savedImageID=""
    private var stagedImages=Set<String>()
    private var keys:[String:String]=[:]
    private var draftIDs:[String:String]=[:]
    private let analytics=FestivalAnalytics()
    let contactsService=FestivalContactsService()
    var source:String { originals.first?.source ?? "manual" }
    var hasSchedules:Bool { originals.contains {$0.drafts.contains {$0.plans?.contains { $0.editable || $0.status == "SENDING" } == true}} }
    var selected:[ManagedFestivalRecipient] { recipients.filter(\.selected) }
    var emailReady:Bool { store.snapshot?.automaticEmailEnabled == true && store.snapshot?.emailAccount?.status == "connected" }
    var dirty:Bool { fingerprint != baseline }
    private func encoded<T:Encodable>(_ value:T) -> String {let encoder=JSONEncoder();encoder.outputFormatting = [.sortedKeys];return String(data:(try? encoder.encode(value)) ?? Data(),encoding:.utf8) ?? ""}
    private var fingerprint:String { let state=[title,MomentDates.day(date,zone:zone),zone,String(yearly),String(active),encoded(recipients),encoded(settings)];return state.joined(separator:"|") }
    init(group:MomentDisplayGroup,store:ImportantMomentsStore,imageService:any FestivalImageGenerationService=MockFestivalImageService(),imageStorage:any FestivalImageStorageService=ProtectedFestivalImageStorage()) {
        self.store=store;self.originals=group.moments;self.imageService=imageService;self.imageStorage=imageStorage
        let first=group.moments[0];title=first.title;zone=first.timeZoneID;date=MomentDates.date(first.nextOccurrence,zone:first.timeZoneID);yearly=first.yearly;active=group.moments.contains(where: \.enabled)
        var saved=FestivalSettings.read(first.festivalSettings) ?? FestivalSettings()
        recipients=group.moments.map { m in
            let key=m.sourceKey.hasPrefix("festival:"+saved.groupID+":") ? String(m.sourceKey.dropFirst("festival:".count+saved.groupID.count+1)) : m.id
            return ManagedFestivalRecipient(momentID:m.id,key:key,name:m.firstName,phone:m.phone,email:m.email,selected:saved.selected[key] ?? m.enabled,contactIdentifier:saved.contactIDs[key] ?? "")
        }
        if saved.baseMessage.isEmpty {saved.baseMessage=first.latest?.body ?? FestivalValidation.fallback(name:first.title,tone:"Warm")}
        for r in recipients where saved.channels[r.key] == nil {saved.channels[r.key]=r.phone.isEmpty ? (r.email.isEmpty ? "share":"email") : "messages"}
        settings=saved;sendDate=FestivalValidation.instant(day:first.nextOccurrence,hour:8,minute:0,zone:first.timeZoneID) ?? date
        if let plan=first.upcomingDelivery {sendDate=plan.date}
        savedImageID=saved.imageID;imageData=imageStorage.load(saved.imageID);notice=saved.catalogNotice;baseline=fingerprint;analytics.record(.opened)
    }
    func loadCatalog() async {
        struct Response:Decodable,Sendable {let entries:[FestivalCatalogEntry]}
        do {let response:Response=try await store.request("festivalCatalog",[String:String]());catalog=response.entries} catch {notice="Catalog updates are unavailable. You can manage the festival date manually."}
    }
    func useCatalog() {
        guard let entry=catalog.first(where:{$0.id==settings.catalogID}),let day=entry.next(after:MomentDates.day(Date(),zone:zone)) else {error="No verified future catalog date is available.";settings.catalogManaged=false;return}
        date=MomentDates.date(day,zone:zone);yearly=false;notice="Catalog date applied. Saving will require rescheduling any existing wishes."
    }
    func channel(_ r:ManagedFestivalRecipient)->String {settings.channels[r.key] ?? "messages"}
    func invalidateApproval() {settings.approvedAt=nil;draftIDs=[:];keys=[:]}
    func setActive(_ value:Bool,cancelSchedules:Bool=false) async {
        let old=active;active=value
        await save(cancelSchedules:cancelSchedules)
        if error != nil {active=old}else if !value{analytics.record(.disabled)}
    }
    func save(cancelSchedules:Bool=false) async {
        guard !busy else{return};busy=true;error=nil;notice=nil;defer{busy=false}
        do {try await persist(cancelSchedules:cancelSchedules);notice="Festival changes saved.";analytics.record(.saved)} catch {self.error=error.localizedDescription}
    }
    private func persist(cancelSchedules:Bool) async throws {
        guard !title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,title.count<=80 else{throw FestivalError.message("Enter a festival name of 1–80 characters.")}
        if MomentDates.day(date,zone:zone)<MomentDates.day(Date(),zone:zone) {throw FestivalError.message("Select today or a future festival date.")}
        if let error=FestivalValidation.recipients(recipients,settings:settings){throw FestivalError.message(error)}
        try contactsService.validate(recipients)
        struct Recipient:Encodable {let id:String?;let key,name,phone,email:String;let selected:Bool}
        struct Input:Encodable {let ids:[String];let title,date,timeZoneID:String;let yearly,active:Bool;let recipients:[Recipient];let settings:FestivalSettings;let cancelSchedules:Bool}
        for r in recipients {settings.contactIDs[r.key]=r.contactIdentifier;settings.selected[r.key]=r.selected}
        let input=Input(ids:originals.map(\.id),title:title,date:MomentDates.day(date,zone:zone),timeZoneID:zone,yearly:yearly,active:active,recipients:recipients.map{Recipient(id:$0.momentID,key:$0.key,name:$0.name,phone:FestivalValidation.phone($0.phone),email:$0.email.trimmingCharacters(in:.whitespaces),selected:$0.selected)},settings:settings,cancelSchedules:cancelSchedules)
        let _:MomentOK=try await store.request("festivalSave",input)
        await store.refresh()
        let updated=store.moments.filter{FestivalSettings.read($0.festivalSettings)?.groupID==settings.groupID}
        guard !updated.isEmpty else {throw FestivalError.message("Saved. Refresh Moments before continuing.")}
        originals=updated
        for i in recipients.indices {if let m=updated.first(where:{$0.id==recipients[i].momentID || $0.sourceKey=="festival:\(settings.groupID):\(recipients[i].key)"}){recipients[i].momentID=m.id}}
        if savedImageID != settings.imageID {imageStorage.delete(savedImageID)}
        for id in stagedImages where id != settings.imageID {imageStorage.delete(id)}
        stagedImages=[];savedImageID=settings.imageID
        baseline=fingerprint; keys=[:]; draftIDs=[:]; savedPlans=[]
    }
    func generate(aiConsent:Bool) async {
        guard !busy else{return};busy=true;error=nil;defer{busy=false}
        invalidateApproval()
        guard aiConsent,let first=originals.first else {settings.baseMessage=FestivalValidation.fallback(name:title,tone:settings.tone);settings.manuallyEdited=false;notice="Offline draft — review before saving.";return}
        struct Input:Encodable {let momentID,tone,personalContext,festivalName:String;let aiConsent=true;let shared=true}
        struct Response:Decodable,Sendable {let draft:WishDraft;let usedAI:Bool}
        do {let result:Response=try await store.request("generate",Input(momentID:first.id,tone:settings.tone,personalContext:settings.personalContext,festivalName:title));settings.baseMessage=result.draft.body;settings.manuallyEdited=false;notice=result.usedAI ? "AI draft ready for review.":"AI unavailable; an editable fallback draft is ready.";analytics.record(.generated)} catch {settings.baseMessage=FestivalValidation.fallback(name:title,tone:settings.tone);notice="Offline fallback — review before saving."}
    }
    func approve(cancelSchedules:Bool=false) async {
        guard !busy else{return}
        guard !settings.baseMessage.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,settings.baseMessage.count<=500,settings.overrides.values.allSatisfy({!$0.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && $0.count<=500}) else {error="Each message must contain 1–500 characters.";return}
        settings.approvedAt=ISO8601DateFormatter().string(from:Date())
        await save(cancelSchedules:cancelSchedules)
        if error != nil {settings.approvedAt=nil}else{analytics.record(.approved);notice="Message approved and saved. Nothing has been sent."}
    }
    func generateImage() {
        guard !generatingImage else{return};generatingImage=true;error=nil;analytics.record(.imageStarted)
        let request=FestivalImageRequest(festival:title,style:settings.imageStyle,aspect:settings.imageAspect,prompt:settings.imagePrompt)
        imageTask=Task { do {let values=try await imageService.generate(request);try Task.checkCancellation();images=values;analytics.record(.imageCompleted)} catch is CancellationError {} catch {self.error="Image generation failed. Try again.";analytics.record(.imageFailed)};generatingImage=false }
    }
    func cancelImage() {imageTask?.cancel();Task{await imageService.cancel()};generatingImage=false}
    func chooseImage(_ image:FestivalImageVariation) {do{settings.imageID=try imageStorage.store(image);stagedImages.insert(settings.imageID);imageData=image.data;images=[];invalidateApproval();analytics.record(.imageSelected)}catch{self.error="Could not save image preview."}}
    func discardImageEdits(){for id in stagedImages{imageStorage.delete(id)};stagedImages=[]}
    func removeImage(){settings.imageID="";imageData=nil;settings.includeImage=false;invalidateApproval()}
    func delete() async -> Bool {
        guard !busy else{return false};busy=true;defer{busy=false}
        do {let _:MomentOK=try await store.request("festivalDelete",["ids":originals.map(\.id)]);imageStorage.delete(savedImageID);discardImageEdits();removeImage();await store.refresh();analytics.record(.deleted);return true}catch{self.error=error.localizedDescription;return false}
    }
    func schedule() async {
        guard !busy else{return};error=nil
        if let issue=FestivalValidation.schedule(settings:settings,date:sendDate,active:active,emailReady:emailReady,recipients:recipients){error=issue;return}
        if dirty {error="Save your changes before scheduling.";return}
        busy=true;defer{busy=false}
        do {
            try contactsService.validate(recipients)
            if notify || selected.contains(where:{channel($0) != "email" || settings.automatic[$0.key] != true}) {try await store.authorizeNotifications()}
            for r in selected {
                if savedPlans.contains(where:{$0.idempotencyKey==keys[r.key]}) {continue}
                guard let momentID=r.momentID else{throw FestivalError.message("Save recipients first.")}
                if draftIDs[r.key] == nil {
                    struct Gen:Encodable {let momentID,tone:String;let aiConsent=false}
                    struct DraftResponse:Decodable,Sendable {let draft:WishDraft}
                    let generated:DraftResponse=try await store.request("generate",Gen(momentID:momentID,tone:settings.tone))
                    struct Approve:Encodable {let id,body:String;let approved=true}
                    let approved:DraftResponse=try await store.request("approve",Approve(id:generated.draft.id,body:settings.overrides[r.key] ?? settings.baseMessage))
                    draftIDs[r.key]=approved.draft.id
                }
                if keys[r.key]==nil {
                    let seed=[settings.groupID,r.key,settings.approvedAt ?? "",ISO8601DateFormatter().string(from:sendDate),channel(r)].joined(separator:"|")
                    var bytes=Array(SHA256.hash(data:Data(seed.utf8)).prefix(16));bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80
                    keys[r.key]=UUID(uuid:(bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15])).uuidString
                }
                let c=channel(r)
                let response:WishPlanResponse=try await store.request("schedule",WishScheduleInput(draftID:draftIDs[r.key]!,channel:c,recipient:c=="email" ? r.email:FestivalValidation.phone(r.phone),scheduledAtUTC:ISO8601DateFormatter().string(from:sendDate),timeZoneID:zone,automaticDelivery:c=="email" && settings.automatic[r.key]==true,reminderOffset:notify ? 60:0,repeatYearly:false,idempotencyKey:keys[r.key]!))
                savedPlans.append(response.plan)
            }
            await store.refresh();notice="\(savedPlans.count) wishes scheduled. Messages requires confirmation.";scheduleCompleted=true;analytics.record(.scheduled)
        } catch {self.error="\(savedPlans.count) scheduled. \(error.localizedDescription) Retry continues remaining recipients.";await store.refresh()}
    }
}
