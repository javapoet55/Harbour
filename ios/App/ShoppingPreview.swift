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
        client?.urlProtocol(self,didReceive:HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json"])!,cacheStoragePolicy:.notAllowed)
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
