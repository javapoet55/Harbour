import Foundation

/// The Nexdo server a build talks to. It comes from the `API_BASE_URL` build setting (per configuration:
/// Debug → app-dev, Release → app), exposed as `NexdoAPIBaseURL` in Info.plist. There is no built-in
/// fallback: a build without a valid value must fail loudly rather than reach some other server.
public enum APIEnvironment {
    public static let infoKey = "NexdoAPIBaseURL"

    public enum ConfigurationError: Error, Equatable, CustomStringConvertible {
        case missing
        case unexpanded(String)
        case invalid(String)
        public var description: String {
            switch self {
            case .missing:
                return "\(APIEnvironment.infoKey) is missing from Info.plist. Set the API_BASE_URL build setting for this configuration (Debug: https://app-dev.nexdoapp.com, Release: https://app.nexdoapp.com)."
            case .unexpanded(let value):
                return "\(APIEnvironment.infoKey) is \"\(value)\": the API_BASE_URL build setting is not defined for this configuration."
            case .invalid(let value):
                return "\(APIEnvironment.infoKey) \"\(value)\" is not a server origin. Use https://host with no path, query or credentials."
            }
        }
    }

    /// Reads and validates the server origin from an Info.plist dictionary.
    public static func baseURL(from info: [String: Any]) throws -> URL {
        guard let raw = info[infoKey] as? String, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ConfigurationError.missing }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.contains("$(") { throw ConfigurationError.unexpanded(value) }
        guard let url = URL(string: value), url.scheme == "https", let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { throw ConfigurationError.invalid(value) }
        return URL(string: "https://\(host)\(url.port.map { ":\($0)" } ?? "")")!
    }

    /// A page on the same server, e.g. `/notifications`.
    public static func webURL(_ path: String, base: URL) -> URL {
        let path = path.hasPrefix("/") ? path : "/" + path
        return URL(string: path, relativeTo: base)!.absoluteURL
    }
}
