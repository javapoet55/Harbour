import Foundation

/// Keeps the existing full-address persistence format while displaying two lines.
public struct ShoppingStoreAddress: Equatable, Sendable {
    public var street: String
    public var locality: String
    public init(address: String?, zip: String?) {
        var parts = (address ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let last = parts.last, ["usa", "us", "united states", "united states of america"].contains(last.lowercased()) { parts.removeLast() }
        // US formatted addresses end with city, state ZIP. Keep commas in street/unit.
        if parts.count >= 3 {
            street = parts.dropLast(2).joined(separator: ", ")
            locality = parts.suffix(2).joined(separator: ", ")
        } else if parts.count == 2, parts[0].range(of: #"^\d"#, options: .regularExpression) != nil {
            street = parts[0]
            locality = parts[1]
        } else {
            street = parts.count == 1 ? parts[0] : ""
            locality = parts.count == 2 ? parts.joined(separator: ", ") : ""
        }
        if let zip, !zip.isEmpty, !locality.contains(zip) { locality += locality.isEmpty ? zip : " \(zip)" }
    }
    public var fullAddress: String { [street, locality].filter { !$0.isEmpty }.joined(separator: ", ") }
    public var zip: String {
        guard let range = locality.range(of: #"\b\d{5}(?:-\d{4})?\s*$"#, options: .regularExpression) else { return "" }
        return String(locality[range]).trimmingCharacters(in: .whitespaces)
    }
    public static func mapsURL(name: String?, address: String?, placeID: String?, directions: Bool) -> URL? {
        let destination = [name, address].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        guard !destination.isEmpty else { return nil }
        var components = URLComponents(string: directions ? "https://www.google.com/maps/dir/" : "https://www.google.com/maps/search/")!
        components.queryItems = [URLQueryItem(name: "api", value: "1"), URLQueryItem(name: directions ? "destination" : "query", value: destination)]
        if let placeID, !placeID.isEmpty { components.queryItems?.append(URLQueryItem(name: directions ? "destination_place_id" : "query_place_id", value: placeID)) }
        return components.url
    }
}
