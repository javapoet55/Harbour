import SwiftUI
import ImageIO

struct StoreBrandMetadata: Decodable, Sendable {
    let displayName: String
    let logoUrl: String?
}

/// Reusable store-level logo. Backend owns identity/matching/cache; SwiftUI never
/// receives a provider credential or guesses a retailer from the list title.
struct StoreBrandLogo: View {
    let api: APIClient
    let listID: String
    let identity: String
    @State private var image: UIImage?
    @State private var label = "Shopping list"
    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFit().padding(5)
            } else {
                Image(systemName: "cart.fill").font(.title).foregroundStyle(.green)
            }
        }
        .frame(width: 56, height: 56)
        .background(.green.opacity(0.14), in: RoundedRectangle(cornerRadius: 17))
        .accessibilityLabel(image == nil ? "Shopping list" : "\(label) logo")
        .task(id: "\(listID)|\(identity)") { await load() }
    }
    @MainActor private func load() async {
        let cacheKey = "\(listID)|\(identity)"
        if let cached = StoreBrandLogoCache.images.object(forKey: cacheKey as NSString), cached.expires > Date() {
            image = cached.image; label = cached.label; return
        }
        image = nil
        guard !identity.replacingOccurrences(of: "|", with: "").isEmpty else { return }
        do {
            var parts = URLComponents()
            parts.queryItems = [URLQueryItem(name: "listId", value: listID)]
            struct Result: Decodable, Sendable { let brand: StoreBrandMetadata }
            let result: Result = try await api.request("/api/shopping/store-brand?\(parts.percentEncodedQuery ?? "")", timeout: 20)
            try Task.checkCancellation()
            guard let raw = result.brand.logoUrl, let url = URL(string: raw),
                  url.scheme == "https", url.host == "cdn.brandfetch.io", url.user == nil,
                  url.password == nil, url.port == nil,
                  (URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).allSatisfy({ $0.name == "c" }) else { return }
            let config = URLSessionConfiguration.ephemeral
            config.urlCache = nil // No persistent redistribution of provider assets.
            config.timeoutIntervalForRequest = 8
            config.timeoutIntervalForResource = 10
            let session = URLSession(configuration: config, delegate: LogoRedirectGuard(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (bytes, response) = try await session.bytes(from: url)
            guard let response = response as? HTTPURLResponse, response.statusCode == 200,
                  ["image/png", "image/jpeg", "image/webp"].contains(response.mimeType ?? ""),
                  response.expectedContentLength <= 1_000_000 else { return }
            var data = Data()
            for try await byte in bytes {
                if data.count >= 1_000_000 { return }
                data.append(byte)
            }
            try Task.checkCancellation()
            let decoded = await Task.detached(priority: .utility) { () -> CGImage? in
                guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
                return CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceThumbnailMaxPixelSize: 168,
                    kCGImageSourceCreateThumbnailWithTransform: true
                ] as CFDictionary)
            }.value
            try Task.checkCancellation()
            if let decoded {
                let value = UIImage(cgImage: decoded)
                image = value; label = result.brand.displayName
                StoreBrandLogoCache.images.setObject(StoreBrandLogoCache.Entry(value, label), forKey: cacheKey as NSString, cost: decoded.bytesPerRow * decoded.height)
            }
        } catch { /* A missing logo must never interrupt shopping. */ }
    }
}
private final class LogoRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

// Brief, bounded in-memory reuse makes reopening the same list immediate. Images
// never go to disk; identity changes use a different key. Backend owns long TTLs.
@MainActor private enum StoreBrandLogoCache {
    final class Entry: NSObject {
        let image: UIImage
        let label: String
        let expires = Date().addingTimeInterval(60)
        init(_ image: UIImage, _ label: String) { self.image = image; self.label = label }
    }
    static let images: NSCache<NSString, Entry> = {
        let cache = NSCache<NSString, Entry>()
        cache.countLimit = 30
        cache.totalCostLimit = 4_000_000
        return cache
    }()
}
