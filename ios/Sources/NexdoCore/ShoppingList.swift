import Foundation

public struct GroceryItem: Codable, Identifiable, Equatable, Sendable {
    public var id:String = UUID().uuidString
    public var name:String = ""
    public var category:String = "Other"
    public var quantity:String = "1"
    public var size:String = ""
    public var notes:String = ""
    public var imageData:String?
    public var brand:String?
    public var barcode:String?
    public var checked:Bool = false
    public var favorite:Bool?
    public var favoriteAlternatives:[String]?
    public init(name:String = "",category:String = "Other",quantity:String = "1",size:String = "",notes:String = "") {
        self.name=name;self.category=category;self.quantity=quantity;self.size=size;self.notes=notes
    }
    enum CodingKeys:String,CodingKey {case id,name,category,quantity,size,notes,checked,imageData,favorite,favoriteAlternatives,brand,barcode}
    public func encode(to encoder:Encoder) throws {
        var c=encoder.container(keyedBy:CodingKeys.self)
        try c.encodeIfPresent(brand,forKey:.brand);try c.encodeIfPresent(barcode,forKey:.barcode)
        try c.encodeIfPresent(favorite,forKey:.favorite);try c.encodeIfPresent(favoriteAlternatives,forKey:.favoriteAlternatives)
        try c.encode(id,forKey:.id);try c.encode(name,forKey:.name)
        try c.encode(category,forKey:.category);try c.encode(quantity,forKey:.quantity)
        try c.encode(size,forKey:.size);try c.encode(notes,forKey:.notes)
        try c.encode(checked,forKey:.checked);try c.encode(imageData,forKey:.imageData)
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
public struct ShoppingAlternative: Codable, Identifiable, Equatable, Sendable {
    public var name:String
    public var category:String
    public var quantity:String
    public var size:String
    public var facts:ShoppingProductFacts?
    public var whyThisSwap:String?
    public var reason:String
    public var detail:String
    public var id:String { [name,category,quantity,size].joined(separator:"|") }
    public init(name:String,category:String,quantity:String,size:String,reason:String,detail:String){
        self.name=name;self.category=category;self.quantity=quantity;self.size=size;self.reason=reason;self.detail=detail
    }
    public var groceryItem:GroceryItem {
        var item = GroceryItem(name:name,category:category,quantity:quantity,size:size,notes:detail)
        item.brand = facts?.brand; item.barcode = facts?.barcode
        return item
    }
}
public struct ShoppingAlternativesResponse: Codable, Equatable, Sendable {
    public var originalFacts:ShoppingProductFacts?
    public var alternatives:[ShoppingAlternative]
    public var tip:String
    public var usedAI:Bool
    public init(alternatives:[ShoppingAlternative],tip:String,usedAI:Bool){self.alternatives=alternatives;self.tip=tip;self.usedAI=usedAI}
    public static func local(for item:GroceryItem)->ShoppingAlternativesResponse {
        let text=item.name.lowercased()
        if text.contains("chicken") {return .init(alternatives:[
            .init(name:"Chicken breast (skinless)",category:"Meat & Seafood",quantity:item.quantity,size:item.size.isEmpty ? "lb":item.size,reason:"Lower calorie option",detail:"Lean cut with less saturated fat"),
            .init(name:"Turkey breast",category:"Meat & Seafood",quantity:item.quantity,size:item.size.isEmpty ? "lb":item.size,reason:"Lean protein",detail:"Mild flavor and lower in fat"),
            .init(name:"Salmon",category:"Meat & Seafood",quantity:item.quantity,size:item.size.isEmpty ? "lb":item.size,reason:"Omega-3 option",detail:"Rich flavor and useful nutrients"),
            .init(name:"Firm tofu",category:"Produce",quantity:"1",size:"package",reason:"Plant-based alternative",detail:"Versatile source of protein"),
            .init(name:"Chickpeas",category:"Pantry",quantity:"2",size:"cans",reason:"High-fiber option",detail:"Plant-based protein with fiber")
        ],tip:"Try turkey breast for a lean swap with a similar mild flavor.",usedAI:false)}
        if text.contains("milk") {return .init(alternatives:[
            .init(name:"Low-fat milk",category:"Dairy & Eggs",quantity:item.quantity,size:item.size,reason:"Lower-fat option",detail:"Similar dairy taste with less fat"),
            .init(name:"Lactose-free milk",category:"Dairy & Eggs",quantity:item.quantity,size:item.size,reason:"Lactose-free",detail:"Dairy milk without lactose"),
            .init(name:"Unsweetened oat milk",category:"Dairy & Eggs",quantity:"1",size:"carton",reason:"Plant-based option",detail:"Creamy texture without dairy"),
            .init(name:"Unsweetened soy milk",category:"Dairy & Eggs",quantity:"1",size:"carton",reason:"More plant protein",detail:"Neutral flavor with protein")
        ],tip:"Choose an unsweetened alternative when you want to avoid added sugar.",usedAI:false)}
        let base=item.name.replacingOccurrences(of:"Organic ",with:"")
        return .init(alternatives:[
            .init(name:"Organic \(base)",category:item.category,quantity:item.quantity,size:item.size,reason:"Organic option",detail:"A comparable certified-organic choice"),
            .init(name:"Store-brand \(base)",category:item.category,quantity:item.quantity,size:item.size,reason:"Budget-friendly",detail:"A similar option that may cost less"),
            .init(name:"Family-size \(base)",category:item.category,quantity:item.quantity,size:item.size.isEmpty ? "large pack":item.size,reason:"Larger package",detail:"Useful when you need more servings")
        ],tip:"Compare unit prices and package sizes before replacing \(base).",usedAI:false)
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
/// Scene states that matter to a live shopping voice session.
public enum ShoppingVoiceScene: Sendable {
    case active, inactive, background
    /// The microphone permission alert makes the scene inactive, so only close on inactive
    /// when no permission request is in flight. Leaving for the background always closes.
    public static func shouldClose(_ scene:ShoppingVoiceScene,requestingPermission:Bool)->Bool {
        switch scene {
        case .active:false
        case .inactive:!requestingPermission
        case .background:true
        }
    }
}

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
public extension GroceryList {
    /// "1 item" / "N items" for list counts shown in the UI.
    static func itemCount(_ count:Int)->String { count == 1 ? "1 item" : "\(count) items" }
}
