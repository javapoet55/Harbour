import Foundation
import Testing
@testable import NexdoCore

/// Records each request and answers from a per-test script, keyed by the X-Test-ID header
/// (Swift Testing runs tests in parallel).
private final class CardStub: URLProtocol, @unchecked Sendable {
    struct Recorded: Sendable { let method, path: String; let contentType: String?; let body: Data }
    private static let lock = NSLock()
    nonisolated(unsafe) private static var scripts: [String: [(Int, String)]] = [:]
    nonisolated(unsafe) private static var log: [String: [Recorded]] = [:]
    static func script(_ id: String, _ responses: [(Int, String)]) { lock.withLock { scripts[id] = responses; log[id] = [] } }
    static func requests(_ id: String) -> [Recorded] { lock.withLock { log[id] ?? [] } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let id = request.value(forHTTPHeaderField: "X-Test-ID") ?? ""
        var body = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 65_536)
            while stream.hasBytesAvailable { let read = stream.read(&buffer, maxLength: buffer.count); if read <= 0 { break }; body.append(buffer, count: read) }
        }
        let (status, json) = Self.lock.withLock { () -> (Int, String) in
            Self.log[id, default: []].append(Recorded(method: request.httpMethod ?? "", path: request.url?.path ?? "", contentType: request.value(forHTTPHeaderField: "Content-Type"), body: body))
            return Self.scripts[id]?.isEmpty == false ? Self.scripts[id]!.removeFirst() : (500, #"{"error":"unscripted"}"#)
        }
        let type = json.hasPrefix("IMAGE:") ? "image/jpeg" : "application/json"
        let data = json.hasPrefix("IMAGE:") ? Data(json.dropFirst(6).utf8) : Data(json.utf8)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": type])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

private let sha = String(repeating: "ab", count: 32)
private func saved(_ id: String = "card1") -> String { #"{"card":{"id":"\#(id)","mime":"image/jpeg","size":4,"sha256":"\#(sha)","createdAt":"2026-09-23T10:00:00.000Z"},"plansUpdated":1}"# }
private let tooLarge = (413, #"{"error":"The card image is too large. Save it at a smaller size (1.5 MB at most)."}"#)

private func client(_ test: String, _ responses: [(Int, String)]) throws -> GreetingCardClient {
    CardStub.script(test, responses)
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [CardStub.self]
    config.httpAdditionalHeaders = ["X-Test-ID": test]
    return GreetingCardClient(api: try APIClient(baseURL: URL(string: "https://nexdo.test")!, configuration: config))
}

/// Counts how often each size is encoded and returns distinguishable bytes.
private actor Encoder {
    var calls: [GreetingCardEncoding] = []
    let standardBytes: Int
    init(standardBytes: Int = 4) { self.standardBytes = standardBytes }
    func encode(_ encoding: GreetingCardEncoding) -> Data {
        calls.append(encoding)
        return encoding == .standard ? Data(repeating: 0xAA, count: standardBytes) : Data([0xBB, 0xBB])
    }
}

@Test func uploadPutsTheJPEGBodyToTheMomentCardPath() async throws {
    let api = try client("upload", [(200, saved())])
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0])
    let card = try await api.upload(momentID: "moment 1", jpeg: jpeg)
    #expect(card == GreetingCardInfo(id: "card1", mime: "image/jpeg", sha256: sha, createdAt: "2026-09-23T10:00:00.000Z", size: 4))
    let request = try #require(CardStub.requests("upload").first)
    #expect(request.method == "PUT")
    #expect(request.path == "/api/moments/moment 1/card")
    #expect(request.contentType == "image/jpeg")
    #expect(request.body == jpeg)
}

@Test func uploadReEncodesSmallerOnceAfter413AndReusesItForLaterMoments() async throws {
    let api = try client("413", [tooLarge, (200, saved("a")), (200, saved("b"))])
    let encoder = Encoder()
    let cards = try await api.upload(momentIDs: ["m1", "m2"]) { await encoder.encode($0) }
    #expect(cards["m1"]?.id == "a")
    #expect(cards["m2"]?.id == "b")
    #expect(await encoder.calls == [.standard, .reduced])
    let requests = CardStub.requests("413")
    #expect(requests.map(\.path) == ["/api/moments/m1/card", "/api/moments/m1/card", "/api/moments/m2/card"])
    #expect(requests.map(\.body) == [Data(repeating: 0xAA, count: 4), Data([0xBB, 0xBB]), Data([0xBB, 0xBB])])
}

@Test func uploadRetriesOnlyOnceAndNotForOtherFailures() async throws {
    let twice = try client("413-twice", [tooLarge, tooLarge, (200, saved())])
    await #expect(throws: APIError.self) { _ = try await twice.upload(momentIDs: ["m1"]) { await Encoder().encode($0) } }
    #expect(CardStub.requests("413-twice").count == 2)

    let unavailable = try client("503", [(503, #"{"error":"Unavailable"}"#), (200, saved())])
    let encoder = Encoder()
    await #expect(throws: APIError.self) { _ = try await unavailable.upload(momentIDs: ["m1"]) { await encoder.encode($0) } }
    #expect(CardStub.requests("503").count == 1)
    #expect(await encoder.calls == [.standard])
}

@Test func uploadSkipsStraightToTheReducedSizeWhenTheStandardOneIsOverTheLimit() async throws {
    let api = try client("oversize", [(200, saved())])
    let encoder = Encoder(standardBytes: GreetingCardClient.maximumBytes + 1)
    _ = try await api.upload(momentIDs: ["m1"]) { await encoder.encode($0) }
    #expect(CardStub.requests("oversize").map(\.body) == [Data([0xBB, 0xBB])])
}

@Test func deleteRemovesTheCardAndTreatsAMissingCardAsRemoved() async throws {
    let api = try client("delete", [(200, #"{"deleted":"card1","plansUpdated":2}"#), (404, #"{"error":"No greeting card has been saved for this moment."}"#), (500, #"{"error":"Request failed."}"#)])
    try await api.delete(momentID: "m1")
    try await api.delete(momentID: "m1")
    await #expect(throws: APIError.self) { try await api.delete(momentID: "m1") }
    let requests = CardStub.requests("delete")
    #expect(requests.map(\.method) == ["DELETE", "DELETE", "DELETE"])
    #expect(requests.first?.path == "/api/moments/m1/card")
}

@Test func cacheKeepsDownloadedCardsBySHA256() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cache = GreetingCardCache(directory: directory)
    let api = try client("download", [(200, "IMAGE:card-bytes")])
    let card = GreetingCardInfo(id: "c", mime: "image/jpeg", sha256: sha, createdAt: "", size: 10)
    #expect(try await cache.image(for: card, momentID: "m1", client: api) == Data("card-bytes".utf8))
    #expect(try await cache.image(for: card, momentID: "m1", client: api) == Data("card-bytes".utf8))
    #expect(CardStub.requests("download").map(\.method) == ["GET"])
    cache.removeAll()
    #expect(cache.load(card) == nil)
    // A malformed hash is never used as a file name.
    let unsafe = GreetingCardInfo(id: "c", mime: "image/jpeg", sha256: "../../escape", createdAt: "", size: 1)
    cache.store(Data([1]), for: unsafe)
    #expect(cache.load(unsafe) == nil)
}

@Test func momentDecodesItsSavedCardAndOlderResponsesWithoutOne() throws {
    let base = #""id":"m","type":"birthday","title":"T","firstName":"A","phone":"","email":"","occurrenceDate":"2000-01-01","timeZoneID":"UTC","source":"manual","sourceKey":"k","yearly":true,"enabled":true,"nextOccurrence":"2027-01-01","drafts":[]"#
    let with = try JSONDecoder().decode(ImportantMoment.self, from: Data("{\(base),\"card\":{\"id\":\"c\",\"mime\":\"image/png\",\"size\":9,\"sha256\":\"\(sha)\",\"createdAt\":\"x\"}}".utf8))
    #expect(with.card?.mime == "image/png")
    #expect(try JSONDecoder().decode(ImportantMoment.self, from: Data("{\(base),\"card\":null}".utf8)).card == nil)
    #expect(try JSONDecoder().decode(ImportantMoment.self, from: Data("{\(base)}".utf8)).card == nil)
}
