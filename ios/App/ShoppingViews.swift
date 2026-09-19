import SwiftUI

struct ShoppingTodayCard:View {
    @EnvironmentObject private var model:AppModel
    var body:some View {ShoppingTodayContent(api:model.momentAPI).id(model.profile?.id)}
}
private struct ShoppingTodayContent:View {
    @EnvironmentObject private var model:AppModel
    @Environment(\.scenePhase) private var phase
    @StateObject private var store:ShoppingStore
    init(api:APIClient){_store=StateObject(wrappedValue:ShoppingStore(api:api))}
    var body:some View {
        MomentCard {
            HStack{Label("Recurring Tasks",systemImage:"arrow.triangle.2.circlepath").font(.headline);Spacer();NavigationLink("See all"){RecurringHub(store:store)}}
            if let list=store.lists.filter({$0.completedAt==nil && $0.weekly}).sorted(by:{$0.date<$1.date}).first {
                NavigationLink{ShoppingDetail(store:store,initial:list)}label:{shoppingSummary(list)}.buttonStyle(.plain)
            }else{
                NavigationLink{ShoppingHome(store:store)}label:{
                    HStack{shoppingIcon;VStack(alignment:.leading){Text("Shopping Lists").font(.headline);Text("Plan your next trip · Add by voice").font(.caption).foregroundStyle(.secondary)};Spacer();Image(systemName:"chevron.right")}
                }.buttonStyle(.plain)
            }
            if let task=model.tasks.first(where:{$0.recurrence != nil && $0.status != "COMPLETED" && $0.status != "CANCELLED"}) {
                NavigationLink{TaskEditor(task:task)}label:{Label(task.title,systemImage:"repeat").font(.subheadline)}
            }
            if store.error != nil {Button("Reload shopping lists"){Task{await store.refresh()}}.font(.caption)}
        }.tint(.nexdoIndigo).task{await store.refresh()}
            .onChange(of:phase){_,value in if value == .active{Task{await store.refresh()}}}
    }
}
private var shoppingIcon:some View {Image(systemName:"cart.fill").font(.title).foregroundStyle(.green).frame(width:56,height:56).background(.green.opacity(0.14),in:RoundedRectangle(cornerRadius:17))}
private func shoppingSummary(_ list:GroceryList)->some View {
    HStack(spacing:14){shoppingIcon;VStack(alignment:.leading,spacing:5){
        Text(list.title).font(.headline)
        Text("\(list.weekly ? "Every week":"Shopping list") · \(list.items.count) items").font(.subheadline).foregroundStyle(.secondary)
        Text("Next: "+MomentDates.sendDayLabel(MomentDates.date(list.date,zone:list.timeZone),zone:list.timeZone)).font(.caption).foregroundStyle(.green)
    };Spacer();Image(systemName:"chevron.right").foregroundStyle(.secondary)}
}
struct RecurringHub:View {
    @EnvironmentObject private var model:AppModel
    @ObservedObject var store:ShoppingStore
    @State private var createTask=false
    var body:some View {
        ZStack{TodayBackdrop();ScrollView{VStack(alignment:.leading,spacing:18){
            NavigationLink{ShoppingHome(store:store)}label:{MomentCard{shoppingIcon;Text("Shopping Lists").font(.title2.bold());Text("Create, reuse, and shop with your voice.")}}.buttonStyle(.plain)
            HStack{Text("Repeating tasks").font(.title2.bold());Spacer();Button("Create New"){createTask=true}}
            ForEach(model.tasks.filter{$0.recurrence != nil && $0.status != "COMPLETED" && $0.status != "CANCELLED"}){task in
                NavigationLink{TaskEditor(task:task)}label:{MomentCard{Label(task.title,systemImage:"repeat").font(.headline);Text(task.recurrence?.frequency.capitalized ?? "").foregroundStyle(.secondary)}}.buttonStyle(.plain)
            }
            Text("Completing a recurring task creates its next occurrence. Manage its repeat settings in task details.").font(.caption).foregroundStyle(.secondary)
        }.padding(18)}}.navigationTitle("Recurring Tasks").sheet(isPresented:$createTask){NewRecurringTask()}
    }
}
private struct NewRecurringTask:View {
    @EnvironmentObject private var model:AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var title=""
    @State private var date=Date().addingTimeInterval(3600)
    @State private var frequency="WEEKLY"
    @State private var busy=false
    @State private var error:String?
    var body:some View {
        NavigationStack{Form{
            TextField("Task name",text:$title)
            DatePicker("First occurrence",selection:$date,in:Date()...)
            Picker("Repeat",selection:$frequency){ForEach(["DAILY","WEEKLY","MONTHLY","YEARLY"],id:\.self){Text($0.capitalized)}}
            Text("30-minute task. You can adjust duration and reminders in task details.")
            if let error{Text(error).foregroundStyle(.red)}
            Button("Create Recurring Task"){Task{
                busy=true;defer{busy=false}
                do{let body:[String:Any]=["title":title,"durationMin":30,"startAt":ISO8601DateFormatter().string(from:date),"recurrence":["frequency":frequency,"interval":1]]
                    let _:MomentOK=try await model.momentAPI.request("/api/tasks",method:"POST",body:JSONSerialization.data(withJSONObject:body))
                    await model.refreshTasks();dismiss()
                }catch{self.error=error.localizedDescription}
            }}.disabled(busy || title.trimmingCharacters(in:.whitespaces).isEmpty)
        }.navigationTitle("Recurring Task").toolbar{Button("Cancel"){dismiss()}}}
    }
}
struct ShoppingHome: View {
    @ObservedObject var store: ShoppingStore
    @State private var create = false
    @State private var created: GroceryList?
    var body: some View {
        ZStack {
            TodayBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Button { create = true } label: {
                        MomentCard {
                            HStack(spacing: 14) {
                                listTile("doc.badge.plus", color: .nexdoIndigo)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text("Create New List").font(.headline).foregroundStyle(Color.nexdoInk)
                                    Text("Start from scratch or use last week’s list.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").foregroundStyle(Color.nexdoSecondary)
                            }
                        }
                    }.buttonStyle(.plain).accessibilityIdentifier("shopping-create-list")
                    Text("Recent Lists").font(.title2.bold()).foregroundStyle(Color.nexdoInk)
                    if store.lists.isEmpty && store.error == nil {
                        ContentUnavailableView("Your next trip starts here", systemImage: "cart", description: Text("Create a list, then type or dictate what you need."))
                    } else if !store.lists.isEmpty {
                        MomentCard {
                            ForEach(Array(store.lists.enumerated()), id: \.element.id) { index, list in
                                if index > 0 { Divider() }
                                NavigationLink { ShoppingDetail(store: store, initial: list) } label: {
                                    HStack(spacing: 12) {
                                        listTile(list.completedAt == nil ? "cart.fill" : "doc.on.doc", color: list.completedAt == nil ? .green : .nexdoIndigo)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(list.title).font(.headline).foregroundStyle(Color.nexdoInk)
                                            Text("\(list.items.count) items" + (list.completedAt == nil ? "" : " · Completed")).font(.caption).foregroundStyle(Color.nexdoSecondary)
                                        }
                                        Spacer(minLength: 4)
                                        Text(MomentDates.date(list.date, zone: list.timeZone), format: .dateTime.month(.abbreviated).day()).font(.caption).foregroundStyle(Color.nexdoSecondary)
                                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(Color.nexdoSecondary)
                                    }.padding(.vertical, 4).contentShape(Rectangle())
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                    if let error = store.error {
                        Text(error).foregroundStyle(.red)
                        Button("Try again") { Task { await store.refresh() } }
                    }
                }.padding(18)
            }
        }.navigationTitle("My Lists").tint(.nexdoIndigo)
            .toolbar { Button { create = true } label: { Image(systemName: "plus.circle.fill").font(.title2) }.accessibilityLabel("Create shopping list") }
            .sheet(isPresented: $create) {
                NewShoppingList(store: store) { created = $0 }
            }
            .navigationDestination(isPresented: Binding(get: { created != nil && !create }, set: { if !$0 { created = nil } })) {
                if let created { ShoppingDetail(store: store, initial: created) }
            }
            .refreshable { await store.refresh() }.task { await store.refresh() }
    }
}
private func listTile(_ symbol: String, color: Color) -> some View {
    Image(systemName: symbol).font(.title2).foregroundStyle(color)
        .frame(width: 48, height: 48).background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
}
private struct NewShoppingList: View {
    @ObservedObject var store: ShoppingStore
    var source: GroceryList? = nil
    var onCreated: ((GroceryList) -> Void)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var title = "Weekly Shopping List"
    @State private var date = Date()
    @State private var weekly = true
    @State private var useLast = false
    @State private var createKey = UUID().uuidString
    private var previous: GroceryList? { source ?? store.lists.first(where: { $0.completedAt != nil }) ?? store.lists.first }
    var body: some View {
        NavigationStack {
            ZStack {
                TodayBackdrop()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        choice("Start from Scratch", subtitle: "Create a brand new list.", symbol: "doc.badge.plus", selected: !useLast) { useLast = false }
                        choice("Use Last Week’s List", subtitle: previous.map { "Copy \($0.items.count) items from “\($0.title)” and edit." } ?? "Create your first list to reuse it next time.", symbol: "arrow.counterclockwise", selected: useLast) { useLast = true }
                            .disabled(previous == nil).opacity(previous == nil ? 0.5 : 1)
                            .accessibilityIdentifier("shopping-use-last")
                        Text("List Name").font(.headline).padding(.top, 10)
                        MomentCard {
                            TextField("List name", text: $title).font(.headline).accessibilityIdentifier("shopping-list-name")
                            Divider()
                            DatePicker("Shopping date", selection: $date, displayedComponents: .date)
                            Divider()
                            Toggle("Repeat every week", isOn: $weekly)
                            Text("Complete a trip to copy all items into next week’s list, with every item unchecked.").font(.caption).foregroundStyle(Color.nexdoSecondary)
                        }
                        if let error = store.error { Text(error).foregroundStyle(.red) }
                    }.padding(18)
                }
            }.navigationTitle("New List").navigationBarTitleDisplayMode(.inline).tint(.nexdoIndigo)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
                .safeAreaInset(edge: .bottom) {
                    MomentPrimary(title: store.busy ? "Creating…" : "Create List") {
                        Task {
                            let value = GroceryList(id: UUID().uuidString, title: title.trimmingCharacters(in: .whitespacesAndNewlines), date: MomentDates.day(date, zone: TimeZone.current.identifier), timeZone: TimeZone.current.identifier, weekly: weekly, revision: 0, items: useLast ? (previous?.items.map { var i = $0; i.checked = false; return i } ?? []) : [])
                            if let saved = await store.action("create", input: ShoppingInput(value), idempotencyKey: createKey) { onCreated?(saved); dismiss() }
                        }
                    }.disabled(store.busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .padding(18).background(.ultraThinMaterial)
                }
                .onAppear { if let source { title = source.title; useLast = true } }
        }
    }
    private func choice(_ title: String, subtitle: String, symbol: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            MomentCard {
                HStack(spacing: 14) {
                    listTile(symbol, color: .nexdoIndigo)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(title).font(.headline).foregroundStyle(Color.nexdoInk)
                        Text(subtitle).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle").foregroundStyle(Color.nexdoIndigo)
                }
            }.background(selected ? Color.nexdoIndigo.opacity(0.09) : .clear, in: RoundedRectangle(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(selected ? Color.nexdoIndigo : .clear, lineWidth: 1.5))
        }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
    }
}
struct ShoppingDetail:View {
    @ObservedObject var store:ShoppingStore
    @Environment(\.dismiss) private var dismiss
    @State private var list:GroceryList
    @State private var quick=""
    @State private var item:GroceryItem?
    @State private var voice=false
    @State private var copy=false
    @State private var settings=false
    @State private var sharing=false
    @State private var deleting=false
    @State private var completing=false
    @State private var pending:[GroceryItem]=[]
    @State private var pendingReview=false
    @State private var parseBusy=false
    @State private var error:String?
    init(store:ShoppingStore,initial:GroceryList){self.store=store;_list=State(initialValue:initial)}
    private var readOnly:Bool {list.completedAt != nil}
    var body:some View {
        List {
            Section {
                HStack{shoppingIcon;VStack(alignment:.leading){Text(list.title).font(.title2.bold());Text("\(list.remaining) remaining · \(list.items.count) items").foregroundStyle(.secondary)}}
                    .listRowBackground(Color.clear)
                if !list.items.isEmpty {ProgressView(value:Double(list.items.count-list.remaining),total:Double(list.items.count)).tint(.nexdoIndigo)}
                if !readOnly {
                    HStack{
                        TextField("Add an item",text:$quick).submitLabel(.done).onSubmit{quickAdd()}
                        Button{quickAdd()}label:{Image(systemName:"plus.circle.fill").frame(width:44,height:44)}.buttonStyle(.borderless).disabled(quick.isEmpty || parseBusy).accessibilityLabel("Add typed items")
                        Button{voice=true}label:{Image(systemName:"mic.fill").frame(width:44,height:44)}.buttonStyle(.borderless).accessibilityLabel("Add groceries by voice")
                    }
                    if !quick.isEmpty {
                        let suggestions=["Bananas","Apples","Tomatoes","Cherry Tomatoes","Spinach","Milk","Eggs","Cheese","Bread","Rice","Pasta","Coffee","Paper towels"].filter{$0.localizedCaseInsensitiveContains(quick)}
                        ForEach(suggestions.prefix(3),id:\.self){name in Button(name){quick=name;quickAdd()}.font(.subheadline)}
                    }
                    if quick.isEmpty {Text("Try “2 bottles of milk 1 gallon” or tap the mic.").font(.caption).foregroundStyle(.secondary)}
                }
            }
            ForEach(GroceryItem.categories,id:\.self){category in
                let rows=list.items.filter{$0.category==category}
                if !rows.isEmpty{
                    Section(category){
                        ForEach(rows){row in
                            GroceryRow(row:row,readOnly:readOnly,onToggle:{toggle(row)},onEdit:{item=row})
                                .swipeActions{if !readOnly{Button("Delete",role:.destructive){var next=list;next.items.removeAll{$0.id==row.id};save(next)}}}
                        }.onMove{from,to in move(category:category,from:from,to:to)}
                        if !readOnly {Button{item=GroceryItem(category:category)}label:{Label("Add item",systemImage:"plus")}}
                    }
                }
            }
            if list.items.isEmpty {ContentUnavailableView("Nothing on the list yet",systemImage:"basket",description:Text("Add items above or dictate a few groceries."))}
            if let message=error ?? store.error {Text(message).foregroundStyle(.red);Button("Retry Save"){save(list)}.disabled(readOnly);Button("Discard local edits and reload"){Task{await store.refresh();if let current=store.lists.first(where:{$0.id==list.id}){list=current;error=nil}}}}
            if !readOnly {Button("Complete Shopping Trip"){completing=true}.font(.headline)}else{Button("Use This List Again"){copy=true}}
        }.scrollContentBackground(.hidden).background{TodayBackdrop()}
            .navigationTitle("Shopping List").navigationBarTitleDisplayMode(.inline)
            .disabled(store.busy)
            .toolbar{
                ToolbarItem(placement:.topBarTrailing){Button{sharing=true}label:{Image(systemName:"square.and.arrow.up")}.accessibilityLabel("Share list")}
                ToolbarItem(placement:.topBarTrailing){Menu{
                    Button("List settings"){settings=true}.disabled(readOnly)
                    Button("Copy list"){copy=true}
                    if !readOnly {EditButton();Button("Uncheck all"){var next=list;next.items=next.items.map{var i=$0;i.checked=false;return i};save(next)}}
                    Button("Delete list",role:.destructive){deleting=true}
                }label:{Image(systemName:"ellipsis")}.accessibilityLabel("List options")}
            }
            .sheet(item:$item){value in ShoppingItemEditor(store:store,initial:value){updated in var next=list;if let index=next.items.firstIndex(where:{$0.id==updated.id}){next.items[index]=updated}else{next.items.append(updated)};save(next)}}
            .sheet(isPresented:$voice){ShoppingVoiceView(store:store){items in var next=list;next.items.append(contentsOf:items);save(next)}}
            .sheet(isPresented:$pendingReview){ShoppingBatchReview(items:pending){values in var next=list;next.items.append(contentsOf:values);save(next)}}
            .sheet(isPresented:$copy){NewShoppingList(store:store,source:list){list=$0}}
            .sheet(isPresented:$settings){ShoppingSettings(initial:list){save($0)}}
            .sheet(isPresented:$sharing){ShoppingShare(store:store,list:list){list=$0}}
            .confirmationDialog("Delete this list?",isPresented:$deleting,titleVisibility:.visible){Button("Delete list",role:.destructive){Task{_ = await store.action("delete",list:list,input:[String:String]());if store.error==nil{dismiss()}}}}
            .confirmationDialog(list.weekly ? "Complete this trip and create next week’s list?":"Complete this shopping trip?",isPresented:$completing,titleVisibility:.visible){
                Button("Complete trip"){Task{if let next=await store.action("complete",list:list,input:[String:String]()){list=next}}}
            }message:{Text("\(list.remaining) items are unchecked. Your shopping history will be kept.")}
    }
    private func toggleItem(_ item: GroceryItem) {
        var next = list
        guard let index = next.items.firstIndex(where: { $0.id == item.id }) else { return }
        next.items[index].checked.toggle()
        save(next)
    }
    private func toggle(_ row:GroceryItem) {
        var next=list
        if let index=next.items.firstIndex(where:{$0.id==row.id}){next.items[index].checked.toggle()}
        save(next)
    }
    private func save(_ next:GroceryList){let original=list;list=next;Task{if let saved=await store.action("save",list:original,input:ShoppingInput(next)){list=saved;error=nil}}}
    private func quickAdd(){guard !quick.isEmpty else{return};parseBusy=true;Task{do{pending=try await store.parse(quick);pendingReview=true;quick=""}catch{self.error=error.localizedDescription};parseBusy=false}}
    private func move(category:String,from:IndexSet,to:Int){var rows=list.items.filter{$0.category==category};rows.move(fromOffsets:from,toOffset:to);var next=list;var index=0;next.items=next.items.map{if $0.category==category{defer{index+=1};return rows[index]};return $0};save(next)}
}
private struct ShoppingBatchReview:View {
    @Environment(\.dismiss) private var dismiss
    @State var items:[GroceryItem]
    let onAdd:([GroceryItem])->Void
    var body:some View{NavigationStack{List{
        ForEach($items){$item in VStack(alignment:.leading){TextField("Item",text:$item.name);HStack{TextField("Quantity",text:$item.quantity);TextField("Size",text:$item.size)}}}.onDelete{items.remove(atOffsets:$0)}
        Button("Add \(items.count) Items"){onAdd(items);dismiss()}.disabled(items.isEmpty || items.contains{$0.name.trimmingCharacters(in:.whitespaces).isEmpty})
    }.navigationTitle("Review Items").toolbar{Button("Cancel"){dismiss()}}}}
}
private struct ShoppingSettings:View {
    @Environment(\.dismiss) private var dismiss
    @State var initial:GroceryList
    let onSave:(GroceryList)->Void
    var body:some View{NavigationStack{Form{
        TextField("List name",text:$initial.title)
        DatePicker("Shopping date",selection:Binding(get:{MomentDates.date(initial.date,zone:initial.timeZone)},set:{initial.date=MomentDates.day($0,zone:initial.timeZone)}),displayedComponents:.date)
        Toggle("Repeat weekly",isOn:$initial.weekly)
        Text("Next week’s list is created when you complete this trip.")
    }.navigationTitle("List Settings").toolbar{Button("Save"){onSave(initial);dismiss()}.disabled(initial.title.trimmingCharacters(in:.whitespaces).isEmpty)}}}
}
private struct ShoppingShare:View {
    @ObservedObject var store:ShoppingStore
    @State var list:GroceryList
    let onUpdate:(GroceryList)->Void
    @State private var url:URL?
    var body:some View{NavigationStack{List{
        Section{Label(list.title,systemImage:"cart.fill");Text("\(list.items.count) items")}
        Section("Share via Messages, Mail, or another app"){ShareLink(item:list.shareText){Label("Share list as text",systemImage:"square.and.arrow.up")}}
        Section("View-only link"){
            Text("Anyone with the link can view this list and its edits. The link stays with this trip; next week’s list needs a new link. Revoke it whenever you like.").font(.caption)
            if let url {ShareLink(item:url){Label("Share Link",systemImage:"link")};Button("Revoke Link",role:.destructive){Task{if let saved=await store.action("revoke",list:list,input:[String:String]()){list=saved;self.url=nil;onUpdate(saved)}}}}
            else{Button("Create Share Link"){Task{if let saved=await store.action("share",list:list,input:[String:String]()){list=saved;onUpdate(saved);updateURL()}}}}
        }
        if let error=store.error{Text(error).foregroundStyle(.red)}
    }.navigationTitle("Share List").task{updateURL()}}}
    private func updateURL(){if let token=list.shareToken{url=store.api.baseURL.appendingPathComponent("shared/shopping/"+token)}}
}


private struct GroceryRow:View {
    let row:GroceryItem
    let readOnly:Bool
    let onToggle:()->Void
    let onEdit:()->Void
    var body:some View {
        HStack(spacing:12) {
            Button(action:onToggle){
                Image(systemName:row.checked ? "checkmark.circle.fill":"circle")
                    .font(.title2).foregroundStyle(row.checked ? Color.green:Color.nexdoIndigo)
            }.buttonStyle(.plain).disabled(readOnly)
                .accessibilityLabel(row.checked ? "Uncheck "+row.name:"Check "+row.name)
            Button(action:onEdit){
                HStack {
                    GroceryArtwork(item:row)
                    VStack(alignment:.leading){
                        Text(row.name).strikethrough(row.checked)
                        if !row.notes.isEmpty{Text(row.notes).font(.caption).foregroundStyle(.secondary)}
                    }
                    Spacer()
                    Text(row.amountLabel)
                        .font(.subheadline).foregroundStyle(.secondary)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).disabled(readOnly).accessibilityLabel("Edit "+row.name)
        }
    }
}

/// Keep grocery artwork in its original colors, independent of button tint.
private struct GroceryArtwork:View {
    let item:GroceryItem
    private var words:Set<String> {Set(item.name.lowercased().split{!$0.isLetter}.map(String.init))}
    private var asset:String? {
        if !words.isDisjoint(with:["onion","onions"]){return "grocery-onion"}
        if words.contains("milk"){return "grocery-milk"}
        if !words.isDisjoint(with:["banana","bananas"]){return "grocery-banana"}
        if !words.isDisjoint(with:["tomato","tomatoes"]){return "grocery-tomato"}
        if !words.isDisjoint(with:["egg","eggs"]){return "grocery-eggs"}
        return nil
    }
    private var fallback:String {
        let items:[(Set<String>,String)]=[
            (["apple","apples"],"🍎"),(["spinach","lettuce","kale"],"🥬"),
            (["carrot","carrots"],"🥕"),(["potato","potatoes"],"🥔"),
            (["avocado","avocados"],"🥑"),(["cheese"],"🧀"),(["bread"],"🍞"),
            (["rice"],"🍚"),(["pasta","spaghetti"],"🍝"),(["chicken"],"🍗"),
            (["fish","salmon"],"🐟"),(["coffee"],"☕️"),(["soap"],"🧼")]
        if let match=items.first(where:{!words.isDisjoint(with:$0.0)}){return match.1}
        switch item.category {
        case "Produce":return "🥬"
        case "Dairy & Eggs":return "🥛"
        case "Meat & Seafood":return "🥩"
        case "Bakery":return "🥐"
        case "Pantry":return "🫙"
        case "Frozen":return "🧊"
        case "Drinks":return "🧃"
        case "Household":return "🧺"
        default:return "🛍️"
        }
    }
    var body:some View {
        Group {
            if let encoded=item.imageData,let data=Data(base64Encoded:encoded),let photo=UIImage(data:data){Image(uiImage:photo).resizable().scaledToFill().frame(width:40,height:44).clipShape(RoundedRectangle(cornerRadius:8))}
            else if let asset {Image(asset).renderingMode(.original).resizable().scaledToFit()}
            else {Text(fallback).font(.system(size:29))}
        }.frame(width:40,height:44).accessibilityHidden(true)
    }
}
