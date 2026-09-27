import SwiftUI

/// Presentation-only prototype. No calls, notifications, network requests or persistence.
struct CalorieTrackerView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var page: Page = .intro
    @State private var history: [Page] = []
    @State private var callTime = Calendar.current.date(from: DateComponents(hour: 20)) ?? Date()
    @State private var timeZone = "Pacific Time (PT)"
    @State private var repeatDaily = true
    @State private var noAnswer = "Notify me"
    @State private var calorieGoal = 2000
    @State private var goals = [150, 250, 67, 25, 1000, 18, 800, 1000]
    @State private var period = "Today"
    @State private var insightsTab = "Insights"
    @State private var selectedDate = Date()
    @State private var notice: String?
    @State private var editingFood = false
    @State private var foodName = ""
    @State private var foodCalories = ""
    @State private var meal = "Breakfast"
    @State private var foods = Food.samples
    private let ink = Color(red: 0.06, green: 0.07, blue: 0.28)
    private let gradient = LinearGradient(colors: [.purple, .indigo, .blue], startPoint: .leading, endPoint: .trailing)
    private let labels = ["Protein", "Carbs", "Fats", "Fiber", "Calcium", "Iron", "Vitamin D", "Omega-3"]
    private let units = ["g", "g", "g", "g", "mg", "mg", "IU", "mg"]
    private let symbols = ["circle.hexagongrid.fill", "carrot.fill", "drop.fill", "leaf.fill", "drop.fill", "flame.fill", "sun.max.fill", "fish.fill"]
    private let colors: [Color] = [.pink, .orange, .yellow, .green, .blue, .red, .orange, .blue]
    private let intake = [82, 180, 52, 12, 600, 10, 400, 300]
    private var total: Int { foods.reduce(0) { $0 + $1.calories } }
    private var ratio: Double { min(Double(total) / Double(calorieGoal), 1) }
    private var title: String {
        switch page {
        case .intro: "Create Agent"
        case .time, .goals: "Daily Food Check-in"
        case .confirm: "Review & Confirm"
        case .ready: "Agent Preview"
        case .dashboard: "Nutrition"
        case .insights: "Nutrition Insights"
        case .log: "Today's Food Log"
        }
    }
    enum Page { case intro, time, goals, confirm, ready, dashboard, insights, log }
    struct Food: Identifiable {
        let id = UUID()
        var name: String
        var calories: Int
        var meal: String
        static let samples = [
            Food(name: "🥚  2 eggs", calories: 140, meal: "Breakfast"),
            Food(name: "🍞  Whole wheat toast (2 slices)", calories: 160, meal: "Breakfast"),
            Food(name: "☕  Coffee with a little milk", calories: 25, meal: "Breakfast"),
            Food(name: "🍌  Banana", calories: 105, meal: "Breakfast"),
            Food(name: "🍲  Chicken biryani (1.5 cups)", calories: 650, meal: "Lunch"),
            Food(name: "🥜  Almonds (small handful)", calories: 170, meal: "Snacks"),
            Food(name: "🐟  Grilled salmon", calories: 180, meal: "Dinner")
        ]
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    if let previous = history.popLast() { page = previous } else { dismiss() }
                } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                    .accessibilityLabel("Back")
                Spacer()
                Text(title).font(.headline)
                Spacer()
                Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                    .accessibilityLabel("Close calorie tracker")
            }.padding(.horizontal, 12)
            Text("UI Preview · Sample data · No calls are scheduled")
                .font(.caption).foregroundStyle(.secondary).padding(.bottom, 8)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch page {
                    case .intro: intro
                    case .time: timeSetup
                    case .goals: goalSetup
                    case .confirm: confirmation
                    case .ready: ready
                    case .dashboard: dashboard
                    case .insights: insights
                    case .log: foodLog
                    }
                }.padding(20).frame(maxWidth: 650).frame(maxWidth: .infinity)
            }.id(page)
        }
        .foregroundStyle(ink)
        .background(LinearGradient(colors: [Color.purple.opacity(0.065), .white, Color.blue.opacity(0.055)], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea())
        .alert("Calorie Tracker Preview", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK", role: .cancel) { notice = nil }
        } message: { Text(notice ?? "") }
        .sheet(isPresented: $editingFood) { foodEditor }
    }
    private func go(_ next: Page) { history.append(page); page = next }
    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14, content: content)
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(.indigo.opacity(0.08)))
            .shadow(color: .indigo.opacity(0.04), radius: 10, y: 4)
    }
    private func primary(_ text: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text).font(.headline).foregroundStyle(.white).frame(maxWidth: .infinity).padding(16)
                .background(gradient, in: RoundedRectangle(cornerRadius: 16))
        }.buttonStyle(.plain)
    }
    private func icon(_ name: String, _ color: Color) -> some View {
        Image(systemName: name).font(.title2).foregroundStyle(color)
            .frame(width: 46, height: 46).background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
            .accessibilityHidden(true)
    }
    private func feature(_ symbol: String, _ color: Color, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            icon(symbol, color)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }.padding(.vertical, 8)
    }
    private var intro: some View {
        Group {
            CaloriePackArt().frame(height: 165).accessibilityHidden(true)
            Text("Daily Food Check-in").font(.title2.bold()).frame(maxWidth: .infinity)
            Text("Build a daily habit. Plan a check-in, track meals and explore your nutrition goals.")
                .foregroundStyle(.secondary).multilineTextAlignment(.center)
            feature("phone.fill", .green, "AI calls you daily", "Preview a natural conversation about your meals and snacks.")
            feature("chart.bar.fill", .purple, "Tracks calories & nutrients", "See how your daily meals fit your nutrition goals.")
            feature("lightbulb.fill", .orange, "Personalized insights", "Explore progress and food ideas in the sample dashboard.")
            primary("Set Up Agent") { go(.time) }
            Button("Explore sample dashboard") { go(.dashboard) }.frame(maxWidth: .infinity)
            Button("Learn more") { notice = "This is a design preview. Check-in calls, nutrition calculations and saved history will be connected in a future release." }.frame(maxWidth: .infinity)
        }
    }
    private func steps(_ current: Int) -> some View {
        HStack {
            ForEach(0..<3) { index in
                VStack(spacing: 6) {
                    Text("\(index + 1)").font(.headline).frame(width: 32, height: 32)
                        .foregroundStyle(index == current ? .white : .indigo)
                        .background(index == current ? Color.indigo : Color.indigo.opacity(0.08), in: Circle())
                    Text(["Time", "Goals", "Confirm"][index]).font(.caption)
                }.frame(maxWidth: .infinity)
            }
        }.padding(14).background(.indigo.opacity(0.04), in: RoundedRectangle(cornerRadius: 18))
    }
    private var timeSetup: some View {
        Group {
            steps(0)
            Text("When should NexDo call you?").font(.title3.bold())
            Text("Choose a time for your daily meal check-in.").foregroundStyle(.secondary)
            card {
                DatePicker("Call time", selection: $callTime, displayedComponents: .hourAndMinute).tint(.indigo)
                Divider()
                Picker("Time zone", selection: $timeZone) {
                    ForEach(["Pacific Time (PT)", "Mountain Time (MT)", "Central Time (CT)", "Eastern Time (ET)", "UTC"], id: \.self) { Text($0) }
                }.tint(.indigo)
                Divider()
                Toggle("Repeat every day", isOn: $repeatDaily).tint(.indigo)
            }
            Text("If I don’t answer").font(.headline)
            card {
                ForEach(["Notify me", "Retry once", "Skip for today"], id: \.self) { choice in
                    Button { noAnswer = choice } label: {
                        HStack {
                            Image(systemName: noAnswer == choice ? "checkmark.circle.fill" : "circle").foregroundStyle(.indigo)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(choice).font(.headline)
                                Text(choice == "Notify me" ? "Send a notification with options." : choice == "Retry once" ? "Call again in 15 minutes." : "No further action.").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }.padding(.vertical, 5)
                    }.buttonStyle(.plain).accessibilityAddTraits(noAnswer == choice ? .isSelected : [])
                }
            }
            primary("Next") { go(.goals) }
        }
    }
    private var goalSetup: some View {
        Group {
            steps(1)
            Text("Your Nutrition Goals").font(.title2.bold())
            Text("Customize the sample targets. These values are examples, not personalized recommendations.").font(.subheadline).foregroundStyle(.secondary)
            card {
                HStack {
                    icon("flame.fill", .red)
                    VStack(alignment: .leading) { Text("Daily calorie goal"); Text("\(calorieGoal) kcal").font(.title2.bold()) }
                }
                Stepper("Adjust calories", value: $calorieGoal, in: 500...5000, step: 50)
            }
            Text("Macro Targets").font(.headline)
            goalRows(0..<3)
            Text("Key Nutrients (Optional)").font(.headline)
            goalRows(3..<8)
            Button("↺ Restore sample values") { calorieGoal = 2000; goals = [150, 250, 67, 25, 1000, 18, 800, 1000] }
            primary("Next") { goals = goals.map { min(10000, max(1, $0)) }; go(.confirm) }
        }
    }
    private func goalRows(_ range: Range<Int>) -> some View {
        card {
            ForEach(Array(range), id: \.self) { index in
                HStack {
                    Image(systemName: symbols[index]).foregroundStyle(colors[index]).frame(width: 22)
                    Text(labels[index]).font(.subheadline)
                    Spacer()
                    TextField(labels[index], value: $goals[index], format: .number)
                        .keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width: 65)
                        .textFieldStyle(.roundedBorder)
                    Text(units[index]).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
    private var summary: some View {
        card {
            Label("Call time: " + callTime.formatted(date: .omitted, time: .shortened), systemImage: "clock")
            Divider()
            Label(timeZone, systemImage: "globe")
            Label(repeatDaily ? "Every day" : "One check-in", systemImage: "repeat")
            Label("\(calorieGoal) kcal goal", systemImage: "flame")
            Label("Protein, Carbs, Fats & key nutrients", systemImage: "fork.knife")
            Label("If no answer: " + noAnswer, systemImage: "bell")
        }
    }
    private var confirmation: some View {
        Group {
            steps(2)
            CaloriePackArt().frame(height: 125).accessibilityHidden(true)
            Text("Daily Food Check-in").font(.title2.bold()).frame(maxWidth: .infinity)
            Text("Here’s what you’ve set up. You can change these options anytime in this preview.").foregroundStyle(.secondary)
            summary
            primary("Preview Activation") { go(.ready) }
            Button("Maybe later") { go(.dashboard) }.frame(maxWidth: .infinity)
        }
    }
    private var ready: some View {
        Group {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 80)).foregroundStyle(gradient).frame(maxWidth: .infinity).padding(.vertical, 20)
            Text("All Set!").font(.largeTitle.bold()).frame(maxWidth: .infinity)
            Text("Your check-in design is ready. No agent has been activated and no calls will be placed.").multilineTextAlignment(.center).foregroundStyle(.secondary)
            summary
            Text("What happens next?").font(.headline)
            feature("1.circle.fill", .indigo, "Daily check-in", "A future voice agent will ask about your meals.")
            feature("2.circle.fill", .blue, "Track your day", "Review your food log and nutrition progress.")
            feature("3.circle.fill", .green, "Build healthy habits", "Explore insights and adjust your goals.")
            primary("View Nutrition Dashboard") { history = [.intro]; page = .dashboard }
            Button("Edit setup") { go(.time) }.frame(maxWidth: .infinity)
        }
    }
    private var dateSelector: some View {
        HStack {
            Button { selectedDate = Calendar.current.date(byAdding: .day, value: -1, to: selectedDate)! } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("Previous day")
            Spacer()
            DatePicker("Date", selection: $selectedDate, displayedComponents: .date).labelsHidden()
            Spacer()
            Button { selectedDate = Calendar.current.date(byAdding: .day, value: 1, to: selectedDate)! } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel("Next day")
        }
    }
    private var dashboard: some View {
        Group {
            Picker("Period", selection: $period) { ForEach(["Today", "Week", "Month"], id: \.self) { Text($0) } }.pickerStyle(.segmented)
            dateSelector
            if period == "Today" {
                HStack(spacing: 18) {
                    ZStack {
                        Circle().stroke(.indigo.opacity(0.06), lineWidth: 16)
                        Circle().trim(from: 0, to: ratio).stroke(LinearGradient(colors: [.blue, .cyan, .green], startPoint: .bottomLeading, endPoint: .topTrailing), style: StrokeStyle(lineWidth: 16, lineCap: .round)).rotationEffect(.degrees(-90))
                        VStack { Text(total.formatted()).font(.largeTitle.bold()); Text("of \(calorieGoal) kcal").font(.caption) }
                    }.frame(width: 170, height: 170).padding(8).accessibilityElement(children: .ignore).accessibilityLabel("\(total) of \(calorieGoal) calories")
                    VStack(spacing: 12) {
                        card { Text("\(max(0, calorieGoal - total))").font(.title2.bold()); Text("kcal left").font(.caption) }
                        card { Text("\(Int(ratio * 100))%").font(.headline); Text("of daily goal").font(.caption) }
                    }
                }
            } else {
                card {
                    Text(period == "Week" ? "Calories · Last 7 days" : "Calories · Weekly averages").font(.headline)
                    ChartBars(month: period == "Month")
                    Text("Illustrative trends · Sample data").font(.caption).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                ForEach(0..<3) { i in
                    card {
                        Text(labels[i]).font(.subheadline.bold())
                        Text("\(intake[i]) / \(max(1, goals[i])) g").font(.caption)
                        ProgressView(value: min(Double(intake[i]) / Double(max(1, goals[i])), 1)).tint(colors[i])
                    }
                }
            }
            HStack { Text("Key Nutrients").font(.headline); Spacer(); Button("View Insights") { go(.insights) }.font(.subheadline) }
            card {
                ForEach(3..<8) { i in
                    HStack { Image(systemName: symbols[i]).foregroundStyle(colors[i]); Text(labels[i]); Spacer(); Text("\(intake[i]) / \(max(1, goals[i])) \(units[i])").font(.caption) }
                    ProgressView(value: min(Double(intake[i]) / Double(max(1, goals[i])), 1)).tint(colors[i])
                }
            }
            primary("View Food Log") { go(.log) }
            Button("Manage daily check-in") { go(.time) }.frame(maxWidth: .infinity)
        }
    }
    private var insights: some View {
        Group {
            Picker("Insights", selection: $insightsTab) { Text("Insights"); Text("Recommendations") }.pickerStyle(.segmented)
            card { feature("lightbulb.fill", .orange, "Keep building your habit", "You’ve logged \(Int(ratio * 100))% of your sample calorie goal.") }
            if insightsTab == "Insights" {
                Text("Nutrient Gaps").font(.title3.bold())
                ForEach([3, 6, 7], id: \.self) { i in
                    card {
                        feature(symbols[i], colors[i], labels[i], "\(max(0, goals[i] - intake[i])) \(units[i]) below the sample target")
                        Text(i == 3 ? "Explore fruits, vegetables and whole grains." : i == 6 ? "Explore foods containing vitamin D." : "Explore fish, flaxseed and other sources of omega-3.").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
            Text("Food Ideas").font(.title3.bold())
            ForEach(["🥣 Greek yogurt", "🌱 Chia seeds", "🐟 Salmon"], id: \.self) { name in
                card {
                    HStack {
                        Text(name).font(.headline); Spacer()
                        Button("Add to log", systemImage: "plus.circle.fill") { foodName = String(name.dropFirst(2)); foodCalories = ""; editingFood = true }.labelStyle(.iconOnly).font(.title2)
                    }
                    Text("Explore this food in your sample meal log.").font(.caption).foregroundStyle(.secondary)
                }
            }
            Text("These examples illustrate the design; they are not an assessment of your nutrition or supplement needs.").font(.caption).foregroundStyle(.secondary)
            primary("Open Food Log") { go(.log) }
        }
    }
    private var foodLog: some View {
        Group {
            dateSelector
            Text("Sample meals · Edits last while this preview is open").font(.caption).foregroundStyle(.secondary)
            ForEach(["Breakfast", "Lunch", "Snacks", "Dinner"], id: \.self) { group in
                card {
                    HStack { Text(group).font(.headline); Spacer(); Text("\(foods.filter { $0.meal == group }.reduce(0) { $0 + $1.calories }) kcal").font(.subheadline) }
                    ForEach(foods.filter { $0.meal == group }) { food in
                        Divider()
                        HStack {
                            Text(food.name).font(.subheadline); Spacer()
                            Text("\(food.calories) kcal").font(.caption)
                            Button { foods.removeAll { $0.id == food.id } } label: { Image(systemName: "minus.circle").foregroundStyle(.red).frame(width: 32, height: 32) }.accessibilityLabel("Remove " + food.name)
                        }
                    }
                }
            }
            card { Label("Total Calories", systemImage: "flame.fill"); Text("\(total) / \(calorieGoal) kcal").font(.title2.bold()); ProgressView(value: ratio).tint(.mint) }
            primary("Add Food") { foodName = ""; foodCalories = ""; editingFood = true }
        }
    }
    private var foodEditor: some View {
        NavigationStack {
            Form {
                Section("Sample meal") {
                    TextField("Food name", text: $foodName)
                    TextField("Calories", text: $foodCalories).keyboardType(.numberPad)
                    Picker("Meal", selection: $meal) { ForEach(["Breakfast", "Lunch", "Snacks", "Dinner"], id: \.self) { Text($0) } }
                }
                Section { Text("This entry changes the preview only.").foregroundStyle(.secondary) }
            }.navigationTitle("Add Food").toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editingFood = false } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        foods.append(Food(name: foodName.trimmingCharacters(in: .whitespacesAndNewlines), calories: Int(foodCalories) ?? 0, meal: meal))
                        editingFood = false
                    }.disabled(foodName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (Int(foodCalories) ?? -1) < 0 || (Int(foodCalories) ?? 0) > 10000)
                }
            }
        }
    }
}

/// Render only the supplied illustration region; keep all interface text native.
private struct CaloriePackArt: View {
    var body: some View {
        GeometryReader { proxy in
            let scale = min(proxy.size.width / 218, proxy.size.height / 140)
            Image("calorie-design-pack").resizable()
                .frame(width: 1536 * scale, height: 1024 * scale)
                .offset(x: -1305 * scale, y: -790 * scale)
                .frame(width: 218 * scale, height: 140 * scale, alignment: .topLeading).clipped()
                .frame(width: proxy.size.width, height: proxy.size.height)
        }
    }
}
private struct ChartBars: View {
    let month: Bool
    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            ForEach(0..<(month ? 4 : 7), id: \.self) { i in
                VStack {
                    RoundedRectangle(cornerRadius: 5).fill(LinearGradient(colors: [.cyan, .indigo], startPoint: .top, endPoint: .bottom)).frame(height: CGFloat([65, 90, 80, 120, 95, 85, 78][i]))
                    Text(month ? "W\(i + 1)" : ["M", "T", "W", "T", "F", "S", "S"][i]).font(.caption)
                }.frame(maxWidth: .infinity)
            }
        }.frame(height: 155).accessibilityLabel("Illustrative calorie trend")
    }
}
