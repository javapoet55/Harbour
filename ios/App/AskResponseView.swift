import SwiftUI

/// Renders server-grounded sections without synthesizing counts or changing ranges.
struct AskResponseView: View {
    @EnvironmentObject private var model: AppModel
    var readingSection: Int? = nil
    var preparingSpeech = false
    var readLoud: ((Int, String) -> Void)? = nil

    var body: some View {
        if let turn = model.turn {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(turn.displaySections.enumerated()), id: \.offset) { sectionIndex, section in
                    AskResponseCard(title: section.title, reading: readingSection == sectionIndex, preparing: preparingSpeech && readingSection == sectionIndex, readAction: readLoud.map { action in { action(sectionIndex, section.items.joined(separator: "\n\n")) } }) {
                        ForEach(Array(section.items.enumerated()), id: \.offset) { index, item in
                            if index > 0 { Divider().overlay(AskStyle.blue.opacity(0.06)) }
                            HStack(alignment: .top, spacing: 8) {
                                Text("•").foregroundStyle(AskStyle.blue).accessibilityHidden(true)
                                Text(item).frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                            }.padding(.vertical, 5)
                        }
                    }
                }

                if let confirmation = turn.confirmation {
                    AskResponseCard(title: "Review proposed changes") {
                        Text(confirmation.prompt).padding(.bottom, 8)
                        ForEach(Array((turn.executive?.proposedScheduleChanges ?? []).enumerated()), id: \.offset) { _, change in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(change.title).fontWeight(.semibold)
                                Text("From: \(change.before ?? "Unscheduled")")
                                Text("To: \(change.after) · \(change.durationMin) min")
                                Text(change.reason).foregroundStyle(AskStyle.secondary)
                            }.padding(.vertical, 8)
                        }
                        Button("Approve changes") { Task { await model.ask("yes", accept: true) } }
                            .buttonStyle(.borderedProminent).frame(minHeight: 44).disabled(model.busy)
                        Button("Keep my current plan", role: .cancel) { Task { await model.ask("no", accept: false) } }
                            .frame(minHeight: 44).disabled(model.busy)
                    }
                }
            }
        }
    }
}

private struct AskResponseCard<Content: View>: View {
    let title: String
    var reading = false
    var preparing = false
    var readAction: (() -> Void)? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(title.uppercased()).font(.caption.weight(.bold))
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                if let readAction {
                    Button(action: readAction) {
                        HStack(spacing: 5) {
                            if preparing { ProgressView().controlSize(.mini) }
                            Image(systemName: reading ? "stop.fill" : "speaker.wave.2.fill")
                            Text(reading ? "Stop" : "Read Loud")
                        }.font(.caption.weight(.semibold)).frame(minHeight: 44)
                    }.buttonStyle(.plain)
                        .accessibilityLabel(reading ? "Stop reading" : "Read \(title) aloud")
                        .accessibilityHint("Uses an AI-generated voice")
                }
            }
            .foregroundStyle(AskStyle.blue).padding(.horizontal, 14).padding(.vertical, 3)
            .background(AskStyle.blue.opacity(0.055))
            VStack(alignment: .leading, spacing: 0, content: content)
                .font(.subheadline).foregroundStyle(Color.nexdoInk)
                .padding(.horizontal, 14).padding(.vertical, 7)
        }
        .background(AskStyle.background)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(AskStyle.blue.opacity(0.16)))
    }
}
