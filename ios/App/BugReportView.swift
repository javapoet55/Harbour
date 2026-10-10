import SwiftUI
import UIKit

struct BugReportView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ObservedObject private var coordinator = BugReportCoordinator.shared
    let diagnostics: BugDiagnostics
    let capture: () -> Data?
    let onDone: () -> Void
    var submitOverride: ((BugReportInput) async throws -> String)? = nil
    @State private var draft = BugReportDraft()
    @State private var editing = false
    @State private var sending = false
    @State private var reference: String?
    @State private var error: String?
    @State private var consent = false
    @State private var discard = false
    @State private var expanded = false
    @State private var copied = false
    private let accent = Color(red: 0.39, green: 0.40, blue: 0.95)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    if let reference { success(reference) }
                    else if editing { form }
                    else { introduction }
                }.padding(20).frame(maxWidth: 650).frame(maxWidth: .infinity)
            }
            .accessibilityHidden(sending)
            .scrollDismissesKeyboard(.interactively)
            .background {
                Color(uiColor: .systemGroupedBackground).ignoresSafeArea()
                LinearGradient(colors: [accent.opacity(0.10), .clear, accent.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
            }
            .safeAreaInset(edge: .bottom) {
                Button(reference != nil ? "Done" : editing ? (error != nil && draft.frozen != nil ? "Retry Send" : "Send") : "Report Bug") {
                    if reference != nil { finish() }
                    else if editing { send() }
                    else { editing = true }
                }
                .font(.headline).foregroundStyle(.white).frame(maxWidth: .infinity).padding(16)
                .background((reference == nil && editing && !draft.valid) ? Color.gray : accent, in: Capsule())
                .disabled(sending || (reference == nil && editing && !draft.valid))
                .accessibilityIdentifier("bug.primary").padding(.horizontal, 20).padding(.vertical, 10)
                .background(.regularMaterial)
            }
            .navigationTitle(editing && reference == nil ? "Report app issue" : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if editing && reference == nil {
                        Button("Back", systemImage: "chevron.left") { editing = false }.labelStyle(.iconOnly).disabled(sending)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close", systemImage: "xmark") {
                        if !draft.description.isEmpty && reference == nil { discard = true } else { finish() }
                    }.labelStyle(.iconOnly).disabled(sending)
                }
            }
            .overlay {
                if sending {
                    ZStack {
                        Color.black.opacity(0.3).ignoresSafeArea()
                        VStack(spacing: 20) { ProgressView().controlSize(.large); Text("Sending report...").font(.headline) }
                            .padding(32).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
                    }.accessibilityIdentifier("bug.sending").accessibilityAddTraits(.updatesFrequently)
                }
            }
            .alert("Include a screenshot?", isPresented: $consent) {
                Button("Include Screenshot") { takeScreenshot() }
                Button("Cancel", role: .cancel) {}
            } message: { Text("Capture the app screen behind this report. Review the preview for private information. It will only be uploaded when you tap Send. Never include passwords, keys or tokens.") }
            .confirmationDialog("Discard this report?", isPresented: $discard, titleVisibility: .visible) {
                Button("Discard Report", role: .destructive) { finish() }
                Button("Keep Report", role: .cancel) {}
            }
        }.tint(accent).interactiveDismissDisabled()
    }
    private var introduction: some View {
        VStack(spacing: 22) {
            HStack(spacing: 12) {
                Image(systemName: "calendar.badge.checkmark").font(.title).foregroundStyle(.white).padding(12).background(accent.gradient, in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text("NexDo").font(.title2.bold())
                    Text("Less on your mind, more done in your day.").font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            BugArtwork(success: false).accessibilityHidden(true)
            Text("Report a bug?").font(.largeTitle.bold()).multilineTextAlignment(.center)
            Text("If something isn’t working correctly, you can report it to help us improve NexDo for everyone.").foregroundStyle(.secondary).multilineTextAlignment(.center)
            Toggle(isOn: Binding(get: { coordinator.shakeEnabled }, set: { coordinator.setShake($0) })) {
                Label("Shake iPhone to report a bug", systemImage: "iphone.gen3.radiowaves.left.and.right")
            }.padding().background(.background, in: RoundedRectangle(cornerRadius: 18))
            Label("Thank you! Your feedback helps make NexDo better for everyone.", systemImage: "heart.fill")
                .padding().background(accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 18))
            Text("Together we make NexDo better!").font(.title3.italic()).foregroundStyle(accent)
        }
    }
    private var form: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("What happened?").font(.headline)
            Text("Tell us about the issue you encountered. Do not include passwords, API keys, tokens or unrelated personal information.").font(.footnote).foregroundStyle(.secondary)
            TextEditor(text: $draft.description).frame(minHeight: 160).padding(8)
                .background(.background, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(accent.opacity(0.2)))
                .accessibilityLabel("Issue description").accessibilityIdentifier("bug.description")
                .disabled(draft.frozen != nil)
                .onChange(of: draft.description) { _, value in
                    if value.utf16.count > 2000 {
                        var limited = value
                        while limited.utf16.count > 2000 { limited.removeLast() }
                        draft.description = limited
                    }
                }
            Text("\(draft.description.utf16.count) / 2000").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .trailing)
            Toggle("Include screenshot in report", isOn: Binding(get: { draft.screenshotConsent }, set: {
                if $0 { consent = true } else { draft.removeScreenshot() }
            })).disabled(draft.frozen != nil).accessibilityIdentifier("bug.screenshot")
            if let bytes = draft.screenshot, let image = UIImage(data: bytes) {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack { preview(image); screenshotActions }
                } else {
                    HStack(spacing: 16) { preview(image); screenshotActions.frame(maxWidth: .infinity, alignment: .leading) }
                }
            } else {
                Label("Optional. Capture the original app screen, then review it before sending.", systemImage: "iphone").font(.footnote).foregroundStyle(.secondary)
            }
            DisclosureGroup("What we’ll include", isExpanded: $expanded) {
                VStack(alignment: .leading, spacing: 10) {
                    diagnostic("App version and build", "\(diagnostics.appVersion) (\(diagnostics.buildNumber))")
                    diagnostic("Device model", diagnostics.deviceModel)
                    diagnostic("iOS version", diagnostics.iosVersion)
                    diagnostic("Current app screen", diagnostics.screen)
                    diagnostic("Timestamp", diagnostics.timestamp)
                    diagnostic("Anonymous correlation ID", diagnostics.correlationID)
                }.padding(.top, 12)
            }.padding().background(.background, in: RoundedRectangle(cornerRadius: 18))
            Label("Reports are kept for 90 days and screenshots for 7 days. No full logs or screen recordings are collected.", systemImage: "checkmark.shield.fill").font(.footnote).foregroundStyle(.secondary)
            Link("Contact support", destination: URL(string: "mailto:support@nexdoapp.com")!)
            if let error {
                Text(error).foregroundStyle(.red).accessibilityIdentifier("bug.error")
                if draft.frozen != nil { Text("Your report is preserved. Retry sends the same report safely.").font(.footnote) }
            }
        }
    }
    private func diagnostic(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading) { Text(label).font(.subheadline.bold()); Text(value).font(.caption).textSelection(.enabled) }
    }
    private func preview(_ image: UIImage) -> some View {
        Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: 145, maxHeight: 260)
            .clipShape(RoundedRectangle(cornerRadius: 12)).accessibilityLabel("Screenshot preview of original app screen")
    }
    private var screenshotActions: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Screenshot captured", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
            Text("Review for private information before sending.").font(.caption)
            Button("Retake", systemImage: "arrow.clockwise") { consent = true }
            Button("Remove Screenshot", systemImage: "trash", role: .destructive) { draft.removeScreenshot() }
        }.disabled(draft.frozen != nil)
    }
    private func success(_ ref: String) -> some View {
        VStack(spacing: 24) {
            BugArtwork(success: true).accessibilityHidden(true)
            Text("Thanks for helping improve NexDo!").font(.largeTitle.bold()).multilineTextAlignment(.center)
            Text("Your bug report has been received.").multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 10) {
                Label("Reference ID", systemImage: "checkmark.circle.fill").font(.headline)
                Text(ref).font(.callout.monospaced()).textSelection(.enabled).accessibilityIdentifier("bug.reference")
                Button(copied ? "Reference copied" : "Copy reference", systemImage: "doc.on.doc") {
                    UIPasteboard.general.setItems([["public.utf8-plain-text": ref]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)])
                    copied = true
                }
            }.padding().frame(maxWidth: .infinity).background(accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 18))
        }
    }
    private func takeScreenshot() {
        guard let bytes = capture() else { error = "Screenshot unavailable on this screen. You can still send your description."; return }
        draft.includeScreenshot(bytes); error = nil
    }
    private func send() {
        guard !sending, let input = draft.submission(metadata: diagnostics) else { return }
        sending = true; error = nil
        Task { @MainActor in
            do {
                if let submitOverride { reference = try await submitOverride(input) }
                else { reference = try await model.submitBugReport(input).reference }
                draft.clear()
            } catch { self.error = BugReportFailure.message(for: error) }
            sending = false
        }
    }
    private func finish() { draft.clear(); onDone() }
}

// Use the supplied atlas unchanged. Text and controls remain native and scalable.
private struct BugArtwork: View {
    let success: Bool
    var body: some View {
        let rect = success ? CGRect(x: 166, y: 776, width: 110, height: 108) : CGRect(x: 27, y: 776, width: 131, height: 108)
        let scale: CGFloat = 1.3
        Image("bug-report-pack").resizable().frame(width: 1536 * scale, height: 1024 * scale)
            .offset(x: -rect.minX * scale, y: -rect.minY * scale)
            .frame(width: rect.width * scale, height: rect.height * scale, alignment: .topLeading).clipped()
            .clipShape(RoundedRectangle(cornerRadius: 24))
    }
}

#if DEBUG
struct BugReportPreview: View {
    @State private var attempts = 0
    @State private var done = false
    var body: some View {
        if done { Text("Report closed") }
        else {
            BugReportView(diagnostics: BugReportCoordinator.diagnostics(screen: "tasks"), capture: {
                let renderer = UIGraphicsImageRenderer(size: CGSize(width: 200, height: 400))
                return renderer.image { context in
                    UIColor.systemBackground.setFill(); context.fill(CGRect(x: 0, y: 0, width: 200, height: 400))
                    ("Original Tasks Screen" as NSString).draw(at: CGPoint(x: 10, y: 40), withAttributes: [.foregroundColor: UIColor.label])
                }.jpegData(compressionQuality: 0.7)
            }, onDone: { done = true }, submitOverride: { input in
                attempts += 1
                try await Task.sleep(for: .seconds(4))
                if ProcessInfo.processInfo.arguments.contains("-bug-failure"), attempts == 1 { throw URLError(.notConnectedToInternet) }
                return "BR-" + input.id.replacingOccurrences(of: "-", with: "").uppercased()
            })
        }
    }
}
#endif

#if DEBUG
struct BugReportCapturePreview: View {
    @StateObject private var model = AppModel()
    var body: some View {
        VStack(spacing: 30) {
            Text("ORIGINAL TASKS SCREEN").font(.title.bold())
            Label("Buy groceries", systemImage: "checkmark.square")
            Button("Open Report Bugs") {
                model.profile = Profile(id: "bug-capture-preview", name: "Test", email: "test@example.test", timeZone: "America/Los_Angeles")
                BugReportCoordinator.shared.configure(model: model, active: true)
                BugReportCoordinator.shared.open(from: "tasks")
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.blue.opacity(0.12))
    }
}
#endif
