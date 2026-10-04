import SwiftUI

/// Each module opens with a guide; continuing retains the module's existing navigation.
struct WellnessModuleGuide: View {
    enum Kind: String {
        case calories, pomodoro, moments, shopping
        var column: CGFloat {
            switch self { case .calories: 0; case .pomodoro: 384; case .moments: 768; case .shopping: 1152 }
        }
        var title: String {
            switch self { case .calories: "Calorie Tracker"; case .pomodoro: "Pomodoro Focus"; case .moments: "Moments"; case .shopping: "Shopping List" }
        }
        var subtitle: String {
            switch self {
            case .calories: "Log your meals, reach your goals, and feel your best."
            case .pomodoro: "Stay focused, get more done, one Pomodoro at a time."
            case .moments: "Never miss what matters. We’ll help you remember."
            case .shopping: "Plan smarter, shop easier, and save time."
            }
        }
        var color: Color {
            switch self {
            case .calories: Color(red:0.94,green:0.25,blue:0.03)
            case .pomodoro: .nexdoIndigo
            case .moments: Color(red:0.92,green:0.04,blue:0.36)
            case .shopping: Color(red:0,green:0.55,blue:0.27)
            }
        }
        var steps: [(String,String)] {
            switch self {
            case .calories: [
                ("Log your meals","Quickly add what you eat by search, scan, or voice. We estimate calories and nutrition for you."),
                ("Set your goals","Choose a goal like maintain, lose, or gain. Personalize your daily calorie and macro targets."),
                ("Track progress","See your daily intake, trends, and insights. Get tips to make healthier choices.")]
            case .pomodoro: [
                ("Choose a focus session","Start a 25-minute focused work session. Customize the duration to fit your style."),
                ("Focus without distractions","Work on your task while the timer runs. We’ll keep you on track and remind you to stay focused."),
                ("Take a break and repeat","When the timer ends, take a short break. Repeat cycles to build momentum and accomplish more.")]
            case .moments: [
                ("Add special moments","Save birthdays, anniversaries, festivals, or any occasion that matters to you."),
                ("Get timely reminders","NexDo reminds you ahead of time so you can plan, buy gifts, or prepare a message."),
                ("Take action easily","When it’s time, send a wish, arrange a call to your loved one, or create a greeting card.")]
            case .shopping: [
                ("Create your list","Add items by typing, voice, or from past purchases. You can also explore item suggestions."),
                ("Plan and organize","Group items by category, set a store, and find relevant offers at supported stores."),
                ("Shop and check off","Take your list to the store, check off items as you go, and enjoy a more organized shopping trip.")]
            }
        }
        var benefit: (String,String,String) {
            switch self {
            case .calories: ("Small changes add up","Track consistently, get helpful insights, and build habits that last.","lightbulb.fill")
            case .pomodoro: ("Consistency builds big results","Short, focused sessions help you get more done with less stress.","chart.bar.fill")
            case .moments: ("Stronger relationships, happier you","A small reminder can make someone’s day brighter.","heart.fill")
            case .shopping: ("Save time. Shop smarter.","Stay organized, find better deals, and get more done.","tag.fill")
            }
        }
    }
    let kind: Kind
    let onContinue: () -> Void
    let onHome: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    private let ink = Color(red:0.04,green:0.04,blue:0.19)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:16) {
                    HStack(alignment:.center,spacing:16) {
                        ModuleGuideArtwork(rect:CGRect(x:kind.column+20,y:72,width:105,height:108))
                            .frame(width:76,height:76).clipShape(RoundedRectangle(cornerRadius:22))
                        VStack(alignment:.leading,spacing:8) {
                            Text(kind.title).font(.title2.bold())
                            Text(kind.subtitle).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        }
                    }.padding(.vertical,16)
                    ForEach(0..<kind.steps.count,id:\.self) { index in step(index) }
                    HStack(alignment:.top,spacing:12) {
                        Image(systemName:kind.benefit.2).font(.title2).foregroundStyle(kind.color)
                            .frame(width:32,height:40).accessibilityHidden(true)
                        VStack(alignment:.leading,spacing:6) {
                            Text(kind.benefit.0).font(.subheadline.bold()).foregroundStyle(kind.color)
                            Text(kind.benefit.1).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        }
                    }.padding(18).frame(maxWidth:.infinity,alignment:.leading)
                        .background(kind.color.opacity(0.06),in:RoundedRectangle(cornerRadius:22))
                    Button(action:onContinue) {
                        Text("Got it!").font(.headline).foregroundStyle(.white)
                            .frame(maxWidth:.infinity,minHeight:54)
                            .background(LinearGradient(colors:[kind.color.opacity(0.75),kind.color],startPoint:.topLeading,endPoint:.bottomTrailing),in:Capsule())
                    }.buttonStyle(.plain).accessibilityIdentifier("module-guide-continue")
                    Button("Back to Home",action:onHome).font(.headline)
                        .frame(maxWidth:.infinity,minHeight:44).accessibilityIdentifier("module-guide-home")
                }.padding(18).frame(maxWidth:650).frame(maxWidth:.infinity)
            }
            .foregroundStyle(ink)
            .background(LinearGradient(colors:[kind.color.opacity(0.13),Color.white,kind.color.opacity(0.05)],startPoint:.topLeading,endPoint:.bottomTrailing).ignoresSafeArea())
            .navigationTitle("How It Works").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement:.cancellationAction) {
                Button("Back",systemImage:"chevron.left",action:onHome)
            } }
        }.tint(kind.color).accessibilityIdentifier("module-guide-\(kind.rawValue)")
    }
    private func step(_ index:Int) -> some View {
        HStack(alignment:.top,spacing:10) {
            Text("\(index+1)").font(.title3.bold()).foregroundStyle(kind.color)
                .frame(width:32,height:32).background(kind.color.opacity(0.1),in:Circle())
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:12)) : AnyLayout(HStackLayout(alignment:.center,spacing:8))
            layout {
                VStack(alignment:.leading,spacing:8) {
                    Text(kind.steps[index].0).font(.subheadline.bold())
                    Text(kind.steps[index].1).font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                        .fixedSize(horizontal:false,vertical:true)
                }.frame(maxWidth:.infinity,alignment:.leading)
                ModuleGuideArtwork(rect:CGRect(x:kind.column+CGFloat([20,136,252][index]),y:429,width:116,height:153))
                    .frame(width:typeSize.isAccessibilitySize ? 150:92,height:typeSize.isAccessibilitySize ? 160:122)
                    .clipShape(RoundedRectangle(cornerRadius:14))
            }
        }.padding(14).frame(maxWidth:.infinity,alignment:.leading)
            .background(.white.opacity(0.94),in:RoundedRectangle(cornerRadius:24))
    }
}
private struct ModuleGuideArtwork: View {
    let rect: CGRect
    private static let source = UIImage(named:"module-guide-pack")?.cgImage
    var body: some View {
        if let source=Self.source,let region=source.cropping(to:rect) {
            Image(decorative:region,scale:1).resizable().interpolation(.high).scaledToFit().accessibilityHidden(true)
        }
    }
}

/// Own presentation state inside the cover so every new module tap starts at its guide.
struct WellnessModuleEntrance<Content:View>: View {
    let kind:WellnessModuleGuide.Kind
    let onHome:()->Void
    @ViewBuilder var content:()->Content
    @State private var continued=false
    var body:some View {
        if continued { content() }
        else { WellnessModuleGuide(kind:kind,onContinue:{ continued=true },onHome:onHome) }
    }
}
