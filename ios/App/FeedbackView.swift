import SwiftUI

struct FeedbackView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var stars = 0
    @State private var submissionID = UUID()
    @State private var saving = false
    @State private var submitted = false
    @State private var failure: String?
    @FocusState private var editing: Bool
    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.utf16.count <= 160 &&
        !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && description.utf16.count <= 5000 && (1...5).contains(stars)
    }
    var body: some View {
        Form {
            Section("Title") {
                TextField("What would you like to share?", text: $title).focused($editing)
                    .accessibilityIdentifier("feedback.title")
                Text("\(title.utf16.count)/160").font(.caption).foregroundStyle(title.utf16.count > 160 ? .red : .secondary)
            }
            Section("Description") {
                TextField("Tell us about your experience or suggestion…", text: $description, axis: .vertical)
                    .lineLimit(5...12).focused($editing).accessibilityIdentifier("feedback.description")
                Text("\(description.utf16.count)/5000").font(.caption).foregroundStyle(description.utf16.count > 5000 ? .red : .secondary)
            }
            Section("Your rating") {
                HStack(spacing: 4) {
                    ForEach(1...5, id: \.self) { value in
                        Button { stars = value } label: {
                            Image(systemName: value <= stars ? "star.fill" : "star")
                                .font(.title2).foregroundStyle(value <= stars ? Color.orange : Color.nexdoSecondary)
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }.buttonStyle(.plain).accessibilityLabel("\(value) \(value == 1 ? "star" : "stars")")
                            .accessibilityAddTraits(value == stars ? .isSelected : [])
                            .accessibilityIdentifier("feedback.star.\(value)")
                    }
                }
                Text(stars == 0 ? "Choose 1 to 5 stars." : "\(stars) out of 5 stars").font(.caption).foregroundStyle(.secondary)
            }
            if let failure { Text(failure).foregroundStyle(.red) }
            Button { Task { await submit() } } label: {
                HStack {
                    if saving { ProgressView().tint(.white) }
                    Text(saving ? "Submitting…" : "Submit feedback")
                }.frame(maxWidth: .infinity)
            }.buttonStyle(NexdoGradientButtonStyle()).disabled(!valid || saving || submitted)
                .accessibilityIdentifier("feedback.submit")
        }
        .disabled(saving || submitted)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Feedback").navigationBarTitleDisplayMode(.inline)
        // Return adds a newline in the description, so the keyboard needs its own way out; it covered the rating and Submit.
        .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { editing = false }.accessibilityIdentifier("feedback.keyboardDone") } }
        .navigationBarBackButtonHidden(saving)
        .interactiveDismissDisabled(saving)
        .alert("Thank you for your feedback!", isPresented: $submitted) {
            Button("Done") { dismiss() }
        } message: {
            Text("Your feedback has been received. Thank you for helping us make Nexdo better.")
        }
    }
    @MainActor private func submit() async {
        guard valid, !saving else { return }
        editing = false; saving = true; failure = nil
        defer { saving = false }
        do {
            try await model.submitFeedback(id: submissionID, title: title.trimmingCharacters(in: .whitespacesAndNewlines), description: description.trimmingCharacters(in: .whitespacesAndNewlines), stars: stars)
            submitted = true
        } catch { failure = error.localizedDescription }
    }
}
