import SwiftUI
import CryptoKit

@MainActor final class ManageFestivalModel: ObservableObject {
    enum Tab:String,CaseIterable {case details="Details",contacts="Contacts",message="Wish Message",schedule="Schedule"}
    @Published var tab:Tab = .details
    private var pendingTab: Tab?
    @Published var title:String
    @Published var date:Date {
        didSet {
            guard MomentDates.day(date,zone:zone) != MomentDates.day(oldValue,zone:zone) else {return}
            // Move the proposed delivery to the edited day, preserving its local send time.
            // Existing deliveries still go through the cancel-and-save confirmation.
            var calendar=Calendar(identifier:.gregorian)
            calendar.timeZone=TimeZone(identifier:zone) ?? .current
            let time=calendar.dateComponents([.hour,.minute,.second],from:sendDate)
            if let updated=calendar.date(bySettingHour:time.hour ?? 8,minute:time.minute ?? 0,second:time.second ?? 0,of:date) {
                sendDate=updated
            }
        }
    }
    @Published var zone:String
    @Published var yearly:Bool
    @Published var active:Bool
    @Published var recipients:[ManagedFestivalRecipient]
    @Published var settings=FestivalSettings()
    @Published var sendDate=Date() { didSet { settings.draftSendDate = FestivalSettings.draftDate(sendDate) } }
    @Published var notify=true { didSet { settings.draftNotify = notify } }
    @Published var needsScheduleConfirmation=false
    @Published var busy=false
    @Published var generatingImage=false
    @Published var error:String?
    @Published var notice:String?
    @Published var images:[FestivalImageVariation]=[]
    @Published var catalog:[FestivalCatalogEntry]=[]
    @Published var savedPlans:[WishDeliveryPlan]=[]
    @Published var scheduleCompleted=false
    @Published var imageData:Data?
    /// The card saved on the server, shown when this device has no artwork (e.g. saved on another device).
    @Published var storedCardImage:Data?
    @Published var uploadingCard=false
    @Published var cardUploadFailed=false
    static let cardUploadFailedNote="Card saved, but it couldn't be attached to scheduled emails"
    /// The card inputs last uploaded, so a save that leaves the card unchanged does not upload it again.
    private var uploadedCardKey:String?
    private(set) var originals:[ImportantMoment]
    let store:ImportantMomentsStore
    private let imageService:(any FestivalImageGenerationService)?
    private let imageStorage:any FestivalImageStorageService
    private var imageTask:Task<Void,Never>?
    private var baseline=""
    /// The state as last saved, to tell a message-only save from one that changes delivery.
    private var savedState:FestivalEditState?
    private var savedImageID=""
    private var stagedImages=Set<String>()
    private var keys:[String:String]=[:]
    private var draftIDs:[String:String]=[:]
    private let analytics=FestivalAnalytics()
    let contactsService=FestivalContactsService()
    var occasionType:String {originals.first?.type ?? "festival"}
    var occasionLabel:String {ImportantMoment.label(for:occasionType)}
    var source:String { originals.first?.source ?? "manual" }
    var hasSchedules:Bool {
        let current=originals.map { original in store.moments.first(where:{$0.id==original.id}) ?? original }
        return current.contains {$0.drafts.contains {$0.plans?.contains { $0.editable || $0.status == "SENDING" } == true}}
            || savedPlans.contains {$0.editable || $0.status == "SENDING"}
    }
    var selected:[ManagedFestivalRecipient] { recipients.filter(\.selected) }
    var emailReady:Bool { store.snapshot?.automaticEmailEnabled == true && store.snapshot?.emailAccount?.status == "connected" }
    var dirty:Bool { fingerprint != baseline }
    var editState:FestivalEditState {FestivalEditState(title:title,day:MomentDates.day(date,zone:zone),zone:zone,yearly:yearly,active:active,recipients:recipients,settings:settings)}
    /// What saving now would change. Message-only approved saves keep existing schedules (the server rewrites their text).
    var pendingChange:FestivalChange {savedState.map{editState.change(from:$0)} ?? .delivery}
    /// Placeholder wording while the Wish Message is empty; saved only through useSuggestion().
    var suggestion:String {WishMessage.suggestion(type:occasionType,title:title)}
    func useSuggestion() {settings.baseMessage=suggestion;settings.manuallyEdited=false;invalidateApproval()}
    /// Every edit of the wish (Wish Message tab or card editor) goes through here.
    func setMessage(_ text:String) {settings.baseMessage=String(text.prefix(500));settings.manuallyEdited=true;invalidateApproval()}
    private func encoded<T:Encodable>(_ value:T) -> String {let encoder=JSONEncoder();encoder.outputFormatting = [.sortedKeys];return String(data:(try? encoder.encode(value)) ?? Data(),encoding:.utf8) ?? ""}
    private var fingerprint:String { let state=[title,MomentDates.day(date,zone:zone),zone,String(yearly),String(active),encoded(recipients),encoded(settings)];return state.joined(separator:"|") }
    init(group:MomentDisplayGroup,store:ImportantMomentsStore,imageService:(any FestivalImageGenerationService)?=nil,imageStorage:any FestivalImageStorageService=ProtectedFestivalImageStorage()) {
        self.store=store;self.originals=group.moments;self.imageService=imageService;self.imageStorage=imageStorage
        let first=group.moments[0];title=first.title;zone=first.timeZoneID;date=MomentDates.date(first.nextOccurrence,zone:first.timeZoneID);yearly=first.yearly;active=group.moments.contains(where: \.enabled)
        var saved=FestivalSettings.read(first.festivalSettings) ?? FestivalSettings()
        recipients=group.moments.filter(\.hasRecipient).map { m in
            let key=m.sourceKey.hasPrefix(m.type+":"+saved.groupID+":") ? String(m.sourceKey.dropFirst(m.type.count+1+saved.groupID.count+1)) : m.id
            return ManagedFestivalRecipient(momentID:m.id,key:key,name:m.firstName,phone:m.phone,email:m.email,selected:saved.selected[key] ?? m.enabled,contactIdentifier:saved.contactIDs[key] ?? "")
        }
        // An empty Wish Message stays empty (the suggestion is only a placeholder); an older card greeting is adopted
        // when the message was blank or an untouched default; channel defaults apply to both live and saved settings.
        let opened=WishMessage.opened(saved,recipients:recipients,latestBody:first.latest?.body,latestStatus:first.latest?.status)
        saved=opened.baseline
        let reconciled=opened.live,adoptedCardText=opened.adoptedCardText
        settings=reconciled;sendDate=FestivalValidation.instant(day:first.nextOccurrence,hour:8,minute:0,zone:first.timeZoneID) ?? date
        if let draft=saved.draftSendDate.flatMap({ISO8601DateFormatter().date(from:$0)}) {sendDate=draft}
        notify=saved.draftNotify ?? true
        if let plan=group.moments.compactMap(\.upcomingDelivery).first {sendDate=plan.date;zone=plan.timeZoneID}
        // Opening is not an edit: the saved baseline gets the same send time and notify choice as the live settings.
        saved.recordOpenedDraft(sendDate:sendDate,notify:notify);settings.recordOpenedDraft(sendDate:sendDate,notify:notify)
        savedImageID=saved.imageID;imageData=imageStorage.load(saved.imageID);notice=saved.catalogNotice
        // The baseline is the saved Wish Message, so adopted card text shows as an unsaved change to approve.
        let current=settings;settings=saved;baseline=fingerprint;savedState=editState;settings=current
        if adoptedCardText {notice="Your card’s greeting is now your Wish Message. Tap Save Message to use it for scheduled wishes."}
        analytics.record(.opened)
        if group.moments.contains(where:{$0.card != nil}) {uploadedCardKey=cardKey}
    }
    /// The shared card preview: the Wish Message.
    var cardMessage:String {WishMessage.card(settings)}
    /// The card a recipient's email carries: their personalized message, else the Wish Message.
    func cardMessage(for recipient:ManagedFestivalRecipient?) -> String {WishMessage.card(settings,recipientKey:recipient?.key)}
    /// Card text per moment. Recipients with the same text share one rendered card.
    private var cardTexts:[String:String] {
        var texts:[String:String]=[:]
        for moment in originals where moment.supportsGreetingCard {texts[moment.id]=cardMessage(for:recipients.first{$0.momentID==moment.id})}
        return texts
    }
    private var cardKey:String {[settings.imageID,title,settings.cardSignature ?? ""].joined(separator:"\u{1F}")+cardTexts.sorted{$0.key<$1.key}.map{"\u{1F}\($0.key)=\($0.value)"}.joined()}
    private var cardMomentIDs:[String] {originals.filter(\.supportsGreetingCard).map(\.id)}
    /// Renders the finished card with the current wish and attaches it to scheduled emails. A failure leaves the card saved.
    func uploadCard() async {
        guard !uploadingCard,let data=imageData,let artwork=UIImage(data:data),!cardMomentIDs.isEmpty else{return}
        uploadingCard=true;defer{uploadingCard=false}
        let title=title,signature=settings.cardSignature ?? "",key=cardKey
        do {
            for (message,ids) in Dictionary(grouping:cardTexts,by:\.value).mapValues({$0.map(\.key).sorted()}) {
                try await store.uploadCard(momentIDs:ids){encoding in try await GreetingCardRenderer.jpeg(artwork:artwork,title:title,message:message,signature:signature,encoding:encoding)}
            }
            uploadedCardKey=key;cardUploadFailed=false;storedCardImage=nil
            await store.refresh()
            originals=originals.map{original in store.moments.first(where:{$0.id==original.id}) ?? original}
        } catch {cardUploadFailed=true}
    }
    /// A saved moment whose card inputs changed, or a recipient without the card yet, needs the card uploaded.
    private var cardNeedsUpload:Bool {imageData != nil && (cardKey != uploadedCardKey || originals.contains{$0.supportsGreetingCard && $0.card == nil})}
    /// Shows the server's saved card when this device has no artwork for it.
    func loadStoredCard() async {
        guard imageData == nil,storedCardImage == nil,let moment=originals.first(where:{$0.card != nil}) else{return}
        storedCardImage=await store.storedCard(for:moment)
    }
    /// Removes the card from scheduled emails and from this moment.
    func removeCard(saveSettings:Bool=false) async {
        guard !busy else{return}
        busy=true;error=nil;defer{busy=false}
        do {
            try await store.deleteCard(momentIDs:cardMomentIDs)
            storedCardImage=nil;cardUploadFailed=false;uploadedCardKey=nil;removeImage()
            if saveSettings, let moment=originals.first {
                struct Input:Encodable {let momentID:String;let settings:FestivalSettings}
                let _:MomentOK=try await store.request("greetingCardSave",Input(momentID:moment.id,settings:settings))
                imageStorage.delete(savedImageID);savedImageID=""
            }
            await store.refresh()
            originals=originals.map{original in store.moments.first(where:{$0.id==original.id}) ?? original}
            notice="Greeting card removed. Scheduled emails will send the text only."
        } catch {self.error="The card couldn't be removed from scheduled emails. \(error.localizedDescription)"}
    }
    func loadCatalog() async {
        guard occasionType == "festival" else{return}
        struct Response:Decodable,Sendable {let entries:[FestivalCatalogEntry]}
        do {let response:Response=try await store.request("festivalCatalog",[String:String]());catalog=response.entries} catch {notice="Catalog updates are unavailable. You can manage the festival date manually."}
    }
    func useCatalog() {
        guard let entry=catalog.first(where:{$0.id==settings.catalogID}),let day=entry.next(after:MomentDates.day(Date(),zone:zone)) else {error="No verified future catalog date is available.";settings.catalogManaged=false;return}
        date=MomentDates.date(day,zone:zone);yearly=false;notice="Catalog date applied. Saving will require rescheduling any existing wishes."
    }
    func reviewHeading(for recipient: ManagedFestivalRecipient) -> String {
        MomentGreeting.heading(type: occasionType, firstName: recipient.name) ?? title
    }
    func deliveryMessage(for recipient: ManagedFestivalRecipient) -> String {
        if let custom = settings.overrides[recipient.key] { return custom }
        return MomentGreeting.message(settings.baseMessage, type: occasionType, firstName: recipient.name)
    }
    func channel(_ r:ManagedFestivalRecipient)->String {settings.channels[r.key] ?? "messages"}
    /// Adds a recipient from the recipient sheet, or replaces the one it edited. A new recipient gets the default channel;
    /// an edited one keeps its channel unless the address that channel uses was removed.
    func saveRecipient(_ recipient:ManagedFestivalRecipient,replacing previous:ManagedFestivalRecipient?) {
        if let previous,let index=recipients.firstIndex(where:{$0.key==previous.key}) {
            recipients[index]=recipient
            let current=channel(recipient)
            if current=="messages" && recipient.phone.isEmpty || current=="email" && recipient.email.isEmpty {settings.channels[recipient.key]=FestivalValidation.defaultChannel(phone:recipient.phone)}
        } else {
            recipients.append(recipient);settings.channels[recipient.key]=FestivalValidation.defaultChannel(phone:recipient.phone)
        }
        invalidateApproval()
    }
    func removeRecipient(key:String) {recipients.removeAll{$0.key==key};invalidateApproval()}
    func invalidateApproval() {settings.approvedAt=nil;draftIDs=[:];keys=[:]}
    func setActive(_ value:Bool,cancelSchedules:Bool=false) async {
        let old=active;active=value
        await save(cancelSchedules:cancelSchedules)
        if error != nil {active=old}else if !value{analytics.record(.disabled)}
    }
    func changeTab(to target: Tab) async {
        switch wishGeneration.tabChange(sameTab: target == tab, busy: busy, dirty: dirty) {
        case .ignore: return
        case .saveFirst: pendingTab = target; await save()
        case .switchNow: tab = target; pendingTab = nil
        }
    }
    func prepareNextTabAfterSave() {
        guard wishGeneration.allowsSave(busy:busy) else {return}
        pendingTab = switch tab {case .details: .contacts;case .contacts: .message;case .message: .schedule;case .schedule: nil}
    }
    func cancelTabChange() { pendingTab = nil }
    func save(cancelSchedules:Bool=false) async {
        guard wishGeneration.allowsSave(busy:busy) else{return}
        guard dirty else {error=nil;if let target=pendingTab {tab=target;pendingTab=nil};notice="No changes to save. Your existing schedule is unchanged.";return}
        busy=true;error=nil;notice=nil;defer{busy=false}
        let keptSchedules=keepsSchedules(cancelSchedules:cancelSchedules)
        do {try await persist(cancelSchedules:cancelSchedules);if let target=pendingTab {tab=target;pendingTab=nil};notice=cancelSchedules ? "Changes saved. Review and schedule your updated wish again.":keptSchedules ? "Message saved. Scheduled wishes will send the updated message.":"Moment changes saved.";analytics.record(.saved)} catch {
            if case APIError.server(409,let message)=error, message.contains("Existing schedules") {
                needsScheduleConfirmation=true
            } else if case APIError.server(let status,let message)=error, let sending=WishMessage.saveError(status:status,message:message) {
                self.error=sending;pendingTab=nil
            } else {self.error=error.localizedDescription;pendingTab=nil}
        }
    }
    private func persist(cancelSchedules:Bool) async throws {
        guard !title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,title.count<=150 else{throw FestivalError.message("Enter a moment name of 1–150 characters.")}
        if !recipients.isEmpty, let error=FestivalValidation.recipients(recipients,settings:settings){throw FestivalError.message(error)}
        try contactsService.validate(recipients)
        for r in recipients {settings.contactIDs[r.key]=r.contactIdentifier;settings.selected[r.key]=r.selected}
        let input=FestivalSaveRequest(ids:originals.map(\.id),title:title,date:MomentDates.day(date,zone:zone),timeZoneID:zone,yearly:yearly,active:active,recipients:recipients,settings:settings,cancelSchedules:cancelSchedules)
        let _:MomentOK=try await store.request("festivalSave",input)
        await store.refresh()
        let updated=store.moments.filter{!$0.isArchived && $0.type==occasionType && FestivalSettings.read($0.festivalSettings)?.groupID==settings.groupID}
        guard !updated.isEmpty else {throw FestivalError.message("Saved. Refresh Moments before continuing.")}
        originals=updated
        for i in recipients.indices {if let m=updated.first(where:{$0.id==recipients[i].momentID || $0.sourceKey=="\(occasionType):\(settings.groupID):\(recipients[i].key)"}){recipients[i].momentID=m.id}}
        if savedImageID != settings.imageID {imageStorage.delete(savedImageID)}
        for id in stagedImages where id != settings.imageID {imageStorage.delete(id)}
        stagedImages=[];savedImageID=settings.imageID
        baseline=fingerprint; savedState=editState; keys=[:]; draftIDs=[:]; savedPlans=[]
        if cardNeedsUpload {await uploadCard()}
    }
    /// The name in an offline birthday/anniversary draft: the only selected recipient's. With several, the draft is
    /// shared and each recipient's name is added when their wish is prepared (MomentGreeting.message).
    private var fallbackFirstName:String {selected.count == 1 ? selected[0].name : ""}
    /// Regenerate's single in-flight request; the current message stays on screen (dimmed) until it ends.
    let wishGeneration=WishGenerationGate()
    func generate(aiConsent:Bool) async {
        guard !busy,!wishGeneration.isGenerating else{return};error=nil
        invalidateApproval()
        guard aiConsent,let first=originals.first else {settings.baseMessage=FestivalValidation.fallback(name:title,tone:settings.tone,type:occasionType,firstName:fallbackFirstName);settings.manuallyEdited=false;notice="Offline draft — review before saving.";return}
        struct Input:Encodable {let momentID,tone,personalContext,festivalName:String;let aiConsent=true;let shared=true}
        struct Response:Decodable,Sendable {let draft:WishDraft;let usedAI:Bool}
        let input=Input(momentID:first.id,tone:settings.tone,personalContext:settings.personalContext,festivalName:title)
        await wishGeneration.run {
            do {let result:Response=try await wishGeneration.withTimeout{try await self.store.request("generate",input)};settings.baseMessage=result.draft.body;settings.manuallyEdited=false;notice=result.usedAI ? "AI draft ready for review.":"AI unavailable; an editable fallback draft is ready.";analytics.record(.generated)} catch {settings.baseMessage=FestivalValidation.fallback(name:title,tone:settings.tone,type:occasionType,firstName:fallbackFirstName);notice="Offline fallback — review before saving."}
        }
    }
    /// An approved message-only save keeps existing schedules; the server rewrites their text.
    private func keepsSchedules(cancelSchedules:Bool) -> Bool {!cancelSchedules && hasSchedules && pendingChange == .messageOnly && settings.approvedAt != nil}
    func approve(cancelSchedules:Bool=false) async {
        guard wishGeneration.allowsSave(busy:busy) else{return}
        if let issue=WishMessage.approvalError(settings) {error=issue;pendingTab=nil;return}
        settings.approvedAt=ISO8601DateFormatter().string(from:Date())
        let kept=keepsSchedules(cancelSchedules:cancelSchedules)
        await save(cancelSchedules:cancelSchedules)
        if error != nil || needsScheduleConfirmation {settings.approvedAt=nil}else{analytics.record(.approved);notice=kept ? "Message saved. Scheduled wishes will send the updated message.":"Message approved and saved. Nothing has been sent."}
    }
    var isDesignPreview:Bool { ProcessInfo.processInfo.arguments.contains("-moments-design-preview") }
    func generateImage() {
        guard !generatingImage, let first=originals.first else{return}
        generatingImage=true;error=nil;analytics.record(.imageStarted)
        let request=FestivalImageRequest(festival:title,style:settings.imageStyle,aspect:settings.imageAspect,prompt:settings.imagePrompt)
        imageTask=Task {
            defer {generatingImage=false}
            do {
                let values:[FestivalImageVariation]
                if let service=imageService { values=try await service.generate(request) }
                else if isDesignPreview { values=try await MockFestivalImageService().generate(request) }
                else {
                    struct Input:Encodable {let momentID,festival,style,aspect,prompt:String;let aiConsent=true}
                    struct Response:Decodable,Sendable {let data,mime:String}
                    let result:Response=try await store.request("greetingArtwork",Input(momentID:first.id,festival:request.festival,style:request.style,aspect:request.aspect,prompt:request.prompt))
                    guard let data=Data(base64Encoded:result.data),data.count<=5_000_000,UIImage(data:data) != nil else {throw FestivalError.message("The artwork could not be opened. Please try again.")}
                    values=[FestivalImageVariation(id:UUID().uuidString,data:data,isMock:false)]
                }
                try Task.checkCancellation();images=values;analytics.record(.imageCompleted)
            } catch is CancellationError {} catch {if !Task.isCancelled {self.error=error.localizedDescription;analytics.record(.imageFailed)}}
        }
    }
    static let cardMessageNeedsReview="Your card is ready, but its message changes this moment’s scheduled wishes. Open Manage Moment to review and save the message."
    func saveGreetingCard() async -> Bool {
        guard wishGeneration.allowsSave(busy:busy),let moment=originals.first else{return false}
        // The card prints the Wish Message, so a message edited in the card editor is saved (and approved) as the wish.
        if let saved=savedState, settings.baseMessage != saved.settings.baseMessage {
            if let issue=WishMessage.approvalError(settings) {error=issue;return false}
            busy=true;error=nil;defer{busy=false}
            settings.approvedAt=ISO8601DateFormatter().string(from:Date())
            let kept=keepsSchedules(cancelSchedules:false)
            do {
                try await persist(cancelSchedules:false)
                notice=kept ? "Greeting card saved. Scheduled wishes will send the updated message.":"Greeting card saved."
                return true
            } catch {
                settings.approvedAt=nil
                if case APIError.server(409,let message)=error, message.contains("Existing schedules") {self.error=Self.cardMessageNeedsReview}
                else if case APIError.server(let status,let message)=error, let sending=WishMessage.saveError(status:status,message:message) {self.error=sending}
                else {self.error=error.localizedDescription}
                return false
            }
        }
        busy=true;error=nil;defer{busy=false}
        do {
            struct Input:Encodable {let momentID:String;let settings:FestivalSettings}
            let _:MomentOK=try await store.request("greetingCardSave",Input(momentID:moment.id,settings:settings))
            if savedImageID != settings.imageID {imageStorage.delete(savedImageID)}
            for id in stagedImages where id != settings.imageID {imageStorage.delete(id)}
            stagedImages=[];savedImageID=settings.imageID
            // Every card save re-attaches the card to scheduled emails; a failure keeps the card saved.
            await uploadCard()
            await store.refresh()
            notice="Greeting card saved."
            return true
        } catch {self.error=error.localizedDescription;return false}
    }
    func cancelImage() {imageTask?.cancel();Task{await imageService?.cancel()}}
    func chooseImage(_ image:FestivalImageVariation) {do{settings.imageID=try imageStorage.store(image);stagedImages.insert(settings.imageID);imageData=image.data;images=[];invalidateApproval();analytics.record(.imageSelected)}catch{self.error="Could not save image preview."}}
    func discardImageEdits(){for id in stagedImages{imageStorage.delete(id)};stagedImages=[]}
    func removeImage(){settings.imageID="";imageData=nil;settings.includeImage=false;invalidateApproval()}
    func delete() async -> Bool {
        guard !busy else{return false};busy=true;defer{busy=false}
        do {let _:MomentOK=try await store.request("festivalDelete",["ids":originals.map(\.id)]);imageStorage.delete(savedImageID);discardImageEdits();removeImage();await store.refresh();analytics.record(.deleted);return true}catch{self.error=error.localizedDescription;return false}
    }
    private var immediateOperationIDs:[String:String]=[:]
    func sendImmediately() async -> [WishDeliveryPlan]? {
        guard !busy else{return nil}
        busy=true;error=nil;defer{busy=false}
        var plans:[WishDeliveryPlan]=[]
        do {
            for recipient in selected {
                guard let momentID=recipient.momentID else{throw FestivalError.message("Save recipients first.")}
                let operationID=immediateOperationIDs[recipient.key] ?? UUID().uuidString
                immediateOperationIDs[recipient.key]=operationID
                struct Input:Encodable {let momentID,body,operationID:String;let approved=true}
                struct Response:Decodable,Sendable {let plans:[WishDeliveryPlan]}
                let response:Response=try await store.request("sendGreetingNow",Input(momentID:momentID,body:deliveryMessage(for:recipient),operationID:operationID))
                plans.append(contentsOf:response.plans)
            }
            await store.refresh()
            return plans
        } catch {self.error=error.localizedDescription;await store.refresh();return nil}
    }
    func schedule() async {
        guard !busy else{return};error=nil
        if let issue=FestivalValidation.schedule(settings:settings,date:sendDate,active:active,emailReady:emailReady,recipients:recipients){error=issue;return}
        if selected.contains(where: { deliveryMessage(for:$0).count > 500 }) {error="A personalized message exceeds 500 characters. Shorten the wish before scheduling.";return}
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
                    let approved:DraftResponse=try await store.request("approve",Approve(id:generated.draft.id,body:deliveryMessage(for:r)))
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
            await store.refresh()
            originals=originals.map {original in store.moments.first(where:{$0.id==original.id}) ?? original}
            notice="\(savedPlans.count) wishes scheduled. Messages requires confirmation.";scheduleCompleted=true;analytics.record(.scheduled)
        } catch {self.error="\(savedPlans.count) scheduled. \(error.localizedDescription) Retry continues remaining recipients.";await store.refresh()}
    }
}
