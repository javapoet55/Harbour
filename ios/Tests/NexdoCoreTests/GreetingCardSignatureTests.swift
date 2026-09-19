import Testing
@testable import NexdoCore

@Test func greetingSignatureUsesAccountFirstName() {
    #expect(GreetingCardSignature.defaultValue(profileName: " Sri Kumar ") == "With love, Sri & family")
    #expect(GreetingCardSignature.defaultValue(profileName: "Rahul") == "With love, Rahul & family")
    #expect(GreetingCardSignature.defaultValue(profileName: "  ") == "With love, your family")
    #expect(GreetingCardSignature.defaultValue(profileName: String(repeating: "A", count: 100)).count == 80)
}
