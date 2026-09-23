import Foundation

/// The saved card the server attaches to automatic wish emails (`card` on each moment in GET /api/moments).
public struct GreetingCardInfo: Codable, Equatable, Sendable {
    public var id, mime, sha256, createdAt: String
    public var size: Int
    public init(id: String, mime: String, sha256: String, createdAt: String, size: Int) {
        self.id = id; self.mime = mime; self.sha256 = sha256; self.createdAt = createdAt; self.size = size
    }
}

/// How the finished card is rendered to JPEG. Standard first; reduced once after the server says 413.
public struct GreetingCardEncoding: Equatable, Sendable {
    public let longestSide: CGFloat
    public let quality: CGFloat
    public static let standard = GreetingCardEncoding(longestSide: 1600, quality: 0.85)
    public static let reduced = GreetingCardEncoding(longestSide: 1100, quality: 0.7)
}

public enum GreetingCardUploadError: LocalizedError, Equatable, Sendable {
    case renderFailed
    public var errorDescription: String? { "The card could not be prepared for email." }
}

/// PUT/GET/DELETE /api/moments/{id}/card. The upload is the JPEG itself, not JSON.
public struct GreetingCardClient: Sendable {
    /// The server's limit (src/server/moments/card-image.ts `CARD_MAX_BYTES`).
    public static let maximumBytes = 1_500_000
    let api: APIClient
    public init(api: APIClient) { self.api = api }

    static func path(_ momentID: String) -> String {
        "/api/moments/\(momentID.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_"))) ?? momentID)/card"
    }

    public func upload(momentID: String, jpeg: Data) async throws -> GreetingCardInfo {
        struct Saved: Decodable, Sendable { let card: GreetingCardInfo }
        let saved: Saved = try await api.request(Self.path(momentID), method: "PUT", body: jpeg, timeout: 60, contentType: "image/jpeg")
        return saved.card
    }

    /// Uploads the card to each moment. A card the server rejects as too large (or that is already over
    /// the limit here) is encoded once more at the reduced size; `encode` is called at most once per size.
    public func upload(momentIDs: [String], encode: @Sendable (GreetingCardEncoding) async throws -> Data) async throws -> [String: GreetingCardInfo] {
        var encodings: [GreetingCardEncoding: Data] = [:]
        func data(_ encoding: GreetingCardEncoding) async throws -> Data {
            if let cached = encodings[encoding] { return cached }
            let value = try await encode(encoding)
            encodings[encoding] = value
            return value
        }
        var saved: [String: GreetingCardInfo] = [:]
        for id in momentIDs {
            var encoding = GreetingCardEncoding.standard
            if encodings[.reduced] != nil { encoding = .reduced }
            else if try await data(.standard).count > Self.maximumBytes { encoding = .reduced }
            do { saved[id] = try await upload(momentID: id, jpeg: try await data(encoding)) }
            catch let error as APIError where error.status == 413 && encoding == .standard {
                saved[id] = try await upload(momentID: id, jpeg: try await data(.reduced))
            }
        }
        return saved
    }

    public func download(momentID: String) async throws -> Data {
        try await api.requestData(Self.path(momentID), timeout: 30)
    }

    /// Removes the saved card; one already gone counts as removed.
    public func delete(momentID: String) async throws {
        struct Deleted: Decodable, Sendable { let deleted: String }
        do { let _: Deleted = try await api.request(Self.path(momentID), method: "DELETE") }
        catch let error as APIError where error.status == 404 {}
    }
}

extension APIError {
    var status: Int? {
        switch self {
        case .response(let status), .server(let status, _): status
        default: nil
        }
    }
}

extension GreetingCardEncoding: Hashable {}

/// Downloaded cards, keyed by the server's sha256, so an unchanged card is not fetched again.
public struct GreetingCardCache: Sendable {
    let directory: URL
    public init(directory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("GreetingCards", isDirectory: true)) {
        self.directory = directory
    }
    private func file(_ sha256: String) -> URL? {
        guard sha256.count == 64, sha256.allSatisfy({ $0.isHexDigit }) else { return nil }
        return directory.appendingPathComponent(sha256.lowercased())
    }
    public func load(_ card: GreetingCardInfo) -> Data? { file(card.sha256).flatMap { try? Data(contentsOf: $0) } }
    public func store(_ data: Data, for card: GreetingCardInfo) {
        guard let url = file(card.sha256) else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: url, options: [.atomic, .completeFileProtection])
    }
    /// Clears every cached card, e.g. when the signed-in account changes.
    public func removeAll() { try? FileManager.default.removeItem(at: directory) }
    /// The card's image from the cache, or downloaded and cached.
    public func image(for card: GreetingCardInfo, momentID: String, client: GreetingCardClient) async throws -> Data {
        if let cached = load(card) { return cached }
        let data = try await client.download(momentID: momentID)
        store(data, for: card)
        return data
    }
}
