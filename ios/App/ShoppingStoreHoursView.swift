import SwiftUI

struct ShoppingStoreHours: Decodable, Sendable {
    let days: [String]
    let openNow: Bool?
    let current: Bool
}

struct ShoppingStoreHoursView: View {
    let api: APIClient
    let placeID: String?
    let name: String
    let mapsURL: URL?
    @State private var result: ShoppingStoreHours?
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        List {
            Section {
                Text(name).font(.headline)
                if busy { ProgressView("Loading store hours…") }
                if let result {
                    if let open = result.openNow { Text(open ? "Open now" : "Closed now").foregroundStyle(open ? .green : .secondary) }
                    if result.days.isEmpty { Text("No hours provided for this store.") }
                    ForEach(Array(result.days.enumerated()), id: \.offset) { _, day in Text(day).fixedSize(horizontal: false, vertical: true) }
                    Text(result.current ? "Hours for the next seven days · Store local time" : "Regular hours · Holiday hours may differ").font(.caption).foregroundStyle(.secondary)
                }
                if let error { Text(error).foregroundStyle(.secondary) }
                if placeID == nil { Text("Choose this location using Add New Store to load its hours.").foregroundStyle(.secondary) }
                if error != nil { Button("Try again") { Task { await load() } } }
            } header: { Text("Store hours") }
            if let mapsURL { Link("View store on Google Maps", destination: mapsURL) }
            Text("Google Maps").font(.caption).foregroundStyle(.secondary)
        }.navigationTitle("Store Hours").navigationBarTitleDisplayMode(.inline).task(id: placeID) { await load() }
    }
    @MainActor private func load() async {
        guard let placeID, !placeID.isEmpty else { return }
        busy = true; error = nil; result = nil
        defer { busy = false }
        do {
            var components = URLComponents()
            components.queryItems = [URLQueryItem(name: "placeId", value: placeID)]
            let response: ShoppingStoreHours = try await api.request("/api/shopping/stores/hours?\(components.percentEncodedQuery ?? "")")
            try Task.checkCancellation(); result = response
        } catch { if !Task.isCancelled { self.error = "Unable to load store hours. Try again or open Google Maps." } }
    }
}
