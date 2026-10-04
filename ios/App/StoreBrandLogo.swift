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
    var size: CGFloat = 56
    var expandsOnTap = false
    @State private var expanded = false
    @State private var image: UIImage?
    @State private var label = "Shopping list"
    var body: some View {
        Group {
            if expandsOnTap, image != nil {
                Button { expanded = true } label: { avatar }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Expand \(label) logo")
                    .accessibilityIdentifier("shopping-store-logo-preview")
            } else {
                avatar.accessibilityLabel(image == nil ? "Shopping list" : "\(label) logo")
            }
        }
        .task(id: "\(listID)|\(identity)") { await load() }
        .sheet(isPresented: $expanded) {
            NavigationStack {
                Group {
                    if let image {
                        Image(uiImage: image).resizable().scaledToFit().padding(24)
                            .accessibilityLabel("\(label) logo")
                    }
                }.frame(maxWidth: .infinity, maxHeight: .infinity).background(.white)
                    .navigationTitle(label).navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { expanded = false } } }
            }.presentationDragIndicator(.visible)
        }
    }
    private var avatar: some View {
        Group {
            if let image {
                // Use nearly the full badge instead of adding a second large inset
                // around the provider's already padded logo artwork.
                Image(uiImage: image).resizable().scaledToFit().padding(size * 0.03)
            } else {
                Image(systemName: "cart.fill").font(.title).foregroundStyle(.green)
            }
        }
        .frame(width: size, height: size)
        .background(image == nil ? Color.green.opacity(0.14) : Color.white)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.green.opacity(0.12), lineWidth: 1))
        .contentShape(Circle())
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
                    kCGImageSourceThumbnailMaxPixelSize: 768,
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
