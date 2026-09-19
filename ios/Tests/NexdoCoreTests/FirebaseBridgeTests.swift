import Foundation
import Testing
@testable import NexdoCore

@Test func firebaseBridgeValidatesLogEvent() {
    let event = FirebaseBridgeEvent(body: ["command": "logEvent", "name": "shopping_list_open", "parameters": ["item_count": 8]])
    #expect(event?.name == "shopping_list_open")
    #expect(event?.parameters["item_count"] as? Int == 8)
    #expect(FirebaseBridgeEvent(body: ["command": "logEvent", "name": "screen_open"]) != nil)
}
@Test func firebaseBridgeRejectsMalformedEvents() {
    #expect(FirebaseBridgeEvent(body: ["command": "delete", "name": "event"]) == nil)
    #expect(FirebaseBridgeEvent(body: ["command": "logEvent", "name": "firebase_reserved"]) == nil)
    #expect(FirebaseBridgeEvent(body: ["command": "logEvent", "name": "bad name"]) == nil)
    #expect(FirebaseBridgeEvent(body: ["command": "logEvent", "name": "event", "parameters": "invalid"]) == nil)
    #expect(FirebaseBridgeEvent(body: ["command": "logEvent", "name": "event", "parameters": ["nested": ["secret": "value"]]]) == nil)
    #expect(FirebaseBridgeEvent(body: ["command": "logEvent", "name": "event", "parameters": ["value": Double.infinity]]) == nil)
}
