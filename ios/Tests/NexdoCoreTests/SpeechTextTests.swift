import Testing
@testable import NexdoCore

@Test func readLoudPreservesLongAnswersWithinServerLimit() {
    let text = String(repeating: "Tomorrow: review the launch plan. 🌅\n", count: 400)
    let chunks = SpeechText.chunks(text)
    #expect(chunks.count > 1)
    #expect(chunks.joined() == text)
    #expect(chunks.allSatisfy { $0.utf16.count <= 3500 })
}

@Test func readLoudHandlesUnbrokenTextAndEmptyAnswers() {
    let text = String(repeating: "🌅", count: 5000)
    #expect(SpeechText.chunks(text).joined() == text)
    #expect(SpeechText.chunks(text).allSatisfy { $0.utf16.count <= 3500 })
    #expect(SpeechText.chunks("  \n ").isEmpty)
    #expect(SpeechText.chunks("Your task is at 10 PM.") == ["Your task is at 10 PM."])
}
