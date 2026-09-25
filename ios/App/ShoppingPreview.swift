#if DEBUG
import SwiftUI
import Foundation

final class ShoppingPreviewProtocol:URLProtocol,@unchecked Sendable {
    private static let lock=NSLock()
    nonisolated(unsafe) private static var lists:[[String:Any]]=[]
    override class func canInit(with request:URLRequest)->Bool{request.url?.host=="shopping-preview.invalid"}
    override class func canonicalRequest(for request:URLRequest)->URLRequest{request}
    static func reset(){
        lock.lock();defer{lock.unlock()}
        let items:[GroceryItem]=[
            .init(name:"Bananas",category:"Produce",quantity:"6"),
            .init(name:"Tomatoes",category:"Produce",quantity:"4",notes:"Organic"),
            .init(name:"Spinach",category:"Produce",size:"1 bag"),
            .init(name:"Milk",category:"Dairy & Eggs",size:"1 gallon"),
            .init(name:"Eggs",category:"Dairy & Eggs",size:"1 dozen"),
            .init(name:"Rice",category:"Pantry",size:"5 kg")]
        let encoded=(try! JSONSerialization.jsonObject(with:JSONEncoder().encode(items))) as! [[String:Any]]
        lists=[["id":"preview-list","title":"Weekly Shopping List","date":MomentDates.day(Date().addingTimeInterval(2*86400),zone:"America/Los_Angeles"),"timeZone":"America/Los_Angeles","weekly":true,"revision":0,"items":encoded]]
    }
    override func startLoading(){
        Self.lock.lock();defer{Self.lock.unlock()}
        var response:[String:Any]=["lists":Self.lists]
        var status = 200
        if request.httpMethod=="POST"{
            var data=request.httpBody
            if data==nil,let stream=request.httpBodyStream{
                stream.open();defer{stream.close()};var bytes=Data();var buffer=[UInt8](repeating:0,count:1024)
                while stream.hasBytesAvailable{let count=stream.read(&buffer,maxLength:buffer.count);if count<=0{break};bytes.append(buffer,count:count)};data=bytes
            }
            let json=(try? JSONSerialization.jsonObject(with:data ?? Data())) as? [String:Any] ?? [:]
            let input=json["input"] as? [String:Any] ?? [:]
            let operation=json["operation"] as? String ?? ""
            if operation=="create"{
                var list=input;list["id"]=UUID().uuidString;list["revision"]=0;Self.lists.insert(list,at:0);response=["list":list]
            }else if operation=="alternatives", ProcessInfo.processInfo.arguments.contains("-shopping-alternatives-failure") {
                status = 503; response = ["error":"Product data is temporarily unavailable. Please try again."]
            }else if operation=="alternatives" {
                var original = ShoppingProductFacts(source: "UI test fixture — not product data", nutrition: .init(servingSize: "1 cup (240 ml)", servingAmount: 240, servingUnit: "ml", calories: 150, protein: 8, totalFat: 8, saturatedFat: 5, carbohydrates: 12, sugar: 12, sodium: 105, calcium: 300), contains: ["Milk"], bestFor: ["Cereal", "Coffee", "Cooking", "Smoothies"])
                original.price = 4.99; original.currency = "USD"; original.pricePackage = "1 gallon"
                var milk = ShoppingAlternative(name: "2% Milk", category: "Dairy & Eggs", quantity: "1", size: "1 gallon", reason: "Test suggestion", detail: "Test fixture only")
                var metadata = original; metadata.nutrition?.calories = 120; metadata.nutrition?.totalFat = 5; metadata.nutrition?.saturatedFat = 3; metadata.price = 4.29
                milk.facts = metadata
                var one = milk; one.name = "1% Milk"; one.facts?.nutrition?.totalFat = 2.5
                var unknown = milk; unknown.name = "Lactose-free whole milk"; unknown.facts = nil
                var result = ShoppingAlternativesResponse(alternatives: [milk,one,unknown], tip: "Preview only", usedAI: false); result.originalFacts = original
                response = (try! JSONSerialization.jsonObject(with: JSONEncoder().encode(result))) as! [String:Any]
            }else if operation=="parse"{
                let item=GroceryItem(name:"Apples",category:"Produce",quantity:"3")
                response=["items":[try! JSONSerialization.jsonObject(with:JSONEncoder().encode(item))]]
            }else if let index=Self.lists.firstIndex(where:{$0["id"] as? String==json["id"] as? String}){
                var list=Self.lists[index]
                if operation=="save"{for (key,value) in input{list[key]=value};list["revision"]=(list["revision"] as? Int ?? 0)+1}
                if operation=="share"{list["shareToken"]=String(repeating:"a",count:64)}
                if operation=="revoke"{list["shareToken"]=nil}
                Self.lists[index]=list;response=["list":list]
                if operation=="delete"{Self.lists.remove(at:index);response=[:]}
            }
        }
        let data=try! JSONSerialization.data(withJSONObject:response)
        client?.urlProtocol(self,didReceive:HTTPURLResponse(url:request.url!,statusCode:status,httpVersion:nil,headerFields:["Content-Type":"application/json"])!,cacheStoragePolicy:.notAllowed)
        client?.urlProtocol(self,didLoad:data);client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading(){}
}
struct ShoppingDesignPreview:View {
    @StateObject private var store:ShoppingStore
    init(){
        ShoppingPreviewProtocol.reset()
        let config=URLSessionConfiguration.ephemeral;config.protocolClasses=[ShoppingPreviewProtocol.self]
        _store=StateObject(wrappedValue:ShoppingStore(api:try! APIClient(baseURL:URL(string:"https://shopping-preview.invalid")!,configuration:config)))
    }
    var body:some View {NavigationStack{ShoppingHome(store:store)}.tint(.nexdoIndigo)}
}
#endif
