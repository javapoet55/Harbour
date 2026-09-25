import SwiftUI

struct ShoppingSnapshot:Decodable,Sendable {let lists:[GroceryList]}
struct ShoppingResult:Decodable,Sendable {var list:GroceryList?;var items:[GroceryItem]?}
struct ShoppingInput:Encodable {
    var title:String;var date:String;var timeZone:String;var weekly:Bool;var items:[GroceryItem]
    init(_ list:GroceryList){title=list.title;date=list.date;timeZone=list.timeZone;weekly=list.weekly;items=list.items}
}
private struct ShoppingAlternativeInput:Encodable {let name:String;let category:String;let quantity:String;let size:String;let brand:String?;let barcode:String?}
@MainActor final class ShoppingStore:ObservableObject {
    @Published var lists:[GroceryList]=[]
    @Published var busy=false
    @Published var error:String?
    private var alternativeCache: [String: (Date, ShoppingAlternativesResponse)] = [:]
    let api:APIClient
    init(api:APIClient){self.api=api}
    func refresh() async {
        do{let snapshot:ShoppingSnapshot=try await api.request("/api/shopping");lists=snapshot.lists;error=nil}
        catch{self.error=error.localizedDescription}
    }
    func action<T:Encodable>(_ operation:String,list:GroceryList?=nil,input:T,idempotencyKey:String?=nil) async -> GroceryList? {
        guard !busy else{return nil};busy=true;error=nil;defer{busy=false}
        do {
            let body=ShoppingEnvelope(operation:operation,id:list?.id,revision:list?.revision,input:input,idempotencyKey:idempotencyKey)
            let result:ShoppingResult=try await api.request("/api/shopping",method:"POST",body:JSONEncoder().encode(body))
            if let value=result.list {lists.removeAll{$0.id==value.id};lists.insert(value,at:0)}
            if operation=="delete",let list {lists.removeAll{$0.id==list.id}}
            await refresh()
            return result.list
        } catch{self.error=error.localizedDescription;return nil}
    }
    func parse(_ text:String) async throws -> [GroceryItem] {
        let body=ShoppingEnvelope(operation:"parse",id:nil,revision:nil,input:["text":text])
        let result:ShoppingResult=try await api.request("/api/shopping",method:"POST",body:JSONEncoder().encode(body))
        return result.items ?? []
    }
    func alternatives(for item:GroceryItem) async throws -> ShoppingAlternativesResponse {
        let cacheKey = [item.name,item.category,item.quantity,item.size,item.brand ?? "",item.barcode ?? ""].joined(separator:"|")
        if let cached = alternativeCache[cacheKey], Date().timeIntervalSince(cached.0) < 300 { return cached.1 }
        let input=ShoppingAlternativeInput(name:item.name,category:item.category,quantity:item.quantity,size:item.size,brand:item.brand,barcode:item.barcode)
        let body=ShoppingEnvelope(operation:"alternatives",id:nil,revision:nil,input:input)
        do {
            let result: ShoppingAlternativesResponse = try await api.request("/api/shopping",method:"POST",body:JSONEncoder().encode(body))
            try Task.checkCancellation()
            if alternativeCache.count >= 30 { alternativeCache.removeAll() }
            alternativeCache[cacheKey] = (Date(), result)
            return result
        }
        catch APIError.signedOut { throw APIError.signedOut }
        catch { try Task.checkCancellation(); return .local(for:item) }
    }
    func credential() async throws -> VoiceTaskSession {
        try await api.request("/api/realtime/transcription-session",method:"POST",body:JSONSerialization.data(withJSONObject:["consent":true,"scope":"shopping"]),timeout:25)
    }
}
struct ShoppingEnvelope<T:Encodable>:Encodable {let operation:String;let id:String?;let revision:Int?;let input:T;var idempotencyKey:String?=nil}
