import SwiftUI

/// Renders server-grounded sections without synthesizing counts or changing ranges.
struct AskResponseView: View {
    @EnvironmentObject private var model: AppModel
    var readingSection: Int? = nil
    var preparingSpeech = false
    var readLoud: ((Int, String) -> Void)? = nil
    @State private var expandedSections: Set<Int> = []

    var body: some View {
        if let turn = model.turn {
            VStack(alignment: .leading, spacing: 12) {
                AskResponseSummary(text: turn.visual.summary)
                ForEach(Array(turn.displaySections.enumerated()), id: \.offset) { sectionIndex, section in
                    let expanded = expandedSections.contains(sectionIndex)
                    let previewCount = sectionIndex == 0 ? min(2, section.items.count) : 0
                    let visibleItems = expanded ? section.items : Array(section.items.prefix(previewCount))
                    AskResponseCard(title: section.title, itemCount: section.items.count, expanded: expanded, toggleAction: { toggle(sectionIndex) }, reading: readingSection == sectionIndex, preparing: preparingSpeech && readingSection == sectionIndex, readAction: readLoud.map { action in { action(sectionIndex, section.items.joined(separator: "\n\n")) } }) {
                        if visibleItems.isEmpty {
                            Text("Tap to view the details.")
                                .font(.subheadline).foregroundStyle(AskStyle.secondary)
                                .padding(.vertical, 4)
                        }
                        ForEach(Array(visibleItems.enumerated()), id: \.offset) { index, item in
                            if index > 0 { Divider().overlay(AskStyle.blue.opacity(0.06)) }
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: "circle.fill").font(.system(size: 5)).foregroundStyle(AskStyle.blue).padding(.top, 7).accessibilityHidden(true)
                                Text(item).frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                            }.padding(.vertical, 5)
                        }
                        if section.items.count > previewCount && !expanded {
                            Button("Show \(section.items.count - previewCount) more") { toggle(sectionIndex) }
                                .font(.subheadline.weight(.semibold)).foregroundStyle(AskStyle.blue)
                                .frame(minHeight: 36)
                        } else if expanded && section.items.count > previewCount {
                            Button("Show less") { toggle(sectionIndex) }
                                .font(.subheadline.weight(.semibold)).foregroundStyle(AskStyle.blue)
                                .frame(minHeight: 36)
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

    private func toggle(_ section: Int) {
        if expandedSections.contains(section) { expandedSections.remove(section) }
        else { expandedSections.insert(section) }
    }
}

private struct AskResponseSummary: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "sparkles").foregroundStyle(AskStyle.blue).padding(.top, 2)
            Text(text).font(.subheadline.weight(.medium)).foregroundStyle(AskStyle.ink)
                .lineLimit(3).fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .background(AskStyle.blue.opacity(0.09), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct AskResponseCard<Content: View>: View {
    let title: String
    var itemCount = 0
    var expanded = false
    var toggleAction: (() -> Void)? = nil
    var reading = false
    var preparing = false
    var readAction: (() -> Void)? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button(action: { toggleAction?() }) {
                    HStack(spacing: 7) {
                        Text(title.uppercased()).font(.caption.weight(.bold))
                        if itemCount > 0 { Text("\(itemCount)").font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 2).background(AskStyle.blue.opacity(0.12), in: Capsule()) }
                        Image(systemName: expanded ? "chevron.up" : "chevron.down").font(.caption2.weight(.bold))
                    }
                    .accessibilityAddTraits(.isHeader)
                }
                .buttonStyle(.plain)
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
