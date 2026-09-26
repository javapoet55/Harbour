import Foundation
import UserNotifications
import UIKit

actor LocalTaskActionScheduler: TaskActionNotificationScheduler {
    private let center = UNUserNotificationCenter.current()
    static let category = "CONTACT_TASK"

    func replace(with notifications: [TaskActionNotification], actions: [TaskAction], owner: String) async throws {
        let existing = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix("nexdo.action.") }
        // Replace the owned set, including notifications for deleted/completed tasks.
        center.removePendingNotificationRequests(withIdentifiers: existing.map(\.identifier))
        let valid = Set(actions.filter { $0.status == .pending || $0.status == .scheduled }.map { "nexdo.action." + $0.id })
        let delivered = await center.deliveredNotifications()
        center.removeDeliveredNotifications(withIdentifiers: delivered.filter {
            $0.request.identifier.hasPrefix("nexdo.action.") && !valid.contains($0.request.identifier)
        }.map { $0.request.identifier })
        guard !notifications.isEmpty else { return }
        let settings = await center.notificationSettings()
        var authorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional || settings.authorizationStatus == .ephemeral
        if settings.authorizationStatus == .notDetermined {
            authorized = try await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
        guard authorized else { throw TaskActionServiceError.notificationsDenied }
        for notification in notifications {
            guard let action = actions.first(where: { $0.id == notification.actionId }) else { continue }
            let content = UNMutableNotificationContent()
            content.title = "Time to contact \(action.contactName)"
            content.body = "Choose Call, Message, Email, or remind me later."
            content.categoryIdentifier = Self.category
            content.sound = .default
            content.userInfo = ["actionID": action.id, "owner": owner]
            var calendar = Calendar(identifier: .gregorian); calendar.timeZone = .current
            var components = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: notification.fireAt)
            components.timeZone = .current
            try await center.add(UNNotificationRequest(identifier: notification.id, content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
        }
    }
}

final class TaskActionAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.getNotificationCategories { categories in
        let actions = [
            UNNotificationAction(identifier: "CALL", title: "Call", options: [.foreground, .authenticationRequired]),
            UNNotificationAction(identifier: "MESSAGE", title: "Message", options: [.foreground, .authenticationRequired]),
            UNNotificationAction(identifier: "EMAIL", title: "Email", options: [.foreground, .authenticationRequired]),
            UNNotificationAction(identifier: "REMIND_LATER", title: "Remind me later", options: [.foreground, .authenticationRequired])
        ]
            var categories = categories
            categories.insert(UNNotificationCategory(identifier: LocalTaskActionScheduler.category, actions: actions,
                intentIdentifiers: [], options: [.customDismissAction]))
            UNUserNotificationCenter.current().setNotificationCategories(categories)
        }
        return true
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let momentID = info["momentID"] as? String
        let momentOwner = info["momentOwner"] as? String
        let actionID = info["actionID"] as? String
        let actionOwner = info["owner"] as? String
        let choice = response.actionIdentifier
        guard choice != UNNotificationDismissActionIdentifier else { return }
        // Retain the cold-launch tap before iOS considers the response handled.
        await MainActor.run {
            if let momentID, let momentOwner {
                MomentNotificationRoute.shared.receive(momentID, owner: momentOwner)
            }
            if let actionID, let actionOwner {
                TaskActionCoordinator.shared.receive(actionID: actionID, owner: actionOwner, choice: choice)
            }
        }
    }
}
