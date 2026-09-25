import Foundation
import Testing
@testable import NexdoCore

@Test func businessActionRoutesToSearchOrExistingShortlist() {
    #expect(ActionNeededState.resolve(loaded: true, failed: false, business: true, hasResults: false, hasRecipient: false, hasPhone: false, hasEmail: false) == .findBusiness)
    #expect(ActionNeededState.resolve(loaded: true, failed: false, business: true, hasResults: true, hasRecipient: false, hasPhone: false, hasEmail: false) == .chooseBusiness)
    // A stale selected business with no usable contact details must remain recoverable.
    #expect(ActionNeededState.resolve(loaded: true, failed: false, business: true, hasResults: true, hasRecipient: true, hasPhone: false, hasEmail: false) == .chooseBusiness)
}
@Test func personalActionOffersRecoveryAndOnlyAvailableChannels() {
    #expect(ActionNeededState.resolve(loaded: true, failed: false, business: false, hasResults: false, hasRecipient: false, hasPhone: false, hasEmail: false) == .chooseContact)
    #expect(ActionNeededState.resolve(loaded: true, failed: false, business: true, hasResults: true, hasRecipient: true, hasPhone: true, hasEmail: false) == .ready([.call, .message]))
    #expect(ActionNeededState.channels(hasPhone: false, hasEmail: true) == [.email])
    #expect(ActionNeededState.channels(hasPhone: true, hasEmail: true) == [.call, .message, .email])
}
@Test func actionLookupHasLoadingAndRetryStates() {
    #expect(ActionNeededState.resolve(loaded: false, failed: false, business: false, hasResults: false, hasRecipient: false, hasPhone: false, hasEmail: false) == .loading)
    #expect(ActionNeededState.resolve(loaded: false, failed: true, business: false, hasResults: false, hasRecipient: false, hasPhone: false, hasEmail: false) == .retry)
}
@Test func manualRecipientValidation() {
    #expect(TaskActionRecipient.isValid(name: "Sam", phone: "+1 (925) 555-0100", email: ""))
    #expect(TaskActionRecipient.isValid(name: "Sam", phone: "", email: "sam@example.com"))
    for (name, phone, email) in [("", "9255550100", ""), ("Sam", "", ""), ("Sam", "abc123", ""), ("Sam", "12", ""), ("Sam", "", "bad@"), ("Sam", "", "sam @example.com")] {
        #expect(!TaskActionRecipient.isValid(name: name, phone: phone, email: email))
    }
}
@Test func recipientPersistenceIsBackwardCompatible() throws {
    let detection = DetectedTaskAction(intent: .contact, contactName: "plumber", preferredAction: nil, scheduledAt: nil, context: nil)
    var action = TaskAction(taskId: "task", title: "Contact plumber", detection: detection, scheduledAt: nil)
    let legacy = try JSONEncoder().encode(action)
    #expect(try JSONDecoder().decode(TaskAction.self, from: legacy).businessCandidateID == nil)
    action.businessCandidateID = "chosen-place"
    #expect(try JSONDecoder().decode(TaskAction.self, from: JSONEncoder().encode(action)) == action)
    action.businessCandidateID = nil
    action.manualRecipient = .init(name: "Sam", phone: "9255550100", email: "")
    #expect(try JSONDecoder().decode(TaskAction.self, from: JSONEncoder().encode(action)) == action)
}
