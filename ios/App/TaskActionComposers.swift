import SwiftUI
import MessageUI

enum ActionComposeResult { case submitted, cancelled, saved, failed }
struct ActionEmailDraft {
    let recipient: String
    let subject: String
    let body: String
}
/// Future Gmail/Outlook delivery implementations can replace this draft service.
@MainActor protocol TaskActionEmailService {
    var canCompose: Bool { get }
    func draft(recipient: String, name: String, context: String?) -> ActionEmailDraft
}
struct NativeTaskActionEmailService: TaskActionEmailService {
    var canCompose: Bool { MFMailComposeViewController.canSendMail() }
    func draft(recipient: String, name: String, context: String?) -> ActionEmailDraft {
        ActionEmailDraft(recipient: recipient, subject: context.map { "Follow-up: \($0)" } ?? "Following up",
            body: "Hi \(name),\n\n" + (context.map { "Just following up regarding \($0)." } ?? "Just checking in.") + "\n\nThanks.")
    }
}
struct ActionMessageComposer: UIViewControllerRepresentable {
    let recipient: String
    let body: String
    let finished: (ActionComposeResult) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(finished: finished) }
    func makeUIViewController(context: Context) -> MFMessageComposeViewController {
        let controller = MFMessageComposeViewController()
        controller.messageComposeDelegate = context.coordinator
        controller.recipients = [recipient]; controller.body = body
        return controller
    }
    func updateUIViewController(_ controller: MFMessageComposeViewController, context: Context) {}
    final class Coordinator: NSObject, MFMessageComposeViewControllerDelegate {
        let finished: (ActionComposeResult) -> Void
        init(finished: @escaping (ActionComposeResult) -> Void) { self.finished = finished }
        func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
            finished(result == .sent ? .submitted : result == .cancelled ? .cancelled : .failed)
        }
    }
}
struct ActionEmailComposer: UIViewControllerRepresentable {
    let draft: ActionEmailDraft
    let finished: (ActionComposeResult) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(finished: finished) }
    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let controller = MFMailComposeViewController()
        controller.mailComposeDelegate = context.coordinator
        controller.setToRecipients([draft.recipient]); controller.setSubject(draft.subject)
        controller.setMessageBody(draft.body, isHTML: false)
        return controller
    }
    func updateUIViewController(_ controller: MFMailComposeViewController, context: Context) {}
    final class Coordinator: NSObject, MFMailComposeViewControllerDelegate {
        let finished: (ActionComposeResult) -> Void
        init(finished: @escaping (ActionComposeResult) -> Void) { self.finished = finished }
        func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: Error?) {
            if error != nil { finished(.failed); return }
            switch result {
            case .sent: finished(.submitted)
            case .saved: finished(.saved)
            case .cancelled: finished(.cancelled)
            default: finished(.failed)
            }
        }
    }
}
