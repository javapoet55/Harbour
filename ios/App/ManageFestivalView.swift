import SwiftUI

struct MomentsManagementEntry: View {
    let onDone: () -> Void
    @EnvironmentObject private var store:ImportantMomentsStore
    private var groups:[MomentDisplayGroup] {
        MomentDisplayGroup.groups(store.moments.filter {
            !($0.festivalSettings?.contains("\"archived\":true") ?? false)
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
    private let onDone: (() -> Void)?
    @StateObject private var model:ManageFestivalModel
    @State private var discard=false
@State private var deleteConfirm=false
@State private var disableConfirm=false
@State private var scheduleConfirm=false
    @State private var showingSettings=false
    @State private var showAllContacts=false
    @State private var contacts=false
@State private var manual=false
@State private var personalize=false
@State private var imageSheet=false
@State private var regenerateConfirm=false
@State private var aiConsent=false
    @State private var approveAfterCancel=false
    @State private var contactChoices:[FestivalContactChoice]=[]
    @State private var choicePhone=""
    @State private var choiceEmail=""
    private enum Field:Hashable { case name, message, recipientName(String), recipientPhone(String), recipientEmail(String) }
    @FocusState private var focusedField:Field?
    init(group:MomentDisplayGroup,store:ImportantMomentsStore,onDone:(() -> Void)?=nil){self.onDone=onDone;_model=StateObject(wrappedValue:ManageFestivalModel(group:group,store:store))}
    var body:some View {
        ZStack {TodayBackdrop();ScrollView{VStack(alignment:.leading,spacing:20){
            identity
            tabs
            Group {switch model.tab {case .details:details;case .contacts:recipients;case .message:message;case .schedule:schedule}}
            if model.busy {ProgressView("Saving…")}
            if let error=model.error {Text(error).foregroundStyle(.red).accessibilityIdentifier("festival-error")}
            if let notice=model.notice {Text(notice).font(.subheadline).foregroundStyle(.secondary).accessibilityIdentifier("festival-notice")}
        }.padding(18)}}
        .navigationTitle("Manage Moment").navigationBarTitleDisplayMode(.inline).navigationBarBackButtonHidden()
        .navigationDestination(isPresented:$model.scheduleCompleted){FestivalScheduleSuccess(title:model.title,occasionType:model.occasionType,plans:model.savedPlans,manage:{model.tab = .schedule;model.scheduleCompleted=false},done:{if let onDone{onDone()}else{dismiss()}})}
        .navigationDestination(isPresented:$showingSettings){MomentSettingsView().environmentObject(model.store)}
        .toolbar {
            ToolbarItem(placement:.topBarLeading){Button {if model.dirty{discard=true}else{dismiss()}}label:{Image(systemName:"chevron.left").frame(width:44,height:44)}.accessibilityLabel("Back")}
            ToolbarItem(placement:.topBarTrailing){Menu{Button(model.occasionType == "festival" ? "Festival settings" : "Moment settings"){focusedField=nil;showingSettings=true};Button("Delete Moment",role:.destructive){deleteConfirm=true}.accessibilityIdentifier("festival-delete-menu")}label:{Image(systemName:"ellipsis").frame(width:44,height:44)}.accessibilityLabel("Moment options")}
            ToolbarItemGroup(placement:.keyboard){Spacer();Button("Done"){focusedField=nil}.accessibilityIdentifier("festival-keyboard-done")}
        }
        .disabled(model.busy)
        .task {await model.loadCatalog()}
        .onDisappear {model.cancelImage()}
        .alert("Discard unsaved changes?",isPresented:$discard){Button("Discard changes",role:.destructive){model.discardImageEdits();dismiss()};Button("Keep editing",role:.cancel){}}
        .confirmationDialog("Disable this moment? Pending wishes will be cancelled. Contacts and messages are preserved.",isPresented:$disableConfirm,titleVisibility:.visible){Button("Disable and cancel wishes",role:.destructive){Task{await model.setActive(false,cancelSchedules:true)}}}
        .alert("Delete Moment?",isPresented:$deleteConfirm){Button("Delete Moment",role:.destructive){Task{if await model.delete(){dismiss()}}};Button("Cancel",role:.cancel){}}message:{Text("Contacts will be disconnected, scheduled wishes cancelled, and saved drafts deleted. Sent history remains.")}
        .alert("Save changes to scheduled wishes?",isPresented:$model.needsScheduleConfirmation){Button("Cancel schedules and save"){Task{if approveAfterCancel{await model.approve(cancelSchedules:true)}else{await model.save(cancelSchedules:true)}}};Button("Keep schedules",role:.cancel){model.cancelTabChange()}}message:{Text("Saving these changes cancels the existing schedules for this moment. After saving, review and schedule your updated wishes again.")}
        .confirmationDialog("Replace the edited message with a new draft?",isPresented:$regenerateConfirm,titleVisibility:.visible){Button("Regenerate"){Task{await model.generate(aiConsent:aiConsent)}}}
        .sheet(isPresented:$contacts){ManagedFestivalContactsPicker{values in contacts=false;contactChoices=values;if let first=values.first{choicePhone=first.phones.first ?? "";choiceEmail=first.emails.first ?? ""}}}
        .sheet(isPresented:Binding(get:{!contactChoices.isEmpty && !contacts},set:{if !$0{contactChoices=[]}})){contactSelection}
        .sheet(isPresented:$manual){NavigationStack{FestivalManualRecipient{r in model.recipients.append(r);model.settings.channels[r.key]=r.phone.isEmpty ? "email":"messages";model.invalidateApproval();manual=false}.toolbar{Button("Cancel"){manual=false}}}}
        .sheet(isPresented:$personalize){personalization}
        .sheet(isPresented:$imageSheet){imageConfiguration}
        .sheet(isPresented:$scheduleConfirm){confirmation}
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
            Label("Send date · \(MomentDates.sendDayLabel(model.sendDate,zone:model.zone))",systemImage:"calendar")
                .font(.subheadline).foregroundStyle(.secondary)
                .accessibilityIdentifier("festival-send-date")
        }
    }

    private var tabs:some View {HStack(spacing:3){ForEach(ManageFestivalModel.Tab.allCases,id:\.self){tab in Button{focusedField=nil;approveAfterCancel=false;Task{await model.changeTab(to:tab)};FestivalAnalytics().record(.tab)}label:{Text(tab.rawValue).font(.subheadline).lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth:.infinity,minHeight:44).padding(.vertical,5).foregroundStyle(model.tab==tab ? Color.white:Color.nexdoIndigo).background(model.tab==tab ? Color.nexdoIndigo:Color.clear,in:RoundedRectangle(cornerRadius:18))}.buttonStyle(.plain).accessibilityAddTraits(model.tab==tab ? .isSelected:[]).accessibilityIdentifier("festival-tab-\(tab.rawValue)")}}.padding(5).background(.ultraThinMaterial,in:RoundedRectangle(cornerRadius:22))}
    private var details:some View {Group{
        Text("Moment Details").font(.largeTitle.bold())
        MomentCard{HStack{Text("Moment name").foregroundStyle(.primary);TextField("Moment name",text:$model.title).fontWeight(.bold).focused($focusedField,equals:.name).submitLabel(.done).onSubmit{focusedField=nil}.multilineTextAlignment(.trailing).accessibilityIdentifier("festival-name");Image(systemName:"pencil")};Divider();LabeledContent("Type",value:model.occasionLabel);Divider();DatePicker("Date",selection:$model.date,in:Calendar.current.startOfDay(for:Date())...,displayedComponents:.date).accessibilityIdentifier("festival-details-date").environment(\.timeZone,TimeZone(identifier:model.zone) ?? .current).disabled(model.settings.catalogManaged)}
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
        MomentCard{ForEach($model.recipients){$r in if showAllContacts || model.recipients.prefix(3).contains(where:{$0.id==r.id}) {VStack(alignment:.leading,spacing:10){HStack{Text(r.initials).font(.title2.bold()).frame(width:48,height:48).background(Color.nexdoIndigo.opacity(0.12),in:Circle());VStack(alignment:.leading){Text(r.name).font(.headline);Text(r.masked(channel:model.channel(r))).font(.subheadline).foregroundStyle(.secondary)};Spacer();Button{r.selected.toggle()}label:{Image(systemName:r.selected ? "checkmark.circle.fill":"circle").font(.title2).foregroundStyle(Color.nexdoIndigo).frame(width:44,height:44)}.buttonStyle(.plain).accessibilityLabel("Select \(r.name)").accessibilityAddTraits(r.selected ? .isSelected:[])};DisclosureGroup("Edit recipient"){TextField("Name",text:$r.name).focused($focusedField,equals:.recipientName(r.key)).submitLabel(.done).onSubmit{focusedField=nil};TextField("Phone",text:$r.phone).keyboardType(.phonePad).focused($focusedField,equals:.recipientPhone(r.key));TextField("Email",text:$r.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).focused($focusedField,equals:.recipientEmail(r.key)).submitLabel(.done).onSubmit{focusedField=nil};Button("Use as manually entered contact"){r.contactIdentifier=""};Button("Remove contact",role:.destructive){let key=r.id;model.recipients.removeAll{$0.id==key};model.invalidateApproval()}};Divider()}}}}
        if model.recipients.count > 3 {
            Button(showAllContacts ? "Show less" : "Show more (\(model.recipients.count-3))") {showAllContacts.toggle()}
                .frame(maxWidth:.infinity,minHeight:44).accessibilityIdentifier("festival-show-contacts")
        }
        Button{contacts=true}label:{Label("Add Contact",systemImage:"plus").frame(maxWidth:.infinity,minHeight:48)}.buttonStyle(.bordered)
        Button("Enter recipient manually"){manual=true}.frame(minHeight:44)
        Label("Only selected contacts receive this wish.",systemImage:"lock.fill").font(.subheadline).foregroundStyle(.secondary)
        saveButtons
    }}
    private var saveButtons:some View {Group{MomentPrimary(title:"Save Changes"){save()};Button(role:.destructive){deleteConfirm=true}label:{Label("Delete Moment",systemImage:"trash").foregroundStyle(.red).frame(maxWidth:.infinity,minHeight:48).background(.red.opacity(0.08),in:RoundedRectangle(cornerRadius:18))}.buttonStyle(.plain)}}
    private func save(approve:Bool=false){approveAfterCancel=approve;if model.dirty && model.hasSchedules || approve && model.hasSchedules{model.needsScheduleConfirmation=true}else{Task{if approve{await model.approve()}else{await model.save()}}}}
    private var message:some View {Group{
        Text("Wish Message").font(.largeTitle.bold());HStack{Label("For \(model.selected.count) selected contact\(model.selected.count == 1 ? "":"s")",systemImage:"person.2.fill").font(.subheadline);Spacer();Button("Personalize"){personalize=true}.frame(minHeight:44)}
        MomentSegments(options:["Warm","Personal","Short","Fun"],selection:$model.settings.tone)
        MomentCard(fill:LinearGradient(colors:[Color.blue.opacity(0.22),Color.cyan.opacity(0.10)],startPoint:.topLeading,endPoint:.bottomTrailing)){TextEditor(text:Binding(get:{model.settings.baseMessage},set:{model.settings.baseMessage=$0;model.settings.manuallyEdited=true;model.invalidateApproval()})).frame(minHeight:130).focused($focusedField,equals:.message).scrollContentBackground(.hidden).accessibilityLabel("\(model.occasionLabel) wish message");Text("\(model.settings.baseMessage.count)/500").font(.caption).frame(maxWidth:.infinity,alignment:.trailing).foregroundStyle(model.settings.baseMessage.count>500 ? .red:.secondary)}
        HStack{Button("Regenerate",systemImage:"sparkles"){if model.settings.manuallyEdited{regenerateConfirm=true}else{Task{await model.generate(aiConsent:aiConsent)}}};Spacer();Button("Edit",systemImage:"pencil"){focusedField = .message}}.buttonStyle(.bordered).frame(minHeight:44)
        Toggle("Use AI for this draft",isOn:$aiConsent);Text("Shares only occasion, tone and your optional context. Generated text is a draft for your review.").font(.caption).foregroundStyle(.secondary)
        Text("Greeting Card").font(.title2.bold())
        if let data=model.imageData,let image=UIImage(data:data) {
            FestivalGreetingCard(artwork:image,title:model.title,message:model.settings.cardGreeting ?? model.settings.baseMessage,signature:model.settings.cardSignature ?? "")
        } else {
            MomentCard {Label("Create a personal greeting card",systemImage:"rectangle.portrait.on.rectangle.portrait").font(.headline);Text("AI artwork, your greeting, and your signature in one beautiful card.").foregroundStyle(.secondary)}
        }
        Button(model.imageData == nil ? "Create AI Greeting Card":"Edit Greeting Card",systemImage:"sparkles"){imageSheet=true}.buttonStyle(.borderedProminent)
        Text("Share your finished card from the editor. Scheduled wishes currently send the text message only.").font(.caption).foregroundStyle(.secondary)
        if model.imageData != nil {Button("Remove greeting card",role:.destructive){model.removeImage()}}
        MomentPrimary(title:"Save Message"){save(approve:true)}
    }}
    private var schedule:some View {Group{
        Text("Schedule").font(.largeTitle.bold());Label(MomentDates.sendDayLabel(model.sendDate,zone:model.zone),systemImage:"calendar").foregroundStyle(.secondary)
        Text("Send time").font(.title2.bold());MomentCard{DatePicker("Date and time",selection:$model.sendDate,in:Date()...).environment(\.timeZone,TimeZone(identifier:model.zone) ?? .current);zonePicker}
        Text("Delivery").font(.title2.bold());MomentCard{ForEach(model.selected){r in VStack(alignment:.leading){HStack{Text(r.initials).padding(10).background(Color.nexdoIndigo.opacity(0.12),in:Circle());Text(r.name).font(.headline);Spacer()};Picker("Channel for \(r.name)",selection:Binding(get:{model.channel(r)},set:{model.settings.channels[r.key]=$0})){if !r.phone.isEmpty{Text("Messages").tag("messages")};if !r.email.isEmpty{Text("Email").tag("email")};Text("Copy / Share").tag("share")};if model.channel(r)=="email"{Toggle("Send automatically",isOn:Binding(get:{model.settings.automatic[r.key] ?? false},set:{model.settings.automatic[r.key]=$0})).disabled(!model.emailReady);Text(model.settings.automatic[r.key]==true ? "Auto-send":"You send at the scheduled time").font(.caption)}else{Text(model.channel(r)=="messages" ? "You tap Send at the scheduled time":"Manual share only").font(.caption)};Divider()}}}
        Text("\(automaticCount) automatic · \(model.selected.count-automaticCount) will be sent by you").font(.subheadline)
        if !model.emailReady{Text("Automatic email needs a connected account and backend scheduler.").font(.caption);NavigationLink("Connect / Reconnect email"){MomentSettingsView()}}
        MomentCard{Toggle("Notify me 1 hour before",isOn:$model.notify);Divider();LabeledContent("Send if app is closed",value:"Email only")}
        Label("At the scheduled time, open your reminder to send the prepared wish. iOS requires you, the sender, to tap Send in Messages. Recipients do not need to confirm.",systemImage:"info.circle.fill").font(.subheadline).padding().background(.blue.opacity(0.08),in:RoundedRectangle(cornerRadius:14))
        if model.dirty{MomentPrimary(title:"Save Changes"){save()}}
        MomentPrimary(title:"Schedule Wish"){if let issue=FestivalValidation.schedule(settings:model.settings,date:model.sendDate,active:model.active,emailReady:model.emailReady,recipients:model.recipients){model.error=issue}else if model.dirty{model.error="Save changes first."}else{scheduleConfirm=true}}.disabled(model.generatingImage)
        ForEach(model.store.plans.filter{p in p.status != "CANCELLED" && model.originals.contains{$0.drafts.contains{$0.id==p.draftID}}}){p in NavigationLink("\(p.statusLabel) · \(p.channel.capitalized)"){WishPlanView(plan:p)}}
    }}
    private var automaticCount:Int{model.selected.filter{model.channel($0)=="email" && model.settings.automatic[$0.key]==true}.count}
    private var confirmation:some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:18) {
                    if let recipient=model.selected.first, model.selected.count == 1 {
                        Text(model.reviewHeading(for:recipient)).font(.title.bold())
                        Text(model.deliveryMessage(for:recipient))
                    } else {
                        Text(model.title).font(.title.bold())
                    }
                    Text(MomentDates.label(model.sendDate,zone:model.zone))
                    ForEach(model.selected) { r in
                        VStack(alignment:.leading) {
                            Text(r.name).font(.headline)
                            if model.selected.count > 1 {
                                Text(model.reviewHeading(for:r)).font(.headline)
                                Text(model.deliveryMessage(for:r))
                            }
                            Text(model.channel(r)=="email" && model.settings.automatic[r.key]==true
                                 ? "Email · Automatic send" : model.channel(r)=="messages" ? "Messages · Will be sent by you" : "Manual delivery · Will be sent by you")
                                .foregroundStyle(.secondary)
                        }
                    }
                    Text("You are confirming this schedule for all selected contacts. Recipients do not need to confirm.")
                    if model.selected.contains(where:{model.channel($0)=="messages"}) {
                        Text("At the scheduled time, we’ll remind you to open the prepared wish and tap Send in Messages. iOS does not allow Nexdo to send Messages automatically.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    MomentPrimary(title:"Confirm Schedule"){scheduleConfirm=false;Task{await model.schedule()}}
                }.padding()
            }.navigationTitle("Review schedule").toolbar{Button("Cancel"){scheduleConfirm=false}}
        }
    }
    private var personalization:some View {NavigationStack{Form{Section("Shared message"){Text("New recipients inherit the base message.");TextField("Optional personal context",text:$model.settings.personalContext,axis:.vertical)};ForEach(model.selected){r in Section(r.name){Toggle("Personalize this recipient",isOn:Binding(get:{model.settings.overrides[r.key] != nil},set:{if $0{model.settings.overrides[r.key]=model.settings.baseMessage}else{model.settings.overrides.removeValue(forKey:r.key)};model.invalidateApproval()}));if model.settings.overrides[r.key] != nil{TextField("Personal wish",text:Binding(get:{model.settings.overrides[r.key] ?? ""},set:{model.settings.overrides[r.key]=$0;model.invalidateApproval()}),axis:.vertical)}}}}.navigationTitle("Personalize").toolbar{Button("Done"){personalize=false}}}}
    private var contactSelection:some View {NavigationStack{Form{if let choice=contactChoices.first{Section(choice.name){Text("Choose the address to use.");Picker("Phone",selection:$choicePhone){Text("None").tag("");ForEach(choice.phones,id:\.self){Text($0).tag($0)}};Picker("Email",selection:$choiceEmail){Text("None").tag("");ForEach(choice.emails,id:\.self){Text($0).tag($0)}};Button("Add selected recipient"){let key=TaskActionCoordinator.ownerKey(choice.id);if !model.recipients.contains(where:{$0.key==key || $0.contactIdentifier==choice.id}){model.recipients.append(ManagedFestivalRecipient(key:key,name:choice.name,phone:choicePhone,email:choiceEmail,contactIdentifier:choice.id));model.settings.channels[key]=choicePhone.isEmpty ? "email":"messages";model.invalidateApproval()};contactChoices.removeFirst();if let next=contactChoices.first{choicePhone=next.phones.first ?? "";choiceEmail=next.emails.first ?? ""}}.disabled(choicePhone.isEmpty && choiceEmail.isEmpty)}}}.navigationTitle("Choose delivery address").toolbar{Button("Cancel"){contactChoices=[]}}}}
    private var imageConfiguration:some View { FestivalGreetingCardEditor(model:model) }

}
private struct FestivalManualRecipient:View {
    @State private var recipient=ManagedFestivalRecipient()
    let save:(ManagedFestivalRecipient)->Void
    var body:some View{Form{TextField("Name",text:$recipient.name);TextField("Phone",text:$recipient.phone).keyboardType(.phonePad);TextField("Email",text:$recipient.email).keyboardType(.emailAddress).textInputAutocapitalization(.never);Button("Add recipient"){save(recipient)}.disabled(recipient.name.isEmpty || recipient.phone.isEmpty && recipient.email.isEmpty)}.navigationTitle("Add Contact")}
}

private struct FestivalScheduleSuccess:View {
    let title:String
    let occasionType:String
    let plans:[WishDeliveryPlan]
    let manage:()->Void
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
        ZStack {TodayBackdrop();ScrollView{VStack(spacing:20){
            Image(systemName:"calendar.badge.checkmark").font(.system(size:68)).foregroundStyle(Color.nexdoIndigo)
            Text(occasionType == "getWellSoon" ? "Get Well Scheduled" : "Wishes scheduled").font(.largeTitle.bold()).multilineTextAlignment(.center)
            Text(title).font(.title2)
            MomentCard {
                Text("For all \(plans.count) selected contact\(plans.count == 1 ? "":"s")").font(.headline)
                    .accessibilityIdentifier("festival-confirmation-recipients")
                ForEach(deliverySummary,id:\.self) { summary in
                    Label(summary,systemImage:summary.hasPrefix("Will send") ? "envelope.fill":"bell.fill")
                }
                ForEach(sendTimes,id:\.self) { Text($0).fontWeight(.bold).multilineTextAlignment(.center).frame(maxWidth:.infinity).accessibilityIdentifier("schedule-confirmed-date") }
                Button("Manage scheduled wish",action:manage).frame(minHeight:44)
                    .accessibilityIdentifier("festival-manage-schedule")
            }
            MomentPrimary(title:"Done",action:done)
        }.padding(18)}}
        .overlay { if ["birthday","anniversary","festival"].contains(occasionType) { MomentConfetti() } }
        .navigationTitle("Schedule confirmed").navigationBarTitleDisplayMode(.inline)
    }
}
