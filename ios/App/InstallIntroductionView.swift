import SwiftUI

/// Device-local introduction. Completion is stored by RootView in app-container defaults,
/// not Keychain or the account, so a fresh installation starts at page one.
struct InstallIntroductionView: View {
    var finish: (_ signUp: Bool) -> Void
    @State private var page = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let blue = Color(red: 0.05, green: 0.32, blue: 1)
    private let ink = Color(red: 0.03, green: 0.04, blue: 0.20)
    private let headings = ["Less on your mind.", "Just Ask.", "One App.", "More Time for"]
    private let accents = ["More done in your day.", "NexDo Takes Action.", "So Many Ways to\nMake Life Easier.", "What Matters."]
    private let descriptions = [
        "Your AI-powered daily assistant that brings your tasks, calendar, and everyday life together.",
        "Speak naturally to create tasks, plan your day, find answers, and get things done — with less effort.",
        "Plan smarter, shop easier, stay focused, and never miss the moments that matter.",
        "Stay organized, accomplish more, and enjoy life’s special moments with NexDo."
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button("Skip") { finish(true) }
                    .font(.body.weight(.medium)).padding(.horizontal, 24)
                    .frame(minHeight: 44).accessibilityIdentifier("intro.skip")
            }
            TabView(selection: $page) {
                ForEach(0..<4) { index in
                    ScrollView {
                        VStack(spacing: 18) {
                            if index == 0 {
                                HStack(spacing: 10) {
                                    Image(systemName: "sparkle").foregroundStyle(blue.gradient)
                                    Text("NexDo").foregroundStyle(ink)
                                }.font(.largeTitle.bold()).padding(.top, 6)
                            }
                            VStack(spacing: 3) {
                                Text(headings[index]).foregroundStyle(ink)
                                Text(accents[index]).foregroundStyle(LinearGradient(colors: [blue, .purple], startPoint: .leading, endPoint: .trailing))
                            }
                            .font(.largeTitle.bold()).multilineTextAlignment(.center)
                            .padding(.horizontal, 16).accessibilityAddTraits(.isHeader)
                            Text(descriptions[index]).font(.title3)
                                .foregroundStyle(Color(red: 0.29, green: 0.35, blue: 0.50))
                                .multilineTextAlignment(.center).padding(.horizontal, 28)
                            if index == 2 { features }
                            artwork(index)
                        }.padding(.top, 8)
                    }.tag(index).accessibilityIdentifier("intro.page.\(index + 1)")
                }
            }.tabViewStyle(.page(indexDisplayMode: .never))
            footer
        }
        .background(Color.white.ignoresSafeArea())
        .tint(blue)
        // Artwork is supplied on a light canvas; keep status-bar and controls legible together.
        .preferredColorScheme(.light)
    }

    private var footer: some View {
        VStack(spacing: 12) {
            if page == 3 {
                Button { finish(true) } label: {
                    HStack { Text("Get Started"); Image(systemName: "arrow.right") }
                        .font(.title3.bold()).frame(maxWidth: .infinity).padding(18)
                        .foregroundStyle(.white)
                        .background(LinearGradient(colors: [blue, .purple], startPoint: .leading, endPoint: .trailing), in: Capsule())
                }.accessibilityIdentifier("intro.getStarted")
                Button { finish(false) } label: {
                    (Text("Already have an account? ").foregroundColor(.secondary) + Text("Sign In").underline())
                        .font(.body).frame(minHeight: 44)
                }.accessibilityIdentifier("intro.signIn")
            }
            HStack {
                if page < 3 { Color.clear.frame(width: 80, height: 1).accessibilityHidden(true) }
                Spacer(minLength: 0)
                HStack(spacing: 12) {
                    ForEach(0..<4) { index in
                        Button { select(index) } label: {
                            Circle().fill(index == page ? blue : Color.gray.opacity(0.35))
                                .frame(width: 10, height: 10).frame(width: 32, height: 44)
                        }
                        .accessibilityLabel("Page \(index + 1) of 4")
                        .accessibilityAddTraits(index == page ? [.isSelected] : [])
                    }
                }
                Spacer(minLength: 0)
                if page < 3 {
                    Button { select(page + 1) } label: {
                        HStack { Text("Next"); Image(systemName: "arrow.right") }
                            .font(.headline).frame(minWidth: 80, minHeight: 44)
                    }.accessibilityIdentifier("intro.next")
                }
            }
        }.padding(.horizontal, 24).padding(.vertical, 8).background(.white)
    }

    private func select(_ index: Int) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { page = index }
    }

    private func artwork(_ index: Int) -> some View {
        // Display only the illustration region of the supplied designs. Their status bars,
        // headings, pagination and buttons are replaced by native, accessible UI.
        let top: CGFloat = [720, 575, 1290, 500][index]
        let bottom: CGFloat = [1855, 1840, 1855, 1530][index]
        return IntroductionArtwork(name: "first-launch-\(index + 1)", sourceSize: CGSize(width: 784, height: 2007), region: CGRect(x: 0, y: top, width: 784, height: bottom - top))
            .accessibilityLabel([
                "NexDo brings tasks, calendar, shopping and moments into one place.",
                "Example: ask to call the dentist tomorrow at 9 AM, or find nearby grocery stores for your shopping list.",
                "Your tasks and schedule together in My Day.",
                "More time to relax. Shop smarter, stay organized, focus better and capture moments."
            ][index])
    }

    private var features: some View {
        let titles = ["Smart To-Do’s", "Calendar & Reminders", "Shopping Lists", "Everyday Essentials"]
        let details = ["Capture, organize and get things done with AI.", "Keep your schedule in sync and never miss a thing.", "Plan, organize and even send to nearby stores.", "Stay focused, track meals, capture moments and more."]
        let regions = [CGRect(x: 810, y: 283, width: 110, height: 100), CGRect(x: 998, y: 283, width: 112, height: 100), CGRect(x: 810, y: 480, width: 110, height: 108), CGRect(x: 998, y: 480, width: 112, height: 108)]
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 10)], spacing: 10) {
            ForEach(0..<4) { index in
                VStack(spacing: 8) {
                    IntroductionArtwork(name: "first-launch-5", sourceSize: CGSize(width: 1536, height: 1024), region: regions[index])
                        .frame(width: 85).accessibilityHidden(true)
                    Text(titles[index]).font(.headline).foregroundStyle(ink)
                    Text(details[index]).font(.subheadline).foregroundStyle(.secondary)
                }.multilineTextAlignment(.center).frame(maxWidth: .infinity)
                    .padding(12).background([Color.blue, .pink, .green, .purple][index].opacity(0.07), in: RoundedRectangle(cornerRadius: 24))
            }
        }.padding(.horizontal, 20)
    }
}

/// Native layout crops the original reference asset without baking in navigation controls.
private struct IntroductionArtwork: View {
    let name: String
    let sourceSize: CGSize
    let region: CGRect
    var body: some View {
        Color.clear.aspectRatio(region.width / region.height, contentMode: .fit)
            .overlay {
                GeometryReader { geometry in
                    let scale = geometry.size.width / region.width
                    Image(name).resizable().interpolation(.high)
                        .frame(width: sourceSize.width * scale, height: sourceSize.height * scale)
                        .offset(x: -region.minX * scale, y: -region.minY * scale)
                }
            }.clipped().accessibilityElement(children: .ignore)
    }
}
