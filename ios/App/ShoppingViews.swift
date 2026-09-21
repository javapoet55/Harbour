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
        Text("\(list.weekly ? "Every week":"Shopping list") · \(GroceryList.itemCount(list.items.count))").font(.subheadline).foregroundStyle(.secondary)
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
                                            Text(GroceryList.itemCount(list.items.count) + (list.completedAt == nil ? "" : " · Completed")).font(.caption).foregroundStyle(Color.nexdoSecondary)
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
                        choice("Use Last Week’s List", subtitle: previous.map { "Copy \(GroceryList.itemCount($0.items.count)) from “\($0.title)” and edit." } ?? "Create your first list to reuse it next time.", symbol: "arrow.counterclockwise", selected: useLast) { useLast = true }
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
    @State private var completion:ShoppingCompletionSummary?
    @State private var recommendations=false
    @State private var alternativesFor:GroceryItem?
    @State private var parseBusy=false
    @State private var error:String?
    @State private var selectedCategory="All"
    @FocusState private var quickAddFocused:Bool
    init(store:ShoppingStore,initial:GroceryList){self.store=store;_list=State(initialValue:initial)}
    private var readOnly:Bool {list.completedAt != nil}
    private var visibleCategories:[String] {GroceryItem.categories.filter{category in list.items.contains{$0.category==category}}}
    private var visibleItems:[GroceryItem] {selectedCategory == "All" ? list.items:list.items.filter{$0.category==selectedCategory}}
    var body:some View {
        List {
            Section {
                HStack{shoppingIcon;VStack(alignment:.leading){Text(list.title).font(.title2.bold());Text("\(list.items.count-list.remaining) added · \(GroceryList.itemCount(list.items.count))").foregroundStyle(.secondary)}}
                    .listRowInsets(EdgeInsets(top:0,leading:16,bottom:3,trailing:16)).listRowBackground(Color.clear).listRowSeparator(.hidden)
                HStack(spacing:8){
                        Button{
                            if quick.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {quickAddFocused=true}else{quickAdd()}
                        }label:{
                            Image(systemName:"plus")
                                .font(.headline.weight(.bold)).foregroundStyle(Color.nexdoBlue)
                                .frame(width:36,height:36).background(Color.nexdoBlue.opacity(0.11),in:Circle())
                        }.buttonStyle(.borderless).disabled(parseBusy).accessibilityLabel(quick.isEmpty ? "Focus add item field" : "Add typed items")
                        TextField("Add an item (e.g. eggs, milk, bread)",text:$quick)
                            .focused($quickAddFocused).submitLabel(.done).onSubmit{quickAdd()}
                            .font(.subheadline).foregroundStyle(Color.nexdoInk)
                            .accessibilityIdentifier("shopping-quick-add")
                        Button{voice=true}label:{
                            Image(systemName:"mic.fill").font(.headline).foregroundStyle(Color.nexdoSecondary)
                                .frame(width:40,height:40)
                        }.buttonStyle(.borderless).accessibilityLabel("Add groceries by voice")
                    }
                    .padding(.horizontal,10).padding(.vertical,6).frame(minHeight:54)
                    .background(Color(uiColor:.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:18,style:.continuous))
                    .overlay(RoundedRectangle(cornerRadius:18,style:.continuous).stroke(Color.nexdoIndigo.opacity(0.10),lineWidth:1))
                    .shadow(color:Color.nexdoInk.opacity(0.07),radius:8,y:3)
                    .listRowInsets(EdgeInsets(top:3,leading:16,bottom:5,trailing:16)).listRowBackground(Color.clear).listRowSeparator(.hidden)
                if !quick.isEmpty {
                    let suggestions=["Bananas","Apples","Tomatoes","Cherry Tomatoes","Spinach","Milk","Eggs","Cheese","Bread","Rice","Pasta","Coffee","Paper towels"].filter{$0.localizedCaseInsensitiveContains(quick)}
                    ForEach(suggestions.prefix(3),id:\.self){name in Button(name){quick=name;quickAdd()}.font(.subheadline)}
                }
                if !list.items.isEmpty {
                    ScrollView(.horizontal,showsIndicators:false){
                        HStack(spacing:8){
                            categoryChip("All",count:list.items.count)
                            ForEach(visibleCategories,id:\.self){category in categoryChip(category,count:list.items.filter{$0.category==category}.count)}
                        }.padding(.vertical,2)
                    }
                    .listRowInsets(EdgeInsets(top:4,leading:16,bottom:2,trailing:0)).listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
            }
            if !list.items.isEmpty {
                Section {
                    ForEach(visibleItems){row in
                        GroceryRow(row:row,readOnly:false,onToggle:{toggle(row)},onEdit:{item=row},onAlternatives:{alternativesFor=row})
                            .swipeActions{Button("Delete",role:.destructive){delete(row)}}
                    }
                }
            }
            if list.items.isEmpty {ContentUnavailableView("Nothing on the list yet",systemImage:"basket",description:Text("Add items above or dictate a few groceries."))}
            if let message=error ?? store.error {Text(message).foregroundStyle(.red);Button("Retry Save"){save(list)}.disabled(readOnly);Button("Discard local edits and reload"){Task{await store.refresh();if let current=store.lists.first(where:{$0.id==list.id}){list=current;error=nil}}}}
        }.listSectionSpacing(10).contentMargins(.top,4,for:.scrollContent).scrollContentBackground(.hidden).background{TodayBackdrop()}
            .navigationTitle("Shopping List").navigationBarTitleDisplayMode(.inline)
            .disabled(store.busy)
            .safeAreaInset(edge:.bottom,spacing:0){shoppingActions}
            .toolbar{
                ToolbarItem(placement:.topBarTrailing){Button{sharing=true}label:{Image(systemName:"square.and.arrow.up")}.accessibilityLabel("Share list")}
                ToolbarItem(placement:.topBarTrailing){Menu{
                    Button("List settings"){settings=true}.disabled(readOnly)
                    Button("Copy list"){copy=true}
                    if !readOnly {Button("Uncheck all"){var next=list;next.items=next.items.map{var i=$0;i.checked=false;return i};save(next)}}
                    Button("Delete list",role:.destructive){deleting=true}
                }label:{Image(systemName:"ellipsis")}.accessibilityLabel("List options")}
            }
            .sheet(item:$item){value in ShoppingItemEditor(store:store,initial:value){updated in var next=list;if let index=next.items.firstIndex(where:{$0.id==updated.id}){next.items[index]=updated}else{next.items.append(updated)};save(next)}}
            .sheet(isPresented:$voice){ShoppingVoiceView(store:store){items in var next=list;next.items.append(contentsOf:items);save(next)}}
            .sheet(isPresented:$copy){NewShoppingList(store:store,source:list){list=$0}}
            .sheet(isPresented:$settings){ShoppingSettings(initial:list){save($0)}}
            .sheet(isPresented:$sharing){ShoppingShare(store:store,list:list){list=$0}}
            .sheet(isPresented:$recommendations){AskNexdoView(textPage:true,shoppingContext:ShoppingRecommendationContext(listName:list.title,itemNames:list.items.map(\.name)))}
            .sheet(item:$alternativesFor){original in
                ShoppingAlternativesView(store:store,original:original,onReplace:{alternative in replace(original,with:alternative)},onAdd:{alternative in add(alternative)})
                    .presentationDetents([.large]).presentationDragIndicator(.visible)
            }
            .fullScreenCover(item:$completion){summary in
                ShoppingCompletionView(summary:summary,onDone:{completion=nil;dismiss()},onUseAgain:{completion=nil;if list.completedAt != nil{copy=true}})
            }
            .confirmationDialog("Delete this list?",isPresented:$deleting,titleVisibility:.visible){Button("Delete list",role:.destructive){Task{_ = await store.action("delete",list:list,input:[String:String]());if store.error==nil{dismiss()}}}}
            .confirmationDialog("Complete with \(GroceryList.itemCount(list.remaining)) remaining?",isPresented:$completing,titleVisibility:.visible){
                Button("Complete Shopping"){Task{await completeTrip()}}
            }message:{Text("The unchecked items will remain in your shopping history.")}
    }
    private var shoppingActions:some View {
        HStack(spacing:10){
            Button{if list.remaining > 0{completing=true}else{Task{await completeTrip()}}}label:{
                Label("Complete Shopping",systemImage:"checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold)).lineLimit(2).minimumScaleFactor(0.78)
                    .foregroundStyle(Color.white).frame(maxWidth:.infinity,minHeight:52)
                    .background(NexdoTheme.gradient,in:RoundedRectangle(cornerRadius:17,style:.continuous))
            }.buttonStyle(.plain).disabled(store.busy)
                .accessibilityIdentifier("shopping-complete-trip")
            Button{recommendations=true}label:{
                Label("AI Powered Recommendations",systemImage:"sparkles")
                    .font(.subheadline.weight(.semibold)).lineLimit(2).minimumScaleFactor(0.78)
                    .foregroundStyle(Color.nexdoIndigo).frame(maxWidth:.infinity,minHeight:52)
                    .background(Color(uiColor:.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:17,style:.continuous))
                    .overlay(RoundedRectangle(cornerRadius:17,style:.continuous).stroke(Color.nexdoIndigo.opacity(0.22),lineWidth:1))
            }.buttonStyle(.plain).disabled(store.busy)
                .accessibilityIdentifier("shopping-ai-recommendations")
        }.padding(.horizontal,16).padding(.vertical,10)
            .background(.ultraThinMaterial).overlay(alignment:.top){Divider().opacity(0.5)}
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
    private func delete(_ row:GroceryItem){var next=list;next.items.removeAll{$0.id==row.id};if selectedCategory != "All" && !next.items.contains(where:{$0.category==selectedCategory}){selectedCategory="All"};save(next)}
    private func replace(_ original:GroceryItem,with alternative:ShoppingAlternative){
        var next=list
        guard let index=next.items.firstIndex(where:{$0.id==original.id}) else{return}
        var replacement=alternative.groceryItem
        replacement.id=original.id;replacement.checked=original.checked
        next.items[index]=replacement
        save(next)
    }
    private func add(_ alternative:ShoppingAlternative){var next=list;next.items.append(alternative.groceryItem);save(next)}
    @MainActor private func completeTrip() async {
        let finished=list
        guard let next=await store.action("complete",list:finished,input:[String:String]()) else{return}
        list=next
        completion=ShoppingCompletionSummary(
            listName:finished.title,
            purchased:finished.items.count-finished.remaining,
            total:finished.items.count,
            remaining:finished.remaining,
            nextListReady:next.completedAt == nil
        )
    }
    private func save(_ next:GroceryList){
        let original=list;list=next
        Task{
            if original.completedAt != nil {
                var working=next;working.id=UUID().uuidString;working.completedAt=nil;working.revision=0
                if let saved=await store.action("create",input:ShoppingInput(working),idempotencyKey:working.id){list=saved;error=nil}
            } else if let saved=await store.action("save",list:original,input:ShoppingInput(next)){list=saved;error=nil}
        }
    }
    private func quickAdd(){
        let value=quick.trimmingCharacters(in:.whitespacesAndNewlines)
        guard !value.isEmpty else{return}
        parseBusy=true;error=nil
        Task{
            defer{parseBusy=false}
            do{
                let items=try await store.parse(value).filter{!$0.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}
                guard !items.isEmpty else{error="No items found. Type an item and try again.";return}
                var next=list;next.items.append(contentsOf:items)
                quick="";save(next)
            }catch{self.error=error.localizedDescription}
        }
    }
    @ViewBuilder private func categoryChip(_ category:String,count:Int)->some View {
        let selected=selectedCategory==category
        Button{selectedCategory=category}label:{
            Text("\(categoryLabel(category)) (\(count))").font(.caption.weight(.semibold))
                .foregroundStyle(selected ? Color.white:Color.nexdoSecondary)
                .padding(.horizontal,13).padding(.vertical,8)
                .background(selected ? Color.nexdoBlue:Color.nexdoIndigo.opacity(0.06),in:Capsule())
        }.buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected:[])
    }
    private func categoryLabel(_ category:String)->String {
        switch category {case "Dairy & Eggs":return "Dairy";case "Meat & Seafood":return "Meat";default:return category}
    }
}

private struct ShoppingCompletionSummary:Identifiable {
    let id=UUID()
    let listName:String
    let purchased:Int
    let total:Int
    let remaining:Int
    let nextListReady:Bool
}

private struct ShoppingCompletionView:View {
    let summary:ShoppingCompletionSummary
    let onDone:()->Void
    let onUseAgain:()->Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body:some View {
        ZStack {
            TodayBackdrop()
            Circle().fill(Color.nexdoBlue.opacity(0.08)).frame(width:300,height:300).blur(radius:2).offset(x:-155,y:-310)
            Circle().fill(Color.pink.opacity(0.08)).frame(width:260,height:260).blur(radius:2).offset(x:170,y:-220)
            VStack(spacing:0) {
                Spacer(minLength:44)
                ZStack {
                    Circle().fill(NexdoTheme.gradient).frame(width:132,height:132)
                        .shadow(color:Color.nexdoIndigo.opacity(0.24),radius:24,y:12)
                    Circle().fill(Color.white.opacity(0.94)).frame(width:108,height:108)
                    Circle().stroke(Color.white.opacity(0.42),lineWidth:2).frame(width:116,height:116)
                    Image(systemName:"tree.fill").font(.system(size:52,weight:.semibold)).foregroundStyle(Color.green)
                }
                .accessibilityHidden(true)
                .padding(.bottom,28)

                Text("Great job for saving a branch on a tree!")
                    .font(.system(size:32,weight:.bold,design:.rounded)).foregroundStyle(Color.nexdoInk)
                    .multilineTextAlignment(.center).padding(.horizontal,28)
                Text("Completed").font(.title3.weight(.semibold)).foregroundStyle(Color.nexdoIndigo).padding(.top,10)
                Text(summary.listName).font(.subheadline).foregroundStyle(Color.nexdoSecondary).padding(.top,5)

                HStack(spacing:0) {
                    metric(value:"\(summary.purchased)",label:"Purchased",icon:"checkmark.circle.fill",color:.green)
                    Divider().frame(height:62)
                    metric(value:"\(summary.total)",label:"Total items",icon:"basket.fill",color:.nexdoBlue)
                    if summary.remaining > 0 {
                        Divider().frame(height:62)
                        metric(value:"\(summary.remaining)",label:"Saved",icon:"bookmark.fill",color:.orange)
                    }
                }
                .padding(.vertical,20)
                .background(Color(uiColor:.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:24,style:.continuous))
                .overlay(RoundedRectangle(cornerRadius:24,style:.continuous).stroke(Color.nexdoIndigo.opacity(0.10)))
                .shadow(color:Color.nexdoInk.opacity(0.07),radius:18,y:8)
                .padding(.horizontal,24).padding(.top,30)

                Text(summary.remaining == 0 ? "Everything on your list is taken care of.":"Your unchecked items are safely kept in this list.")
                    .font(.subheadline).foregroundStyle(Color.nexdoSecondary).multilineTextAlignment(.center)
                    .padding(.horizontal,38).padding(.top,18)

                Spacer(minLength:32)

                VStack(spacing:12) {
                    Button(action:onDone){Text("Done").font(.headline).foregroundStyle(.white).frame(maxWidth:.infinity,minHeight:54).background(NexdoTheme.gradient,in:RoundedRectangle(cornerRadius:18,style:.continuous))}
                        .buttonStyle(.plain).accessibilityIdentifier("shopping-completion-done")
                    Button(action:onUseAgain){Label(summary.nextListReady ? "View Next Shopping List":"Use This List Again",systemImage:"arrow.counterclockwise").font(.headline).foregroundStyle(Color.nexdoIndigo).frame(maxWidth:.infinity,minHeight:54).background(Color(uiColor:.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:18,style:.continuous)).overlay(RoundedRectangle(cornerRadius:18,style:.continuous).stroke(Color.nexdoIndigo.opacity(0.18)))}
                        .buttonStyle(.plain).accessibilityIdentifier("shopping-completion-use-again")
                }.padding(.horizontal,24).padding(.bottom,28)
            }
            if !reduceMotion {MomentConfetti()}
        }
        .ignoresSafeArea(edges:.bottom)
    }

    private func metric(value:String,label:String,icon:String,color:Color)->some View {
        VStack(spacing:5) {
            Image(systemName:icon).font(.headline).foregroundStyle(color)
            Text(value).font(.title2.bold()).foregroundStyle(Color.nexdoInk)
            Text(label).font(.caption).foregroundStyle(Color.nexdoSecondary).lineLimit(1).minimumScaleFactor(0.75)
        }.frame(maxWidth:.infinity)
    }
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
        Section{Label(list.title,systemImage:"cart.fill");Text(GroceryList.itemCount(list.items.count))}
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

private struct ShoppingAlternativesView:View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store:ShoppingStore
    let original:GroceryItem
    let onReplace:(ShoppingAlternative)->Void
    let onAdd:(ShoppingAlternative)->Void
    @State private var result:ShoppingAlternativesResponse?
    @State private var selectedID:String?
    @State private var loading=true
    @State private var error:String?
    private var selected:ShoppingAlternative? {result?.alternatives.first{$0.id==selectedID}}
    var body:some View {
        NavigationStack {
            Group {
                if loading {ProgressView("Finding useful alternatives…").frame(maxWidth:.infinity,maxHeight:.infinity)}
                else if let error {
                    ContentUnavailableView("Couldn’t load alternatives",systemImage:"wifi.exclamationmark",description:Text(error))
                        .overlay(alignment:.bottom){Button("Try Again"){Task{await load()}}.buttonStyle(.borderedProminent).tint(.nexdoBlue).padding(.bottom,34)}
                } else if let result {
                    ScrollView {
                        VStack(alignment:.leading,spacing:18){
                            originalCard
                            VStack(alignment:.leading,spacing:3){
                                Text("AI Recommended Alternatives").font(.title3.bold()).foregroundStyle(Color.nexdoInk)
                                Text("Practical swaps based on the item in your list.").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                            }
                            VStack(spacing:0){
                                ForEach(Array(result.alternatives.enumerated()),id:\.element.id){index,alternative in
                                    alternativeRow(alternative)
                                    if index < result.alternatives.count-1 {Divider().padding(.leading,70)}
                                }
                            }
                            .background(Color(uiColor:.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:20,style:.continuous))
                            .overlay(RoundedRectangle(cornerRadius:20,style:.continuous).stroke(Color.nexdoIndigo.opacity(0.10),lineWidth:1))
                            HStack(alignment:.top,spacing:10){
                                Image(systemName:"sparkles").font(.title2).foregroundStyle(Color.nexdoBlue)
                                VStack(alignment:.leading,spacing:3){Text("Nexdo Tip").font(.subheadline.bold()).foregroundStyle(Color.nexdoBlue);Text(result.tip).font(.subheadline).foregroundStyle(Color.nexdoSecondary)}
                            }.padding(16).frame(maxWidth:.infinity,alignment:.leading)
                                .background(Color.nexdoBlue.opacity(0.08),in:RoundedRectangle(cornerRadius:18,style:.continuous))
                        }.padding(.horizontal,18).padding(.top,12).padding(.bottom,116)
                    }.background{TodayBackdrop()}
                        .safeAreaInset(edge:.bottom,spacing:0){actionBar}
                }
            }
            .navigationTitle("Item Alternatives").navigationBarTitleDisplayMode(.inline)
            .toolbar{ToolbarItem(placement:.topBarTrailing){Button{dismiss()}label:{Image(systemName:"xmark").font(.headline)}.accessibilityLabel("Close alternatives")}}
        }.task{if result==nil{await load()}}
    }
    private var originalCard:some View {
        HStack(spacing:13){
            GroceryArtwork(item:original).frame(width:56,height:58)
            VStack(alignment:.leading,spacing:4){
                Text(original.name).font(.headline).foregroundStyle(Color.nexdoInk)
                Text(original.amountLabel).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                Text("Original Item").font(.caption.weight(.semibold)).foregroundStyle(Color.nexdoBlue).padding(.horizontal,10).padding(.vertical,5).background(Color.nexdoBlue.opacity(0.09),in:Capsule())
            }
            Spacer()
            Image(systemName:"star.fill").font(.title2).foregroundStyle(Color.nexdoBlue).accessibilityHidden(true)
        }.padding(15).background(Color(uiColor:.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:20,style:.continuous))
            .overlay(RoundedRectangle(cornerRadius:20,style:.continuous).stroke(Color.nexdoIndigo.opacity(0.10),lineWidth:1))
    }
    private func alternativeRow(_ alternative:ShoppingAlternative)->some View {
        let isSelected=selectedID==alternative.id
        return Button{selectedID=alternative.id}label:{
            HStack(spacing:11){
                GroceryArtwork(item:alternative.groceryItem)
                VStack(alignment:.leading,spacing:3){
                    Text(alternative.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.nexdoInk)
                    Label(alternative.reason,systemImage:"leaf.fill").font(.caption).foregroundStyle(Color.green)
                    Text(alternative.detail).font(.caption).foregroundStyle(Color.nexdoSecondary).lineLimit(2)
                }
                Spacer(minLength:4)
                Text(isSelected ? "Selected":"Replace").font(.caption.weight(.bold)).foregroundStyle(isSelected ? Color.white:Color.nexdoBlue)
                    .padding(.horizontal,12).padding(.vertical,8).background(isSelected ? Color.nexdoBlue:Color.clear,in:Capsule())
                    .overlay(Capsule().stroke(Color.nexdoBlue.opacity(isSelected ? 0:0.28),lineWidth:1))
            }.padding(.horizontal,14).padding(.vertical,11).contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityLabel("Select \(alternative.name) as replacement").accessibilityAddTraits(isSelected ? .isSelected:[])
    }
    private var actionBar:some View {
        VStack(spacing:7){
            Button{
                guard let selected else{return};onReplace(selected);dismiss()
            }label:{Text("Replace with Selected Item").font(.headline).foregroundStyle(.white).frame(maxWidth:.infinity,minHeight:50).background(NexdoTheme.gradient,in:RoundedRectangle(cornerRadius:16,style:.continuous))}
                .buttonStyle(.plain).disabled(selected==nil).opacity(selected==nil ? 0.5:1)
            Button{
                guard let selected else{return};onAdd(selected);dismiss()
            }label:{Text("Add to Cart Instead").font(.subheadline.weight(.semibold)).foregroundStyle(Color.nexdoBlue).frame(maxWidth:.infinity,minHeight:34)}
                .buttonStyle(.plain).disabled(selected==nil)
        }.padding(.horizontal,18).padding(.top,10).padding(.bottom,8).background(.ultraThinMaterial).overlay(alignment:.top){Divider().opacity(0.45)}
    }
    @MainActor private func load() async {
        loading=true;error=nil
        do {
            let response=try await store.alternatives(for:original)
            result=response;selectedID=response.alternatives.first?.id
        } catch {self.error=error.localizedDescription}
        loading=false
    }
}


private struct GroceryRow:View {
    let row:GroceryItem
    let readOnly:Bool
    let onToggle:()->Void
    let onEdit:()->Void
    let onAlternatives:()->Void
    var body:some View {
        HStack(spacing:11) {
            Button(action:onToggle){
                Image(systemName:row.checked ? "checkmark.square.fill":"square")
                    .font(.title3).foregroundStyle(row.checked ? Color.nexdoBlue:Color.nexdoSecondary.opacity(0.65))
            }.buttonStyle(.plain).disabled(readOnly)
                .accessibilityLabel(row.checked ? "Uncheck "+row.name:"Check "+row.name)
            Button(action:onEdit){
                HStack(spacing:11) {
                    GroceryArtwork(item:row)
                    VStack(alignment:.leading,spacing:3){
                        Text(row.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.nexdoInk).strikethrough(row.checked)
                        Text(row.amountLabel).font(.caption).foregroundStyle(Color.nexdoSecondary)
                        if !row.notes.isEmpty{Text(row.notes).font(.caption2).foregroundStyle(.secondary).lineLimit(1)}
                    }
                    Spacer(minLength:4)
                }
                .frame(maxWidth:.infinity,alignment:.leading)
                .contentShape(Rectangle())
            }.buttonStyle(.plain).disabled(readOnly).accessibilityLabel("Edit "+row.name)
            Button(action:onAlternatives){Image(systemName:"star.fill").font(.body.weight(.semibold)).foregroundStyle(Color.nexdoBlue).frame(width:38,height:38)}
                .buttonStyle(.plain).disabled(readOnly).accessibilityLabel("Show alternatives for \(row.name)")
        }.padding(.vertical,5)
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
