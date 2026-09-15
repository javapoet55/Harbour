import Foundation

public enum APIError: LocalizedError, Sendable {
    case scheduleWarning([String])
    case emailNotVerified(String)
    case insecureURL, signedOut, response(Int), server(Int, String), invalidResponse
    public var errorDescription: String? {
        switch self {
        case .scheduleWarning(let warnings): warnings.joined(separator: "\n\n")
        case .emailNotVerified(let message): message
        case .insecureURL: "A secure server address is required."
        case .signedOut: "Your session has expired. Please sign in again."
        case .response(let status): status == 409 ? "Your schedule changed or could not be refreshed. Ask for a fresh plan before making changes." : "The request could not be completed (\(status)). Refresh to check the current state before retrying."
        case .server(_, let message): message
        case .invalidResponse: "The server returned an unexpected response. Please try again later."
        }
    }
}

// API endpoints return JSON, never redirects. Do not forward credentials to a redirected host.
private final class NoRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

public actor APIClient {
    public let baseURL: URL
    private let session: URLSession
    public init(baseURL: URL, configuration: URLSessionConfiguration = .ephemeral) throws {
        guard baseURL.scheme == "https", baseURL.host != nil, baseURL.user == nil, baseURL.password == nil,
              baseURL.query == nil, baseURL.fragment == nil, baseURL.path.isEmpty || baseURL.path == "/" else { throw APIError.insecureURL }
        self.baseURL = baseURL
        let config = configuration
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 90
        config.httpShouldSetCookies = true
        self.session = URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }
    public func request<T: Decodable & Sendable>(_ path: String, method: String = "GET", body: Data? = nil, treatUnauthorizedAsSignedOut: Bool = true, timeout: TimeInterval = 60, contentType: String = "application/json") async throws -> T {
        guard path.hasPrefix("/api/"), let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.host == baseURL.host, url.scheme == "https" else { throw APIError.insecureURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeout
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if treatUnauthorizedAsSignedOut {
            if response.statusCode == 401 { throw APIError.signedOut }
            // Older deployments redirect expired sessions. Recognize login, but
            // never follow the redirect or forward credentials to another host.
            if (300..<400).contains(response.statusCode),
               let location = response.value(forHTTPHeaderField: "Location"),
               let destination = URL(string: location, relativeTo: url)?.absoluteURL,
               destination.scheme == url.scheme, destination.host == url.host,
               destination.port == url.port, destination.path == "/login" {
                throw APIError.signedOut
            }
        }
        guard (200..<300).contains(response.statusCode) else {
            if let payload = try? JSONDecoder().decode(ServerError.self, from: data), !payload.error.isEmpty {
                if payload.code == "SCHEDULE_WARNING", let warnings = payload.warnings { throw APIError.scheduleWarning(warnings) }
                if payload.code == "EMAIL_NOT_VERIFIED" { throw APIError.emailNotVerified(payload.error) }
                throw APIError.server(response.statusCode, payload.error)
            }
            throw APIError.response(response.statusCode)
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.invalidResponse }
    }
    public func requestData(_ path: String, method: String = "GET", body: Data? = nil, treatUnauthorizedAsSignedOut: Bool = true, timeout: TimeInterval = 60, contentType: String = "application/json", expectedMimeType: String? = nil) async throws -> Data {
        guard path.hasPrefix("/api/"), let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.host == baseURL.host, url.scheme == "https" else { throw APIError.insecureURL }
        var request = URLRequest(url: url); request.httpMethod = method; request.timeoutInterval = timeout; request.httpBody = body
        request.setValue(expectedMimeType ?? "application/octet-stream", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if treatUnauthorizedAsSignedOut && response.statusCode == 401 { throw APIError.signedOut }
        guard (200..<300).contains(response.statusCode) else {
            if let payload = try? JSONDecoder().decode(ServerError.self, from: data), !payload.error.isEmpty { throw APIError.server(response.statusCode, payload.error) }
            throw APIError.response(response.statusCode)
        }
        if let expectedMimeType, response.mimeType != expectedMimeType || data.isEmpty { throw APIError.invalidResponse }
        return data
    }
    public func clearSession() {
        session.configuration.httpCookieStorage?.cookies?.forEach { session.configuration.httpCookieStorage?.deleteCookie($0) }
    }
}

private struct ServerError: Decodable { let error: String; let code: String?; let warnings: [String]? }
