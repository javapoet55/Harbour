import Foundation
import Testing
@testable import NexdoCore

@Test func verificationCodeKeepsExactlySixDigits() {
    #expect(VerificationCode.sanitized(" 12a3-45 678") == "123456")
    #expect(VerificationCode.sanitized("١٢٣٤٥٦") == "")
    #expect(VerificationCode.isComplete("123456"))
    #expect(!VerificationCode.isComplete("12345"))
    #expect(!VerificationCode.isComplete("12345a"))
}

@Test func registrationResponseReportsPendingVerification() throws {
    let current = try JSONDecoder().decode(RegistrationResponse.self, from: Data(#"{"id":"u","name":"N","email":"n@example.com","emailVerificationRequired":true,"emailSent":false}"#.utf8))
    #expect(current.emailVerificationRequired == true)
    #expect(current.emailSent == false)
    let legacy = try JSONDecoder().decode(RegistrationResponse.self, from: Data(#"{"id":"u","name":"N","email":"n@example.com"}"#.utf8))
    #expect(legacy.emailVerificationRequired == nil)
}
