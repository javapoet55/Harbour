import SwiftUI

extension Color {
    /// Accent for text and controls; solid branded buttons keep their original fill.
    static let wellnessAccent = Color(uiColor: UIColor {
        $0.userInterfaceStyle == .dark
            ? UIColor(red: 0.73, green: 0.67, blue: 1, alpha: 1)
            : UIColor(red: 0.24, green: 0.16, blue: 0.94, alpha: 1)
    })
}
