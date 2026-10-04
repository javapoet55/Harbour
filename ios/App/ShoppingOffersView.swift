import SwiftUI

struct StoreOffer:Decodable,Identifiable {
    let id:String,product:String,conditions:String,sourceURL:String,startsAt:String,expiresAt:String,checkedAt:String,store:String
    let brand:String?,packageSize:String?,price:String?,savings:String?,unitPrice:String?,imageURL:String?
}
struct ShoppingOfferMatch:Decodable,Identifiable {
    let itemId:String,itemName:String,category:String
    let reasons:[String],differences:[String]
    let offer:StoreOffer
    let selected:Bool
    var id:String {itemId+offer.id}
}
struct ShoppingOffersSnapshot:Decodable {
    let matches:[ShoppingOfferMatch]
    let status:String
    let lastCheckedAt:String?,sourceURL:String?
    static func badge(_ matches:[ShoppingOfferMatch]?,selected:ChosenShoppingOffer?) -> String {
        if let selected {return "Chosen: \(selected.product)"}
        guard let matches else{return "View offers"}
        guard !matches.isEmpty else{return "No verified offers"}
        let kinds=Set(matches.map(\.category))
        let name=kinds.count == 1 ? (kinds.first == "alternative" ? "alternative" : kinds.first!) : "available"
        return "\(matches.count) \(name) offer\(matches.count == 1 ? "":"s")"
    }
}
struct ShoppingOffersView:View {
    @ObservedObject var store:ShoppingStore
    @State var list:GroceryList
    var itemId:String?=nil
    let onUpdate:(GroceryList)->Void
    @State private var snapshot:ShoppingOffersSnapshot?
    @State private var error:String?
    @State private var category="matching"
    @State private var storeFilter="All stores"
    @State private var settings=false
    private let tabs=[("matching","Matching"),("available","Available"),("alternative","Alternatives")]
    private var matches:[ShoppingOfferMatch] {snapshot?.matches.filter{itemId == nil || $0.itemId == itemId} ?? []}
    private var visible:[ShoppingOfferMatch] {matches.filter{$0.category==category && (storeFilter=="All stores" || $0.offer.store==storeFilter)}}
    var body:some View {
        ScrollView {
            VStack(alignment:.leading,spacing:16) {
                Text(itemId.flatMap{id in list.items.first{$0.id==id}?.name} ?? list.title).font(.title3).foregroundStyle(Color.nexdoSecondary)
                ScrollView(.horizontal,showsIndicators:false){HStack {ForEach(tabs,id:\.0){key,title in
                    Button("\(title) (\(matches.filter{$0.category==key}.count))"){category=key}
                        .font(.subheadline.weight(.semibold)).padding(12)
                        .foregroundStyle(category==key ? Color.white:Color.nexdoIndigo)
                        .background(category==key ? Color.nexdoBlue:Color.nexdoIndigo.opacity(0.08),in:Capsule())
                }}}
                Picker("Store",selection:$storeFilter){Text("All stores").tag("All stores");ForEach(Array(Set(matches.map{$0.offer.store})).sorted(),id:\.self){Text($0).tag($0)}}.pickerStyle(.menu)
                if let error {Text(error).foregroundStyle(.red);Button("Retry"){Task{await load()}}}
                if snapshot == nil && error == nil {ProgressView("Checking saved offers…")}
                ForEach(visible){match in
                    NavigationLink {
                        ShoppingOfferDetail(store:store,list:list,match:match){updated in list=updated;onUpdate(updated);Task{await load()}}
                    } label: {OfferPanel {OfferSummary(offer:match.offer);Text(match.itemName).font(.caption).foregroundStyle(Color.nexdoSecondary);Text(match.differences.first ?? match.reasons.joined(separator:" · ")).font(.subheadline).foregroundStyle(Color.nexdoBlue);if match.selected{Label("Chosen for this item",systemImage:"checkmark.circle.fill").foregroundStyle(.green)}}}.buttonStyle(.plain)
                }
                if let snapshot, visible.isEmpty {OfferPanel {
                    if matches.isEmpty {Label("No offers for \(itemId == nil ? "this list":"this item") yet",systemImage:"tag");Text(snapshot.status).font(.subheadline).foregroundStyle(.secondary)}
                    else {Label("No \(tabs.first{$0.0==category}!.1.lowercased()) offers",systemImage:"tag");Text("Try another category, or check your store settings. New offers appear after the daily source check.").font(.subheadline).foregroundStyle(.secondary)}
                }}
                ForEach(list.items.filter{(itemId==nil || $0.id==itemId) && $0.chosenOffer != nil}) {item in
                    OfferPanel {
                        Text("Chosen for \(item.name)").font(.headline)
                        Text("\(item.chosenOffer!.product) · \(item.chosenOffer!.packageSize ?? "Size not specified") · \(item.chosenOffer!.store)")
                        if !matches.contains(where:{$0.itemId==item.id && $0.offer.id==item.chosenOffer!.id}) {Text("This selection is no longer a current verified offer. Choose a new offer or remove it.").font(.caption).foregroundStyle(.secondary)}
                        Button("Remove selection",role:.destructive){Task{await remove(item)}}.disabled(store.busy || list.completedAt != nil)
                    }
                }
                OfferPanel {
                    Text("How offers are labeled").font(.headline)
                    Text("Matching — Your brand and stated preferences\nAvailable — Product match; no brand specified\nAlternatives — Different or unconfirmed preferences").font(.subheadline)
                    Text(snapshot?.status ?? "").font(.caption).foregroundStyle(.secondary)
                    if let checked=snapshot?.lastCheckedAt {Text("Last checked: \(offerDate(checked))").font(.caption)}
                    if let url=snapshot?.sourceURL.flatMap(URL.init(string:)){Link("View store source ↗",destination:url)}
                }
                Button{settings=true}label:{Label("Manage stores",systemImage:"storefront").frame(maxWidth:.infinity).padding()}.buttonStyle(.bordered)
            }.padding(18)
        }.background{TodayBackdrop()}.navigationTitle(itemId==nil ? "Offers for your list":"Item offers").navigationBarTitleDisplayMode(.inline)
            .task{await load()}.refreshable{await load()}
            .sheet(isPresented:$settings){ShoppingSettings(store:store,initial:list){next in Task{if let saved=await store.action("save",list:list,input:ShoppingInput(next)){list=saved;onUpdate(saved);await load()}else{error=store.error}}}}
    }
    private func load() async {
        do {
            let result:ShoppingOffersSnapshot=try await store.api.request("/api/shopping/offers?listId=\(list.id)");snapshot=result;error=nil
            // Open on a tab that has offers; most items have no brand, so their offers are under Available.
            if !matches.contains(where:{$0.category==category}),let first=tabs.first(where:{tab in matches.contains{$0.category==tab.0}}) {category=first.0}
        }
        catch {self.error=error.localizedDescription}
    }
    private func remove(_ item:GroceryItem) async {
        do {let updated=try await saveOfferChoice(store:store,list:list,itemId:item.id,offerId:nil);list=updated;onUpdate(updated);await load()}
        catch{self.error=error.localizedDescription}
    }
}
struct ShoppingOfferDetail:View {
    @ObservedObject var store:ShoppingStore
    @State var list:GroceryList
    let match:ShoppingOfferMatch
    let onUpdate:(GroceryList)->Void
    @State private var error:String?
    @State private var saving=false
    private var selected:Bool{list.items.first{$0.id==match.itemId}?.chosenOffer?.id==match.offer.id}
    var body:some View {
        ScrollView {VStack(alignment:.leading,spacing:18){
            OfferPanel {OfferSummary(offer:match.offer);Text("Why this \(match.category == "alternative" ? "is an alternative":"matches")").font(.headline).foregroundStyle(Color.nexdoBlue);ForEach(match.reasons,id:\.self){Label($0,systemImage:"checkmark.circle").font(.subheadline)};ForEach(match.differences,id:\.self){Label($0,systemImage:"info.circle").font(.subheadline)}}
            OfferPanel {
                Label("Valid through \(offerDate(match.offer.expiresAt))",systemImage:"calendar")
                Divider();Text(match.offer.conditions).font(.subheadline)
                if let url=URL(string:match.offer.sourceURL){Divider();Link(destination:url){Label("View store offer ↗",systemImage:"tag")}}
                Divider();Label("Last checked \(offerDate(match.offer.checkedAt))",systemImage:"clock").font(.subheadline)
            }
            if let error {Text(error).foregroundStyle(.red)}
            Button {Task {saving=true;defer{saving=false};do{let updated=try await saveOfferChoice(store:store,list:list,itemId:match.itemId,offerId:selected ? nil:match.offer.id);list=updated;onUpdate(updated);error=nil}catch{self.error=error.localizedDescription}}} label: {
                Text(saving ? "Saving…":selected ? "Remove selection":"Choose this offer").font(.headline).foregroundStyle(.white).frame(maxWidth:.infinity).padding(18).background(NexdoTheme.gradient,in:Capsule())
            }.disabled(saving || list.completedAt != nil)
            Text("Your original item preferences are preserved. The chosen product, package and store are saved with this item.").font(.caption).foregroundStyle(.secondary)
        }.padding(18)}.background{TodayBackdrop()}.navigationTitle("Offer details").navigationBarTitleDisplayMode(.inline)
    }
}
private struct OfferPanel<Content:View>:View {
    @ViewBuilder let content:Content
    var body:some View{VStack(alignment:.leading,spacing:12){content}.frame(maxWidth:.infinity,alignment:.leading).padding(20).background(Color(uiColor:.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:24))}
}
private struct OfferSummary:View {
    let offer:StoreOffer
    var body:some View{HStack(alignment:.top,spacing:16){
        AsyncImage(url:offer.imageURL.flatMap(URL.init(string:))){image in image.resizable().scaledToFit()}placeholder:{Image(systemName:"basket").font(.largeTitle).foregroundStyle(Color.nexdoBlue)}.frame(width:90,height:125).accessibilityHidden(true)
        VStack(alignment:.leading,spacing:8){Text(offer.product).font(.headline);Text("\(offer.store) · \(offer.packageSize ?? "Size not specified")").font(.subheadline).foregroundStyle(Color.nexdoSecondary);if let price=offer.price{Text(price).font(.title.bold())}else{Text("Price not published").font(.subheadline).foregroundStyle(.secondary)};if let savings=offer.savings{Text(savings).font(.headline).foregroundStyle(.red).padding(8).background(Color.red.opacity(0.08),in:RoundedRectangle(cornerRadius:10))};if let unit=offer.unitPrice{Text(unit).font(.caption)}}
    }}
}
private func offerDate(_ value:String)->String {
    let date=ISO8601DateFormatter().date(from:value) ?? MomentDates.parseInstant(value)
    guard let date else{return value}
    return date.formatted(date:.abbreviated,time:.omitted)
}
@MainActor private func saveOfferChoice(store:ShoppingStore,list:GroceryList,itemId:String,offerId:String?) async throws -> GroceryList {
    struct Input:Encodable {let listId:String,itemId:String;let offerId:String?;let revision:Int
        enum CodingKeys:String,CodingKey{case listId,itemId,offerId,revision}
        func encode(to encoder:Encoder)throws{var c=encoder.container(keyedBy:CodingKeys.self);try c.encode(listId,forKey:.listId);try c.encode(itemId,forKey:.itemId);try c.encode(offerId,forKey:.offerId);try c.encode(revision,forKey:.revision)}
    }
    let result:ShoppingResult=try await store.api.request("/api/shopping/offers",method:"POST",body:JSONEncoder().encode(Input(listId:list.id,itemId:itemId,offerId:offerId,revision:list.revision)))
    guard let updated=result.list else{throw URLError(.badServerResponse)}
    await store.refresh();return updated
}
