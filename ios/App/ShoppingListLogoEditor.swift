import SwiftUI
import PhotosUI
import ImageIO

struct ShoppingListLogoEditor: View {
    let api: APIClient
    let listID: String
    let storeName: String
    let website: String?
    @Binding var imageData: String?
    @Environment(\.openURL) private var openURL
    @State private var editing = false
    @State private var photo: PhotosPickerItem?
    @State private var loading = false
    @State private var failure: String?
    private var identity: String { [storeName, website ?? ""].joined(separator: "|") }
    private var searchURL: URL? {
        var url = URLComponents(string: "https://www.google.com/search")!
        url.queryItems = [.init(name: "tbm", value: "isch"), .init(name: "q", value: "\(storeName.trimmingCharacters(in: .whitespacesAndNewlines)) logo")]
        return url.url
    }
    var body: some View {
        Button { editing = true } label: {
            StoreBrandLogo(api: api, listID: listID, identity: identity, customImageData: imageData, size: 48)
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: "pencil.circle.fill").foregroundStyle(.white, Color.nexdoIndigo).font(.body)
                }
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Change store logo")
        .accessibilityIdentifier("shopping-edit-store-logo")
        .sheet(isPresented: $editing) {
            NavigationStack {
                Form {
                    Section {
                        HStack {
                            Spacer()
                            StoreBrandLogo(api: api, listID: listID, identity: identity, customImageData: imageData, size: 100)
                            Spacer()
                        }
                        Text(storeName.isEmpty ? "Store logo" : storeName).frame(maxWidth: .infinity)
                    }
                    Section {
                        Button("Search Google Images", systemImage: "magnifyingglass") {
                            if let url = searchURL { openURL(url) }
                        }.disabled(storeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        Text("Search for your store’s logo. Copy the image or save it to Photos, then return here to select it.")
                            .font(.footnote).foregroundStyle(.secondary)
                        PhotosPicker(selection: $photo, matching: .images) {
                            Label("Choose from Photos", systemImage: "photo")
                        }
                        Button("Paste copied image", systemImage: "document.on.clipboard") {
                            guard let image = UIPasteboard.general.image else {
                                failure = "Copy an image first, or save it to Photos and choose it above."
                                return
                            }
                            apply(image)
                        }
                        if imageData != nil {
                            Button("Use automatic store logo", role: .destructive) { imageData = nil; failure = nil }
                        }
                    } footer: {
                        Text("This logo applies to this shopping list. Tap Save in List Settings to keep your changes.")
                    }
                    if loading { ProgressView("Loading image…") }
                    if let failure { Text(failure).foregroundStyle(.red) }
                }
                .navigationTitle("Store Logo").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { editing = false }.disabled(loading) } }
                .disabled(loading)
                .interactiveDismissDisabled(loading)
            }
        }
        .task(id: photo) {
            guard let selected = photo else { return }
            loading = true; failure = nil
            defer { loading = false }
            do {
                guard let data = try await selected.loadTransferable(type: Data.self),
                      let source = CGImageSourceCreateWithData(data as CFData, nil),
                      let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceThumbnailMaxPixelSize: 512,
                        kCGImageSourceCreateThumbnailWithTransform: true
                      ] as CFDictionary) else {
                    failure = "This image could not be opened. Please choose another image."
                    return
                }
                try Task.checkCancellation()
                apply(UIImage(cgImage: thumbnail))
            } catch is CancellationError {
            } catch { failure = "This image could not be loaded. Please try another image." }
        }
    }
    private func apply(_ image: UIImage) {
        guard image.size.width > 0, image.size.height > 0 else {
            failure = "This image could not be opened."; return
        }
        let scale = min(1, 384 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let thumbnail = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill(); context.fill(CGRect(origin: .zero, size: size))
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        for quality in [0.85, 0.65, 0.45, 0.25] {
            if let data = thumbnail.jpegData(compressionQuality: quality), data.count <= 67_500 {
                imageData = data.base64EncodedString(); failure = nil; return
            }
        }
        failure = "This image is too large. Please choose a simpler logo."
    }
}
