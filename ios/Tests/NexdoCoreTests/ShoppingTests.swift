import Foundation
import Testing
@testable import NexdoCore

@Test func shoppingTranscriptCollectsMultipleTurnsWithoutDuplicates(){
    var transcript=ShoppingTranscript()
    transcript.append(id:"one",text:"six ",completed:false)
    transcript.append(id:"one",text:"bananas",completed:false)
    #expect(transcript.text=="six bananas")
    transcript.append(id:"one",text:"six bananas",completed:true)
    transcript.append(id:"two",text:"one gallon of milk",completed:true)
    transcript.append(id:"one",text:"six bananas",completed:true)
    #expect(transcript.completedText=="six bananas; one gallon of milk")
    #expect(!transcript.hasPending)
    transcript.append(id:"three",text:"two eggs",completed:false)
    #expect(transcript.hasPending)
    #expect(!transcript.completedText.contains("eggs"))
}
@Test func shoppingItemRoundTripsSizeAndFractionalQuantity() throws {
    let item=GroceryItem(name:"Rice",category:"Pantry",quantity:"0.5",size:"kg",notes:"Brown rice")
    let data=try JSONEncoder().encode(item)
    #expect(try JSONDecoder().decode(GroceryItem.self,from:data)==item)
}

@Test func shoppingTranscriptKeepsCommittedOrderWhenFinalsArriveOutOfOrder(){
    var transcript=ShoppingTranscript()
    transcript.append(id:"first",text:"",completed:false)
    transcript.append(id:"second",text:"",completed:false)
    transcript.append(id:"second",text:"milk",completed:true)
    transcript.append(id:"first",text:"bananas",completed:true)
    #expect(transcript.text=="bananas; milk")
    #expect(!transcript.hasPending)
}

@Test func shoppingAmountDistinguishesPackCountFromSize(){
    #expect(GroceryItem(name:"Milk",quantity:"2",size:"1 gallon").amountLabel=="2 × 1 gallon")
    #expect(GroceryItem(name:"Spinach",quantity:"1",size:"1 bag").amountLabel=="1 bag")
}

@Test func shoppingImageCanBeSavedAndExplicitlyRemoved() throws {
    var item=GroceryItem(name:"Butter")
    item.imageData="/9j/AA=="
    #expect(try JSONDecoder().decode(GroceryItem.self,from:JSONEncoder().encode(item)).imageData==item.imageData)
    item.imageData=nil
    let json=try JSONSerialization.jsonObject(with:JSONEncoder().encode(item)) as! [String:Any]
    #expect(json["imageData"] is NSNull)
}

@Test func shoppingAlternativeDecodesAndBecomesAnItem() throws {
    let json=#"{"alternatives":[{"name":"Turkey breast","category":"Meat & Seafood","quantity":"1","size":"lb","reason":"Lean protein","detail":"Mild flavor"}],"tip":"Try a lean swap.","usedAI":true}"#.data(using:.utf8)!
    let response=try JSONDecoder().decode(ShoppingAlternativesResponse.self,from:json)
    #expect(response.alternatives.first?.groceryItem.name=="Turkey breast")
    #expect(response.alternatives.first?.groceryItem.notes=="Mild flavor")
    #expect(response.usedAI)
}

@Test func shoppingAlternativesHaveAnOfflineFallback() {
    let response=ShoppingAlternativesResponse.local(for:GroceryItem(name:"Chicken breast",category:"Meat & Seafood",quantity:"1",size:"lb"))
    #expect(response.alternatives.count==5)
    #expect(response.alternatives.contains{$0.name=="Turkey breast"})
    #expect(!response.usedAI)
}
