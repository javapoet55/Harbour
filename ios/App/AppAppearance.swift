import SwiftUI

/// Saved on this device; System follows the iPhone appearance automatically.
enum AppAppearance: String, CaseIterable, Identifiable {
    case system, day, night
    static let storageKey = "nexdo.appearance"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .system: "System"
        case .day: "Day"
        case .night: "Night"
        }
    }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .day: .light
        case .night: .dark
        }
    }
}
