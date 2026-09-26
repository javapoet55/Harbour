import SwiftUI
import MessageUI

struct MomentsManagementEntry: View {
    let onDone: () -> Void
    @EnvironmentObject private var store:ImportantMomentsStore
    private var groups:[MomentDisplayGroup] {
        MomentDisplayGroup.groups(store.moments.filter {
            !$0.isArchived
        }.sorted { $0.nextOccurrence < $1.nextOccurrence })
    }
    var body:some View {
        ZStack {
            TodayBackdrop()
            ScrollView {
                VStack(spacing:16) {
                    if groups.isEmpty {
                        ContentUnavailableView("No moments yet",systemImage:"gift",description:Text("Add a birthday, anniversary, festival, Get Well Soon, or custom moment to manage it here."))
                    }
                    ForEach(groups) { group in
                        if let moment=group.moments.first {
                            NavigationLink {
                                if moment.supportsGreetingCard {ManageFestivalView(group:group,store:store,onDone:onDone)}
                                else {MomentEditor(moment:moment)}
                            } label: {
                                MomentCard {
                                    HStack(spacing:14) {
                                        MomentIconTile(type:moment.type,title:moment.title)
                                        VStack(alignment:.leading,spacing:6) {
                                            Text(moment.title).font(.headline)
                                            Text(moment.typeLabel).font(.subheadline).foregroundStyle(.secondary)
                                            if !moment.enabled {Text("Inactive").font(.caption).foregroundStyle(.secondary)}
                                        }
                                        Spacer()
                                        Image(systemName:"chevron.right")
                                    }
                                }
                            }.buttonStyle(.plain).accessibilityIdentifier("manage-moment-\(moment.id)")
                        }
                    }
                }.padding(18)
            }
        }.navigationTitle("Manage Moments").navigationBarTitleDisplayMode(.inline)
    }
}
struct ManageFestivalView: View {
    @Environment(\.dismiss) private var dismiss
    private let onDone: () -> Void
    @StateObject private var model:ManageFestivalModel
    @State private var discard=false
@State private var deleteConfirm=false
@State private var disableConfirm=false
@State private var scheduleConfirm=false
    @State private var dateEditor=false
    @State private var dateDraft=Date()
    @State private var showingSettings=false
    @State private var showAllContacts=false
    @State private var recipientAction:RecipientAction?
@State private var personalize=false
@State private var imageSheet=false
@State private var regenerateConfirm=false
@State private var aiConsent=false
    @State private var approveAfterCancel=false
    private enum Field:Hashable { case name, message }
    @FocusState private var focusedField:Field?
    init(group:MomentDisplayGroup,store:ImportantMomentsStore,onDone:@escaping () -> Void){self.onDone=onDone;_model=StateObject(wrappedValue:store.festivalModel(for:group))}
    var body:some View {
        ZStack {TodayBackdrop();ScrollView{VStack(alignment:.leading,spacing:20){
            identity
            tabs
            Group {switch model.tab {case .details:details;case .contacts:recipients;case .message:message;case .schedule:schedule}}
            if model.busy {ProgressView("Saving…")}
            // The Wish Message tab shows its errors next to Save Message.
            if model.tab != .message, let error=model.error {Text(error).foregroundStyle(.red).accessibilityIdentifier("festival-error")}
            if let notice=model.notice {Text(notice).font(.subheadline).foregroundStyle(.secondary).accessibilityIdentifier("festival-notice")}
        }.padding(18)}.id(model.tab)}
        .navigationTitle("Manage Moment").navigationBarTitleDisplayMode(.inline).navigationBarBackButtonHidden()
        .navigationDestination(isPresented:$model.scheduleCompleted){FestivalScheduleSuccess(title:model.title,occasionType:model.occasionType,plans:model.savedPlans,wishes:model.selected.map { ScheduleWishPreview(heading:model.reviewHeading(for:$0),message:model.deliveryMessage(for:$0)) },done:onDone)}
        .navigationDestination(isPresented:$showingSettings){MomentSettingsView().environmentObject(model.store)}
        .toolbar {
            ToolbarItem(placement:.topBarLeading){Button {if model.dirty{discard=true}else{dismiss()}}label:{Image(systemName:"chevron.left").frame(width:44,height:44)}.accessibilityLabel("Back")}
            ToolbarItem(placement:.topBarTrailing){Menu{Button(model.occasionType == "festival" ? "Festival settings" : "Moment settings"){focusedField=nil;showingSettings=true};Button("Delete Moment",role:.destructive){deleteConfirm=true}.accessibilityIdentifier("festival-delete-menu")}label:{Image(systemName:"ellipsis").frame(width:44,height:44)}.accessibilityLabel("Moment options")}
            ToolbarItemGroup(placement:.keyboard){Spacer();Button("Done"){focusedField=nil}.accessibilityIdentifier("festival-keyboard-done")}
        }
        .disabled(model.busy)
        .task {await model.loadCatalog();await model.loadStoredCard()}
        .onDisappear {model.cancelImage()}
        .alert("Discard unsaved changes?",isPresented:$discard){Button("Discard changes",role:.destructive){model.discardImageEdits();dismiss()};Button("Keep editing",role:.cancel){}}
        .confirmationDialog("Disable this moment? Pending wishes will be cancelled. Contacts and messages are preserved.",isPresented:$disableConfirm,titleVisibility:.visible){Button("Disable and cancel wishes",role:.destructive){Task{await model.setActive(false,cancelSchedules:true)}}}
        .alert("Delete Moment?",isPresented:$deleteConfirm){Button("Delete Moment",role:.destructive){Task{if await model.delete(){dismiss()}}};Button("Cancel",role:.cancel){}}message:{Text("Contacts will be disconnected, scheduled wishes cancelled, and saved drafts deleted. Sent history remains.")}
        .alert("Save changes to scheduled wishes?",isPresented:$model.needsScheduleConfirmation){Button("Cancel schedules and save"){Task{if approveAfterCancel{await model.approve(cancelSchedules:true)}else{await model.save(cancelSchedules:true)}}};Button("Keep schedules",role:.cancel){model.cancelTabChange()}}message:{Text("Saving these changes cancels the existing schedules for this moment. After saving, review and schedule your updated wishes again.")}
        .confirmationDialog("Replace the edited message with a new draft?",isPresented:$regenerateConfirm,titleVisibility:.visible){Button("Regenerate"){Task{await model.generate(aiConsent:aiConsent)}}}
        .recipientSheets(action:$recipientAction,recipients:model.recipients){recipient,previous in model.saveRecipient(recipient,replacing:previous)}
        .sheet(isPresented:$personalize){personalization}
        .sheet(isPresented:$imageSheet){imageConfiguration}
        .sheet(isPresented:$scheduleConfirm){confirmation}
        .sheet(isPresented:$dateEditor){
            NavigationStack {
                DatePicker("Moment date",selection:$dateDraft,displayedComponents:.date)
                    .datePickerStyle(.graphical).padding()
                    .environment(\.timeZone,TimeZone(identifier:model.zone) ?? .current)
                    .navigationTitle("Select Date").navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement:.cancellationAction){Button("Cancel"){dateEditor=false}}
                        ToolbarItem(placement:.confirmationAction){Button("Done"){model.date=dateDraft;dateEditor=false}}
                    }
            }.presentationDetents([.medium])
        }
    }
    private var identity:some View {
        MomentCard {
            HStack(spacing:16) {
                MomentIconTile(type:model.occasionType,title:model.title)
                VStack(alignment:.leading,spacing:8) {
                    Text(model.title).font(.title2.bold())
                    Text(model.occasionLabel).foregroundStyle(.secondary)
                }
                Spacer(minLength:0)
                VStack {
                    Toggle("Moment active",isOn:Binding(get:{model.active},set:{value in if !value && model.hasSchedules{disableConfirm=true}else{Task{await model.setActive(value)}}})).labelsHidden().accessibilityLabel("Moment active")
                    Text(model.active ? "Active":"Inactive").font(.caption)
                }
            }
            Label("Moment date · \(MomentDates.sendDayLabel(model.date,zone:model.zone))",systemImage:"calendar")
                .font(.subheadline).foregroundStyle(.secondary)
                .accessibilityIdentifier("festival-send-date")
        }
    }

    private var tabs:some View {HStack(spacing:3){ForEach(ManageFestivalModel.Tab.allCases,id:\.self){tab in Button{focusedField=nil;approveAfterCancel=false;Task{await model.changeTab(to:tab)};FestivalAnalytics().record(.tab)}label:{Text(tab.rawValue).font(.subheadline).lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth:.infinity,minHeight:44).padding(.vertical,5).foregroundStyle(model.tab==tab ? Color.white:Color.nexdoIndigo).background(model.tab==tab ? Color.nexdoIndigo:Color.clear,in:RoundedRectangle(cornerRadius:18))}.buttonStyle(.plain).disabled(generatingWish && model.tab != tab).accessibilityAddTraits(model.tab==tab ? .isSelected:[]).accessibilityIdentifier("festival-tab-\(tab.rawValue)")}}.padding(5).background(.ultraThinMaterial,in:RoundedRectangle(cornerRadius:22))}
    private var details:some View {Group{
        Text("Moment Details").font(.largeTitle.bold())
        MomentCard{HStack{Text("Moment name").foregroundStyle(.primary);TextField("Moment name",text:$model.title).fontWeight(.bold).focused($focusedField,equals:.name).submitLabel(.done).onSubmit{focusedField=nil}.multilineTextAlignment(.trailing).accessibilityIdentifier("festival-name");Image(systemName:"pencil")};Divider();LabeledContent("Type",value:model.occasionLabel);Divider();Button{dateDraft=model.date;dateEditor=true}label:{HStack{Text("Date").foregroundStyle(Color.nexdoInk);Spacer();Text(MomentDates.sendDayLabel(model.date,zone:model.zone)).foregroundStyle(Color.nexdoInk).padding(.horizontal,12).padding(.vertical,7).background(Color.secondary.opacity(0.12),in:Capsule())}}.buttonStyle(.plain).disabled(model.settings.catalogManaged).accessibilityIdentifier("festival-details-date")}
        Text("Reminder & Repeat").font(.title2.bold())
        MomentCard{
            if model.source=="festivalCatalog" {Toggle("Update festival date automatically",isOn:$model.settings.catalogManaged).onChange(of:model.settings.catalogManaged){_,value in if value{model.useCatalog()}};Picker("Catalog festival",selection:$model.settings.catalogID){Text("Select festival").tag("");ForEach(model.catalog){Text($0.name).tag($0.id)}};Text("Only verified catalog dates are used. If no date is available, confirm it manually.").font(.caption)}else{Toggle("Repeat every year",isOn:$model.yearly);Text(model.occasionType == "festival" ? "Dates repeat yearly; festivals may move.\nConfirm the date and schedule each year." : "Repeats on this date each year.\nReview and schedule each wish separately.").font(.caption).foregroundStyle(.secondary)}
            Divider();HStack{Text("Prepare reminder");Spacer();Picker("Prepare reminder",selection:$model.settings.prepareDays){Text("None").tag(0);ForEach([1,3,7,14],id:\.self){Text("\($0) day\($0==1 ? "":"s") before").tag($0)}}.labelsHidden()}
            Text("Review only. Nothing is sent.").font(.caption).foregroundStyle(.secondary)
            Divider();zonePicker
        }
        saveButtons
    }}
    private var zonePicker:some View {HStack{Text("Time zone");Spacer();Picker("Time zone",selection:$model.zone){ForEach(TimeZone.knownTimeZoneIdentifiers,id:\.self){id in Text(TimeZone(identifier:id)?.localizedName(for:.generic,locale:.current) ?? id).tag(id)}}.labelsHidden()}}
    private var recipients:some View {Group{
        Text("Recipients").font(.largeTitle.bold());Text("\(model.selected.count) selected").foregroundStyle(.secondary)
        if model.recipients.isEmpty {
            Text("No contacts added yet. Add a contact to choose who receives this wish.").font(.subheadline).foregroundStyle(.secondary).accessibilityIdentifier("moment-no-recipients")
        }
        if !model.recipients.isEmpty {
        MomentCard{ForEach($model.recipients){$r in if showAllContacts || model.recipients.prefix(3).contains(where:{$0.id==r.id}) {VStack(alignment:.leading,spacing:10){HStack{Text(r.initials).font(.title2.bold()).frame(width:48,height:48).background(Color.nexdoIndigo.opacity(0.12),in:Circle());VStack(alignment:.leading){Text(r.name).font(.headline);Text(r.masked(channel:model.channel(r))).font(.subheadline).foregroundStyle(.secondary)};Spacer();Button{r.selected.toggle()}label:{Image(systemName:r.selected ? "checkmark.circle.fill":"circle").font(.title2).foregroundStyle(Color.nexdoIndigo).frame(width:44,height:44)}.buttonStyle(.plain).accessibilityLabel("Select \(r.name)").accessibilityAddTraits(r.selected ? .isSelected:[])};HStack{Button("Edit recipient"){focusedField=nil;recipientAction = .edit(r.key)}.accessibilityLabel("Edit \(r.name)");Spacer();Button("Remove contact",role:.destructive){model.removeRecipient(key:r.key)}.accessibilityLabel("Remove \(r.name)")}.buttonStyle(.borderless).frame(minHeight:44);Divider()}}}}
        }
        if model.recipients.count > 3 {
            Button(showAllContacts ? "Show less" : "Show more (\(model.recipients.count-3))") {showAllContacts.toggle()}
                .frame(maxWidth:.infinity,minHeight:44).accessibilityIdentifier("festival-show-contacts")
        }
        Button{focusedField=nil;recipientAction = .contacts}label:{Label("Add Contact",systemImage:"plus").frame(maxWidth:.infinity,minHeight:48)}.buttonStyle(.bordered)
        Button("Enter recipient manually"){focusedField=nil;recipientAction = .manual}.frame(minHeight:44)
        Label("Only selected contacts receive this wish.",systemImage:"lock.fill").font(.subheadline).foregroundStyle(.secondary)
        saveButtons
    }}
    private var saveButtons:some View {Group{MomentPrimary(title:"Save Changes"){save()};Button(role:.destructive){deleteConfirm=true}label:{Label("Delete Moment",systemImage:"trash").foregroundStyle(.red).frame(maxWidth:.infinity,minHeight:48).background(.red.opacity(0.08),in:RoundedRectangle(cornerRadius:18))}.buttonStyle(.plain)}}
    /// Asks to cancel schedules only for delivery changes or an unapproved message; an approved message-only save keeps them.
    private func save(approve:Bool=false){focusedField=nil;model.prepareNextTabAfterSave();approveAfterCancel=approve;if model.pendingChange.needsCancelPrompt(approve:approve,hasSchedules:model.hasSchedules){model.needsScheduleConfirmation=true}else{Task{if approve{await model.approve()}else{await model.save()}}}}
    private var generatingWish:Bool {model.wishGeneration.isGenerating}
    private var message:some View {Group{
        Text("Wish Message").font(.largeTitle.bold());HStack{Label("For \(model.selected.count) selected contact\(model.selected.count == 1 ? "":"s")",systemImage:"person.2.fill").font(.subheadline);Spacer();Button("Personalize"){personalize=true}.frame(minHeight:44)}
        MomentSegments(options:["Warm","Personal","Short","Fun"],selection:$model.settings.tone).disabled(generatingWish)
        MomentCard(fill:LinearGradient(colors:[Color.blue.opacity(0.22),Color.cyan.opacity(0.10)],startPoint:.topLeading,endPoint:.bottomTrailing)){TextEditor(text:Binding(get:{model.settings.baseMessage},set:{model.setMessage($0)})).frame(minHeight:130).overlay(alignment:.topLeading){if model.settings.baseMessage.isEmpty {Text(model.suggestion).foregroundStyle(.tertiary).padding(.top,8).padding(.leading,5).allowsHitTesting(false).accessibilityHidden(true)}}.focused($focusedField,equals:.message).scrollContentBackground(.hidden).disabled(generatingWish).opacity(generatingWish ? 0.45:1).accessibilityLabel("\(model.occasionLabel) wish message");Text("\(model.settings.baseMessage.count)/500").font(.caption).frame(maxWidth:.infinity,alignment:.trailing).foregroundStyle(model.settings.baseMessage.count>500 ? .red:.secondary);if model.settings.baseMessage.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {Button("Use suggestion",systemImage:"text.badge.plus"){model.useSuggestion()}.font(.subheadline).frame(minHeight:44).accessibilityIdentifier("wish-use-suggestion")}}
        HStack{Button{if model.settings.manuallyEdited{regenerateConfirm=true}else{Task{await model.generate(aiConsent:aiConsent)}}}label:{WishRegenerateLabel(title:"Regenerate",generating:generatingWish)}.disabled(generatingWish).accessibilityIdentifier("wish-regenerate");Spacer();Button("Edit",systemImage:"pencil"){focusedField = .message}.disabled(generatingWish)}.buttonStyle(.bordered).frame(minHeight:44)
        Toggle("Use AI for this draft",isOn:$aiConsent).disabled(generatingWish);Text("Shares only occasion, tone and your optional context. Generated text is a draft for your review.").font(.caption).foregroundStyle(.secondary)
        Text("Greeting Card").font(.title2.bold())
        if let data=model.imageData,let image=UIImage(data:data) {
            FestivalGreetingCard(artwork:image,title:model.title,message:model.cardMessage,signature:model.settings.cardSignature ?? "")
        } else if let data=model.storedCardImage,let image=UIImage(data:data) {
            StoredGreetingCard(image:image)
        } else {
            MomentCard {Label("Create a personal greeting card",systemImage:"rectangle.portrait.on.rectangle.portrait").font(.headline);Text("AI artwork, your greeting, and your signature in one beautiful card.").foregroundStyle(.secondary)}
        }
        Button(model.imageData == nil ? "Create AI Greeting Card":"Edit Greeting Card",systemImage:"sparkles"){imageSheet=true}.buttonStyle(.borderedProminent)
        Text("Share your finished card from the editor. Scheduled emails include your saved card; Messages send the text only.").font(.caption).foregroundStyle(.secondary)
        GreetingCardUploadStatus(model:model)
        if model.imageData != nil || model.storedCardImage != nil {Button("Remove card",role:.destructive){Task{await model.removeCard()}}.disabled(model.busy).accessibilityIdentifier("remove-greeting-card")}
        if let error=model.error {Text(error).foregroundStyle(.red).accessibilityIdentifier("wish-message-error")}
        MomentPrimary(title:"Save Message"){save(approve:true)}.disabled(generatingWish || model.settings.baseMessage.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || model.settings.baseMessage.count > 500)
    }}
    private var schedule:some View {Group{
        Text("Send time").font(.title2.bold());MomentCard{DatePicker("Date and time",selection:$model.sendDate,in:Date()...).environment(\.timeZone,TimeZone(identifier:model.zone) ?? .current);zonePicker}
        Text("Delivery").font(.title2.bold());MomentCard{ForEach(model.selected){r in VStack(alignment:.leading){HStack{Text(r.initials).padding(10).background(Color.nexdoIndigo.opacity(0.12),in:Circle());Text(r.name).font(.headline);Spacer()};Picker("Channel for \(r.name)",selection:Binding(get:{model.channel(r)},set:{model.settings.channels[r.key]=$0})){if !r.phone.isEmpty{Text("Messages").tag("messages")};if !r.email.isEmpty{Text("Email").tag("email")};Text("Copy / Share").tag("share")};if model.channel(r)=="email"{Toggle("Send automatically",isOn:Binding(get:{model.settings.automatic[r.key] ?? false},set:{model.settings.automatic[r.key]=$0})).disabled(!model.emailReady);Text(model.settings.automatic[r.key]==true ? "Auto-send":"You send at the scheduled time").font(.caption)}else{Text(model.channel(r)=="messages" ? "You tap Send at the scheduled time":"Manual share only").font(.caption)};Divider()}}}
        Text("\(automaticCount) automatic · \(model.selected.count-automaticCount) will be sent by you").font(.subheadline)
        if !model.emailReady{Text("Automatic email needs a connected account and backend scheduler.").font(.caption);NavigationLink("Connect / Reconnect email"){MomentSettingsView()}}
        MomentCard{Toggle("Notify me 1 hour before",isOn:$model.notify);Divider();LabeledContent("Send if app is closed",value:"Email only")}
        Label("At the scheduled time, open your reminder to send the prepared wish. You, the sender, must tap Send in Messages. Recipients do not need to confirm.",systemImage:"info.circle.fill").font(.subheadline).padding().background(.blue.opacity(0.08),in:RoundedRectangle(cornerRadius:14))
        if model.dirty{MomentPrimary(title:"Save Changes"){save()}}
        MomentPrimary(title:"Schedule Wish"){if let issue=FestivalValidation.schedule(settings:model.settings,date:model.sendDate,active:model.active,emailReady:model.emailReady,recipients:model.recipients){model.error=issue}else if model.dirty{model.error="Save changes first."}else{scheduleConfirm=true}}.disabled(model.generatingImage)
        ForEach(model.store.plans.filter{p in p.status != "CANCELLED" && model.originals.contains{$0.drafts.contains{$0.id==p.draftID}}}){p in NavigationLink("\(p.statusLabel) · \(p.channel.capitalized)"){WishPlanView(plan:p)}}
    }}
    private var automaticCount:Int{model.selected.filter{model.channel($0)=="email" && model.settings.automatic[$0.key]==true}.count}
    private var confirmation:some View {
        FestivalScheduleReview(model:model) { scheduleConfirm=false }
    }
    private var personalization:some View {NavigationStack{Form{Section("Shared message"){Text("New recipients inherit the base message.");TextField("Optional personal context",text:$model.settings.personalContext,axis:.vertical)};ForEach(model.selected){r in Section(r.name){Toggle("Personalize this recipient",isOn:Binding(get:{model.settings.overrides[r.key] != nil},set:{if $0{model.settings.overrides[r.key]=model.settings.baseMessage}else{model.settings.overrides.removeValue(forKey:r.key)};model.invalidateApproval()}));if model.settings.overrides[r.key] != nil{TextField("Personal wish",text:Binding(get:{model.settings.overrides[r.key] ?? ""},set:{model.settings.overrides[r.key]=$0;model.invalidateApproval()}),axis:.vertical)}}}}.navigationTitle("Personalize").toolbar{Button("Done"){personalize=false}}}}
    private var imageConfiguration:some View { FestivalGreetingCardEditor(model:model) }

}
private struct FestivalScheduleSuccess:View {
    let title:String
    let occasionType:String
    let plans:[WishDeliveryPlan]
    let wishes:[ScheduleWishPreview]
    let done:()->Void
    private var deliverySummary:[String] {
        Array(Set(plans.map { plan in
            plan.automaticDelivery ? "Will send automatically by email" : plan.channel == "messages" ? "We’ll remind you, the sender, to tap Send in Messages" : "We’ll remind you, the sender, to deliver your wish"
        })).sorted()
    }
    private var sendTimes:[String] {
        Array(Set(plans.map { MomentDates.label($0.date,zone:$0.timeZoneID) })).sorted()
    }
    var body:some View {
        ZStack {
            ScheduleDesign.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing:24) {
                    ZStack {
                        Circle().fill(.green.opacity(0.08)).frame(width:132,height:132)
                        Image(systemName:"checkmark.circle.fill").font(.system(size:92)).foregroundStyle(.green)
                    }.padding(.top,32)
                    Text("Schedule confirmed!").font(.title.bold()).foregroundStyle(ScheduleDesign.ink)
                    VStack(spacing:8) {
                        ForEach(deliverySummary,id:\.self) { Text($0).foregroundStyle(ScheduleDesign.secondary).multilineTextAlignment(.center) }
                        ForEach(sendTimes,id:\.self) { Text($0).bold().multilineTextAlignment(.center).accessibilityIdentifier("schedule-confirmed-date") }
                        Text("For all \(plans.count) selected contact\(plans.count == 1 ? "":"s")")
                            .font(.subheadline).foregroundStyle(ScheduleDesign.secondary).accessibilityIdentifier("festival-confirmation-recipients")
                    }
                    if let wish=wishes.first { ScheduleWishCard(wish:wish,occasion:occasionType) }
                    Button("Done",action:done).buttonStyle(ScheduleActionStyle()).accessibilityIdentifier("wish-primary")
                }.padding(24)
            }
        }
        .overlay { if ["birthday","anniversary","festival"].contains(occasionType) { MomentConfetti().allowsHitTesting(false) } }
        .navigationTitle("Schedule confirmed").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
    }
}

private enum ScheduleDesign {
    static let ink=Color(red:0.06,green:0.09,blue:0.16)
    static let secondary=Color(red:0.39,green:0.45,blue:0.55)
    static let background=Color(red:0.97,green:0.98,blue:1)
}
private struct ScheduleWishPreview {
    let heading:String
    let message:String
}
private struct ScheduleWishCard:View {
    let wish:ScheduleWishPreview
    let occasion:String
    var body:some View {
        HStack(alignment:.center,spacing:16) {
            Text(occasion == "birthday" ? "🎂" : occasion == "anniversary" ? "💐" : occasion == "getWellSoon" ? "🌷" : "🎉")
                .font(.system(size:48)).frame(width:64,height:80).background(.purple.opacity(0.05),in:RoundedRectangle(cornerRadius:18))
                .accessibilityHidden(true)
            VStack(alignment:.leading,spacing:8) {
                Text(wish.heading).font(.headline).foregroundStyle(ScheduleDesign.ink).accessibilityIdentifier("schedule-wish-heading")
                Text(wish.message).font(.subheadline).foregroundStyle(ScheduleDesign.secondary)
            }.frame(maxWidth:.infinity,alignment:.leading)
        }.padding(16)
        .background(LinearGradient(colors:[.purple.opacity(0.06),.pink.opacity(0.04)],startPoint:.bottomLeading,endPoint:.topTrailing),in:RoundedRectangle(cornerRadius:20))
        .overlay(RoundedRectangle(cornerRadius:20).stroke(.purple.opacity(0.08)))
    }
}
private struct ScheduleActionStyle:ButtonStyle {
    var secondary=false
    var gradient=false
    func makeBody(configuration:Configuration)->some View {
        configuration.label.font(.headline).frame(maxWidth:.infinity).padding(.vertical,16)
            .foregroundStyle(secondary ? Color.blue:.white)
            .background {
                RoundedRectangle(cornerRadius:18).fill(LinearGradient(colors:secondary ? [.blue.opacity(0.04),.blue.opacity(0.06)] : gradient ? [.cyan,.blue,.purple,.pink]:[.blue,.blue],startPoint:.leading,endPoint:.trailing))
            }
            .overlay(RoundedRectangle(cornerRadius:18).stroke(secondary ? .blue.opacity(0.25):.clear))
            .opacity(configuration.isPressed ? 0.7:1)
    }
}
private struct FestivalScheduleReview:View {
    @ObservedObject var model:ManageFestivalModel
    let close:()->Void
    @State private var date:Date
    @State private var recipients:[ManagedFestivalRecipient]
    @State private var editingDate=false
    @State private var dateDraft=Date()
    @State private var recipientDraft:ManagedFestivalRecipient?
    @State private var submitting=false
    @State private var showAllRecipients=false
    @State private var sendNowConfirmation=false
    @State private var sendNowStarted=false
    @State private var immediateNotice:String?
    @State private var messagePlan:WishDeliveryPlan?
    @State private var messageQueue:[WishDeliveryPlan]=[]
    init(model:ManageFestivalModel,close:@escaping ()->Void) {
        self.model=model;self.close=close
        _date=State(initialValue:model.sendDate)
        _recipients=State(initialValue:model.selected)
    }
    var body:some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:18) {
                    Text("Review schedule").font(.largeTitle.bold()).foregroundStyle(ScheduleDesign.ink)
                    Text("Let’s make sure everything looks good.").foregroundStyle(ScheduleDesign.secondary)
                    if let recipient=recipients.first {
                        ScheduleWishCard(wish:ScheduleWishPreview(heading:model.reviewHeading(for:recipient),message:model.deliveryMessage(for:recipient)),occasion:model.occasionType)
                    }
                    reviewRow(symbol:"calendar",color:.purple,label:"Scheduled for",value:MomentDates.label(date,zone:model.zone),detail:model.zone,identifier:"review-edit-date") {
                        dateDraft=date;editingDate=true
                    }
                    ForEach(showAllRecipients ? recipients : Array(recipients.prefix(2))) { recipient in
                        reviewRow(symbol:"person",color:.blue,label:"Recipient",value:recipient.name,detail:delivery(recipient),identifier:"review-edit-recipient-"+recipient.key) { recipientDraft=recipient }
                    }
                    if recipients.count > 2 {
                        Button(showAllRecipients ? "Show less" : "Show more…") {
                            showAllRecipients.toggle()
                        }
                        .frame(minHeight:44)
                        .accessibilityIdentifier("review-show-recipients")
                        .accessibilityValue(showAllRecipients ? "Expanded" : "Collapsed")
                    }
                    info("You are confirming this schedule for all selected contacts. Recipients do not need to confirm.",symbol:"info.circle.fill",color:.blue)
                    if recipients.contains(where:{model.channel($0)=="messages"}) {
                        info("At the scheduled time, we’ll remind you to open the prepared wish and tap Send in Messages. Nexdo does not send Messages automatically.",symbol:"bell",color:.purple)
                    }
                    if let error=model.error { Text(error).foregroundStyle(.red).accessibilityIdentifier("review-schedule-error") }
                    if let immediateNotice { Text(immediateNotice).foregroundStyle(ScheduleDesign.secondary) }
                    if sendNowStarted {
                        Button("Continue Send Now") { sendNowConfirmation=true }.buttonStyle(ScheduleActionStyle())
                        Button("Done",action:close).buttonStyle(ScheduleActionStyle(secondary:true))
                    } else {
                        ViewThatFits(in:.horizontal) {
                            HStack(spacing:12) { deliveryButtons }
                            VStack(spacing:12) { deliveryButtons }
                        }
                    }
                }.padding(20).disabled(submitting)
            }.background(ScheduleDesign.background)
            .navigationTitle("").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement:.topBarTrailing) { Button("Cancel",action:close).disabled(submitting) } }
            .sheet(isPresented:$editingDate) {
                editor(title:"Edit date & time",done:{date=dateDraft;editingDate=false},cancel:{editingDate=false}) {
                    DatePicker("Date and time",selection:$dateDraft,in:Date()...).datePickerStyle(.wheel).labelsHidden()
                        .environment(\.timeZone,TimeZone(identifier:model.zone) ?? .current)
                }.presentationDetents([.height(480),.large]).presentationDragIndicator(.visible).presentationBackground(.white)
            }
            .sheet(item:$recipientDraft) { recipient in
                ScheduleRecipientEditor(recipient:recipient,delivery:delivery(recipient)) { updated in
                    if let index=recipients.firstIndex(where:{$0.key==updated.key}) { recipients[index]=updated }
                    recipientDraft=nil
                } cancel:{recipientDraft=nil}
            }
            .sheet(isPresented:$sendNowConfirmation) {
                NavigationStack {
                    ScrollView {
                        VStack(alignment:.leading,spacing:18) {
                            Text("Email is sent now where an address is saved. Messages opens for you to tap Send. Missing channels are skipped.").foregroundStyle(ScheduleDesign.secondary)
                            ForEach(recipients) { recipient in
                                VStack(alignment:.leading,spacing:8) {
                                    Text(recipient.name).font(.headline)
                                    if !recipient.email.isEmpty {Label(recipient.email,systemImage:"envelope")}
                                    if !recipient.phone.isEmpty {Label(recipient.phone,systemImage:"phone")}
                                    Text(model.deliveryMessage(for:recipient)).font(.subheadline).foregroundStyle(ScheduleDesign.secondary)
                                }.frame(maxWidth:.infinity,alignment:.leading).padding().background(.blue.opacity(0.04),in:RoundedRectangle(cornerRadius:16))
                            }
                        }.padding(20)
                    }
                    .safeAreaInset(edge:.bottom) {
                        Button("Send email & open Messages") {sendNowConfirmation=false;Task{await sendNow()}}
                            .buttonStyle(ScheduleActionStyle()).padding().background(.regularMaterial)
                    }
                    .navigationTitle("Send now").navigationBarTitleDisplayMode(.inline)
                    .toolbar {Button("Cancel"){sendNowConfirmation=false}.accessibilityIdentifier("send-now-cancel")}
                }
            }
            .sheet(item:$messagePlan,onDismiss:{
                if !messageQueue.isEmpty { messagePlan=messageQueue.removeFirst() }
            }) { plan in
                ActionMessageComposer(recipient:plan.recipient,body:plan.body) { result in
                    Task {
                        do {
                            if result == .submitted { try await model.store.planAction(plan,action:"sent") }
                            else if result == .failed { model.error="Messages could not send this greeting. Use Continue Send Now to try again." }
                            await model.store.refresh()
                        } catch {model.error=error.localizedDescription}
                        messagePlan=nil
                    }
                }
            }
        }.tint(.blue).interactiveDismissDisabled(submitting)
    }
    @ViewBuilder private var deliveryButtons:some View {
        Button("Send Now") { sendNowConfirmation=true }.buttonStyle(ScheduleActionStyle(secondary:true)).accessibilityIdentifier("review-send-now")
        Button(submitting ? "Confirming…":"Confirm Schedule") { Task { await confirm() } }
            .buttonStyle(ScheduleActionStyle(gradient:true)).accessibilityIdentifier("wish-primary")
    }
    @MainActor private func sendNow() async {
        if recipients.contains(where:{!$0.phone.isEmpty}) && !MFMessageComposeViewController.canSendText() {
            model.error="Messages is not available on this device. No greeting has been sent.";return
        }
        submitting=true;defer{submitting=false}
        model.error=nil
        if !sendNowStarted {
            for recipient in recipients {
                if let old=model.recipients.first(where:{$0.key==recipient.key}),old != recipient {model.saveRecipient(recipient,replacing:old)}
            }
            if model.settings.approvedAt == nil {await model.approve()}
            else if model.dirty {await model.save()}
            if model.needsScheduleConfirmation {close();return}
            guard model.error == nil else{return}
        }
        sendNowStarted=true
        guard let plans=await model.sendImmediately() else{return}
        let emails=plans.filter{$0.channel == "email"}
        let sent=emails.filter{$0.status == "SENT"}.count
        immediateNotice="\(sent) email\(sent == 1 ? "":"s") sent. " + (emails.count > sent ? "Some emails are pending or failed; check Scheduled wishes for their status. " : "") + "Messages still requires you to tap Send."
        messageQueue=plans.filter{$0.channel == "messages" && $0.status == "AWAITING_CONFIRMATION"}
        if !messageQueue.isEmpty {messagePlan=messageQueue.removeFirst()}
    }
    private func delivery(_ recipient:ManagedFestivalRecipient)->String {
        model.channel(recipient)=="email" ? (model.settings.automatic[recipient.key]==true ? "Email · Automatic send":"Email · Will be sent by you") : model.channel(recipient)=="messages" ? "Messages · Will be sent by you":"Copy / Share · Will be sent by you"
    }
    private func reviewRow(symbol:String,color:Color,label:String,value:String,detail:String,identifier:String,edit:@escaping ()->Void)->some View {
        HStack(spacing:12) {
            Image(systemName:symbol).font(.title2).foregroundStyle(color).frame(width:44,height:48).background(color.opacity(0.08),in:RoundedRectangle(cornerRadius:14))
            VStack(alignment:.leading,spacing:4) {
                Text(label).font(.caption).foregroundStyle(ScheduleDesign.secondary)
                Text(value).font(.subheadline.bold()).foregroundStyle(ScheduleDesign.ink)
                Text(detail).font(.caption).foregroundStyle(ScheduleDesign.secondary)
            }.frame(maxWidth:.infinity,alignment:.leading)
            Button("Edit",action:edit).font(.subheadline.bold()).padding(12).background(.blue.opacity(0.07),in:RoundedRectangle(cornerRadius:12)).accessibilityIdentifier(identifier).disabled(sendNowStarted)
        }.padding(14).background(.white,in:RoundedRectangle(cornerRadius:18))
    }
    private func info(_ text:String,symbol:String,color:Color)->some View {
        HStack(alignment:.top,spacing:12) {
            Image(systemName:symbol).font(.title2).foregroundStyle(color).accessibilityHidden(true)
            Text(text).font(.footnote).foregroundStyle(ScheduleDesign.secondary)
        }.padding(14).frame(maxWidth:.infinity,alignment:.leading).background(color.opacity(0.05),in:RoundedRectangle(cornerRadius:16))
    }
    private func editor<Content:View>(title:String,done:@escaping ()->Void,cancel:@escaping ()->Void,@ViewBuilder content:()->Content)->some View {
        VStack(spacing:18) {
            HStack { Spacer();Text(title).font(.headline);Spacer();Button(action:cancel){Image(systemName:"xmark.circle.fill")}.accessibilityLabel("Close editor") }
            content()
            Button("Done",action:done).buttonStyle(ScheduleActionStyle())
            Button("Cancel",action:cancel).buttonStyle(ScheduleActionStyle(secondary:true))
        }.padding(20)
    }
    @MainActor private func confirm() async {
        submitting=true;defer{submitting=false}
        model.error=nil
        model.sendDate=date
        for recipient in recipients {
            if let old=model.recipients.first(where:{$0.key==recipient.key}),old != recipient { model.saveRecipient(recipient,replacing:old) }
        }
        if model.settings.approvedAt == nil { await model.approve() }
        else if model.dirty { await model.save() }
        if model.needsScheduleConfirmation { close();return }
        guard model.error == nil else {return}
        await model.schedule()
        if model.scheduleCompleted { close() }
    }
}
private struct ScheduleRecipientEditor:View {
    @State var recipient:ManagedFestivalRecipient
    let delivery:String
    let done:(ManagedFestivalRecipient)->Void
    let cancel:()->Void
    var body:some View {
        NavigationStack {
            ScrollView {
                VStack(spacing:24) {
                    HStack {
                        Image(systemName:"person").font(.largeTitle).foregroundStyle(.blue)
                        TextField("Recipient name",text:$recipient.name).textFieldStyle(.roundedBorder).accessibilityIdentifier("review-recipient-name")
                    }
                    TextField("Phone number",text:$recipient.phone).keyboardType(.phonePad).textFieldStyle(.roundedBorder)
                    TextField("Email address",text:$recipient.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).textFieldStyle(.roundedBorder)
                    Label(delivery,systemImage:delivery.hasPrefix("Messages") ? "message.fill":delivery.hasPrefix("Email") ? "envelope.fill":"square.and.arrow.up").foregroundStyle(ScheduleDesign.secondary).frame(maxWidth:.infinity,alignment:.leading)
                    Button("Done"){done(recipient)}.buttonStyle(ScheduleActionStyle()).disabled(recipient.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                    Button("Cancel",action:cancel).buttonStyle(ScheduleActionStyle(secondary:true))
                }.padding(24)
            }.navigationTitle("Edit recipient").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button(action:cancel){Image(systemName:"xmark.circle.fill")}.accessibilityLabel("Close editor") }
        }.presentationDetents([.height(480),.large]).presentationDragIndicator(.visible).presentationBackground(.white)
    }
}
