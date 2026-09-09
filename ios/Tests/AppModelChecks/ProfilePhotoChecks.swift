import Foundation

private final class PhotoProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: @Sendable (URLRequest) -> (Int, String) = { _ in (500, "{}") }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, body) = Self.handler(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main struct ProfilePhotoChecks {
    @MainActor static func main() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [PhotoProtocol.self]
        let model = AppModel(api: try APIClient(baseURL: URL(string: "https://photo.test")!, configuration: config))
        model.profile = try JSONDecoder().decode(Profile.self, from: Data(#"{"id":"owner","name":"QA","email":"qa@example.test","timeZone":"America/Los_Angeles","photo":"old"}"#.utf8))
        PhotoProtocol.handler = { request in
            precondition(request.url?.path == "/api/settings", "A confirmed upload must not wait for /me")
            return (200, #"{"ok":true,"profile":{"id":"owner","photo":"new"}}"#)
        }
        try await model.saveProfilePhoto("new")
        precondition(model.profile?.photo == "new")
        print("PASS: acknowledged photo is retained without a follow-up read")

        PhotoProtocol.handler = { _ in (500, "{}") }
        do { try await model.saveProfilePhoto("rejected"); preconditionFailure("Must report upload failure") } catch {}
        precondition(model.profile?.photo == "new")
        print("PASS: failed upload restores the previous photo")

        PhotoProtocol.handler = { request in
            if request.url?.path == "/api/settings" { return (200, #"{"ok":true}"#) }
            return (200, #"{"user":{"id":"owner","name":"QA","email":"qa@example.test","timeZone":"America/Los_Angeles","photo":"new"}}"#)
        }
        do { try await model.saveProfilePhoto("ignored"); preconditionFailure("Must reject ignored photo updates") } catch {}
        precondition(model.profile?.photo == "new")
        try await model.saveProfilePhoto("new")
        print("PASS: legacy servers must confirm persistence; selecting the same photo can retry")

        PhotoProtocol.handler = { _ in (200, #"{"ok":true,"profile":{"id":"owner","photo":null}}"#) }
        try await model.saveProfilePhoto(nil)
        precondition(model.profile?.photo == nil)
        print("PASS: removal persists and updates the avatar")
    }
}
