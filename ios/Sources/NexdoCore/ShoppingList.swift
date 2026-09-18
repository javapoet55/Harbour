import Foundation

public struct GroceryItem: Codable, Identifiable, Equatable, Sendable {
    public var id:String = UUID().uuidString
    public var name:String = ""
    public var category:String = "Other"
    public var quantity:String = "1"
    public var size:String = ""
    public var notes:String = ""
    public var checked:Bool = false
    public init(name:String = "",category:String = "Other",quantity:String = "1",size:String = "",notes:String = "") {
        self.name=name;self.category=category;self.quantity=quantity;self.size=size;self.notes=notes
    }
    public var amountLabel:String {
        guard !size.isEmpty else{return quantity}
        if size.first?.isNumber == true{return quantity == "1" ? size:quantity+" × "+size}
        return quantity+" "+size
    }
    public static let categories=["Produce","Dairy & Eggs","Meat & Seafood","Bakery","Pantry","Frozen","Drinks","Household","Other"]
    public static func icon(_ category:String)->String {
        switch category {case "Produce":return "carrot.fill";case "Dairy & Eggs":return "mug.fill";case "Meat & Seafood":return "fish.fill";case "Bakery":return "birthday.cake.fill";case "Drinks":return "waterbottle.fill";case "Frozen":return "snowflake";case "Household":return "house.fill";default:return "basket.fill"}
    }
}
public struct GroceryList: Codable, Identifiable, Equatable, Sendable {
    public var id:String
    public var title:String
    public var date:String
    public var timeZone:String
    public var weekly:Bool
    public var completedAt:String?
    public var revision:Int
    public var shareToken:String?
    public var items:[GroceryItem]
    public var remaining:Int {items.filter{!$0.checked}.count}
    public var shareText:String {
        ([title,date]+items.map{"\($0.checked ? "✓":"○") \($0.name) — \($0.quantity) \($0.size)\($0.notes.isEmpty ? "":" · "+$0.notes)"}).joined(separator:"\n")
    }
}
/// Each completed utterance is keyed by the provider's item ID, so duplicate events
/// and partial transcription updates never add the same groceries twice.
public struct ShoppingTranscript: Sendable {
    private var order:[String]=[]
    private var final:[String:String]=[:]
    private var partial:[String:String]=[:]
    public init(){}
    public mutating func append(id:String,text:String,completed:Bool){
        if !order.contains(id){order.append(id)}
        if completed {final[id]=text;partial[id]=nil}
        else if final[id] == nil {partial[id,default:""] += text}
    }
    public var text:String {order.compactMap{final[$0] ?? partial[$0]}.filter{!$0.isEmpty}.joined(separator:"; ")}
    public var completedText:String {order.compactMap{final[$0]}.filter{!$0.isEmpty}.joined(separator:"; ")}
    public var hasPending:Bool {!partial.isEmpty}
}
