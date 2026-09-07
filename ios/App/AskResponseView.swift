import SwiftUI

/// Existing structured assistant rendering and explicit plan approvals.
struct AskResponseView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
                    if let turn = model.turn {
                        Section { Text(turn.visual.summary) }
                        if let sections = turn.visual.sections, !sections.isEmpty {
                            ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                                Section(section.title) { ForEach(Array(section.items.enumerated()), id: \.offset) { _, item in Text(item) } }
                            }
                        } else { Section { Text(turn.spoken) } }
                        if let confirmation = turn.confirmation {
                            Section("Review proposed changes") {
                                Text(confirmation.prompt)
                                ForEach(Array((turn.visual.tasks ?? []).enumerated()), id: \.offset) { _, detail in Text(detail) }
                                ForEach(Array((turn.executive?.proposedScheduleChanges ?? []).enumerated()), id: \.offset) { _, change in
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(change.title).bold()
                                        Text("From: \(change.before ?? "Unscheduled")")
                                        Text("To: \(change.after) · \(change.durationMin) min")
                                        Text(change.reason).font(.footnote)
                                    }
                                }
                                Button("Approve changes") { Task { await model.ask("yes", accept: true) } }.disabled(model.busy)
                                Button("Keep my current plan", role: .cancel) { Task { await model.ask("no", accept: false) } }.disabled(model.busy)
                            }
                        }
                    }
        }
    }
}
