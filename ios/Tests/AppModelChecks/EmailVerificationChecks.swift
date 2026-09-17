import Foundation

private struct Reply: Sendable {
    var status = 200
    var body = "{}"
}
private final class MockState: @unchecked Sendable {
    private let lock = NSLock()
    private var handler: @Sendable (URLRequest) -> Reply = { _ in Reply() }
    private var requests: [URLRequest] = []
    func configure(_ handler: @escaping @Sendable (URLRequest) -> Reply) {
        lock.withLock { self.handler = handler; requests = [] }
    }
    func reply(_ request: URLRequest) -> Reply {
        let handle = lock.withLock { requests.append(request); return handler }
        return handle(request)
    }
    func count(_ path: String) -> Int { lock.withLock { requests.filter { $0.url?.path == path }.count } }
}
private final class MockProtocol: URLProtocol, @unchecked Sendable {
    static let state = MockState()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let reply = Self.state.reply(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(reply.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main
struct EmailVerificationChecks {
    static let email = "new@example.test"
    static let profile = #"{"user":{"id":"verified","name":"Verified User","email":"new@example.test","timeZone":"\#(TimeZone.autoupdatingCurrent.identifier)"}}"#

    @MainActor static func model() throws -> AppModel {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockProtocol.self]
        return AppModel(api: try APIClient(baseURL: URL(string: "https://nexdo.test")!, configuration: configuration))
    }
    static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        precondition(condition(), message)
    }
    static func json(_ request: URLRequest) -> [String: String] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                if count <= 0 { break }
                data.append(buffer, count: count)
            }
        }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: String]) ?? [:]
    }

    @MainActor static func main() async throws {
        // Current servers: registration waits for the emailed code and starts no session.
        MockProtocol.state.configure { request in
            guard request.url?.path == "/api/auth/register" else { return Reply(status: 500) }
            return Reply(status: 201, body: #"{"id":"u1","name":"New","email":"new@example.test","emailVerificationRequired":true,"emailSent":true}"#)
        }
        let signup = try model()
        let pending = await signup.register(name: "New", email: email, password: "long-enough-password")
        expect(pending == PendingEmailVerification(email: email, reason: .codeSent), "Registration did not require verification")
        expect(signup.profile == nil && MockProtocol.state.count("/api/me") == 0 && signup.error == nil && !signup.busy, "Registration signed in before verification")
        print("PASS: registration waits for the emailed code")

        MockProtocol.state.configure { request in
            guard request.url?.path == "/api/auth/register" else { return Reply(status: 500) }
            return Reply(status: 201, body: #"{"id":"u1","name":"New","email":"new@example.test","emailVerificationRequired":true,"emailSent":false}"#)
        }
        let unsent = await (try model()).register(name: "New", email: email, password: "long-enough-password")
        expect(unsent?.reason == .codeNotSent, "Failed code delivery was not surfaced")
        print("PASS: failed code delivery opens verification ready to resend")

        // An unverified password sign-in opens verification instead of an error alert.
        MockProtocol.state.configure { request in
            guard request.url?.path == "/api/auth/login" else { return Reply(status: 500) }
            return Reply(status: 403, body: #"{"code":"EMAIL_NOT_VERIFIED","error":"Verify your email address to sign in.","email":"new@example.test"}"#)
        }
        let blocked = try model()
        let blockedPending = await blocked.login(email: "  \(email) ", password: "long-enough-password")
        expect(blockedPending == PendingEmailVerification(email: email, reason: .signInRequiresVerification), "Unverified sign-in did not open verification")
        expect(blocked.profile == nil && blocked.error == nil && !blocked.busy, "Unverified sign-in raised an alert or signed in")
        print("PASS: unverified sign-in opens verification")

        // Wrong credentials still show the normal error.
        MockProtocol.state.configure { request in
            guard request.url?.path == "/api/auth/login" else { return Reply(status: 500) }
            return Reply(status: 401, body: #"{"error":"Invalid email or password."}"#)
        }
        let wrong = try model()
        let wrongPending = await wrong.login(email: email, password: "bad-password-123")
        expect(wrongPending == nil && wrong.error == "Invalid email or password." && wrong.profile == nil, "Wrong credentials were not reported")
        print("PASS: wrong credentials keep the normal error")

        // A rejected code stays signed out and returns the server's message.
        MockProtocol.state.configure { request in
            guard request.url?.path == "/api/auth/verify-email" else { return Reply(status: 500) }
            return Reply(status: 400, body: #"{"error":"That verification code is invalid, expired, or already used. Send a new code and try again."}"#)
        }
        let rejected = try model()
        do {
            try await rejected.verifyEmail(email: email, code: "000000")
            expect(false, "Rejected code was accepted")
        } catch {
            expect(error.localizedDescription.hasPrefix("That verification code is invalid") && rejected.profile == nil, "Rejected code message or profile was wrong")
        }
        print("PASS: rejected code shows the server message and stays signed out")

        // A correct code signs in and loads the profile.
        MockProtocol.state.configure { request in
            switch request.url?.path {
            case "/api/auth/verify-email":
                let input = json(request)
                expect(input["email"] == email && input["code"] == "123456", "Verification request body was wrong")
                return Reply(body: #"{"ok":true}"#)
            case "/api/me": return Reply(body: profile)
            case "/api/tasks": return Reply(body: #"{"tasks":[]}"#)
            default: return Reply(status: 500)
            }
        }
        let verified = try model()
        try await verified.verifyEmail(email: email, code: "123456")
        expect(verified.profile?.id == "verified", "Verification did not load the signed-in profile")
        await verified.reset()
        print("PASS: correct code signs in and loads the profile")

        // Resend posts the address and returns the server's message.
        MockProtocol.state.configure { request in
            guard request.url?.path == "/api/auth/verify-email/resend" else { return Reply(status: 500) }
            expect(json(request)["email"] == email, "Resend request body was wrong")
            return Reply(body: #"{"message":"If that account still needs verification, a new six-digit code has been sent. It expires in 24 hours.","delivered":true}"#)
        }
        let message = try await (try model()).resendVerificationCode(email: email)
        expect(message.hasSuffix("It expires in 24 hours."), "Resend message was not returned")
        print("PASS: resend returns the server message")

        expect(VerificationCode.sanitized(" 12a3-45 678") == "123456", "Code entry kept non-digits or extra digits")
        expect(VerificationCode.isComplete("123456") && !VerificationCode.isComplete("12345") && !VerificationCode.isComplete("12345a"), "Code completeness was wrong")
        print("PASS: code entry keeps exactly six digits")
    }
}
