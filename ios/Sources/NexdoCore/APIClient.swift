import Foundation

public enum APIError: LocalizedError, Sendable {
    case insecureURL, signedOut, response(Int), server(Int, String), invalidResponse
    public var errorDescription: String? {
        switch self {
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
    public init(baseURL: URL) throws {
        guard baseURL.scheme == "https", baseURL.host != nil, baseURL.user == nil, baseURL.password == nil,
              baseURL.query == nil, baseURL.fragment == nil, baseURL.path.isEmpty || baseURL.path == "/" else { throw APIError.insecureURL }
        self.baseURL = baseURL
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 90
        config.httpShouldSetCookies = true
        self.session = URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }
    public func request<T: Decodable & Sendable>(_ path: String, method: String = "GET", body: Data? = nil, treatUnauthorizedAsSignedOut: Bool = true) async throws -> T {
        guard path.hasPrefix("/api/"), let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.host == baseURL.host, url.scheme == "https" else { throw APIError.insecureURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if response.statusCode == 401 && treatUnauthorizedAsSignedOut { throw APIError.signedOut }
        guard (200..<300).contains(response.statusCode) else {
            if let payload = try? JSONDecoder().decode(ServerError.self, from: data), !payload.error.isEmpty {
                throw APIError.server(response.statusCode, payload.error)
            }
            throw APIError.response(response.statusCode)
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.invalidResponse }
    }
    public func clearSession() {
        session.configuration.httpCookieStorage?.cookies?.forEach { session.configuration.httpCookieStorage?.deleteCookie($0) }
    }
}

private struct ServerError: Decodable { let error: String }
