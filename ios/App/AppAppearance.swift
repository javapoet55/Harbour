import SwiftUI

enum AppVoice {
    static let volumeStorageKey = "nexdo.appVoiceVolume"
    static let defaultVolume = 1.0
    static let volumeDidChange = Notification.Name("nexdo.appVoiceVolumeDidChange")

    static var volume: Double {
        let value = UserDefaults.standard.object(forKey: volumeStorageKey) as? Double ?? defaultVolume
        return min(max(value, 0), 1)
    }

    static func notifyVolumeChanged() {
        NotificationCenter.default.post(name: volumeDidChange, object: nil)
    }
}

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
