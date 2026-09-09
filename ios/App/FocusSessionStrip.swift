import SwiftUI

struct NativeFocusSession {
    let taskID: String
    let title: String
    let endsAt: Date
    let workSessionID: String?
    let token: String
    let serverBacked: Bool
}

enum TaskEditError: LocalizedError {
    case busy, invalid, schedule, stepLimit
    var errorDescription: String? {
        switch self {
        case .busy: "Another update is in progress. Please try again."
        case .invalid: "Enter a task title and an estimate between 1 and 1440 minutes."
        case .schedule: "Your details were saved, but the schedule could not be updated. Your edits are still here. Please retry."
        case .stepLimit: "A task can have up to 50 steps. Remove a step before adding another."
        }
    }
}

/// A single native presentation of the existing server focus session, shared across tabs.
struct FocusSessionStrip: View {
    @EnvironmentObject private var model: AppModel
    @State private var error: String?
    var body: some View {
        if let session = model.focusSession {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = FocusClock.remainingSeconds(until: session.endsAt, now: context.date)
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(remaining == 0 ? "Focus finished" : session.title).font(.subheadline.weight(.semibold))
                        Text(FocusClock.label(seconds: remaining)).monospacedDigit()
                            .accessibilityLabel("\(remaining / 60) minutes, \(remaining % 60) seconds remaining")
                    }
                    Spacer()
                    Button(remaining == 0 ? "Finish" : "End focus") { finish() }
                        .frame(minHeight: 44).disabled(model.busy)
                }
            }.padding(12).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 13))
                .alert("Focus session", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                    Button("OK", role: .cancel) {}
                } message: { Text(error ?? "") }
        }
    }
    private func finish() {
        Task {
            do { try await model.finishFocus() }
            catch { self.error = "Couldn’t save your focus time. Please try again." }
        }
    }
}
