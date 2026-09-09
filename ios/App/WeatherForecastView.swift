import SwiftUI

struct WeatherForecastView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var forecast: WeatherResponse?
    @State private var loading = true
    @State private var failure: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("San Ramon").font(.largeTitle.bold())
                        Text("5-day forecast · °F").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
                    }
                    if let forecast {
                        HStack(spacing: 18) {
                            Image(systemName: forecast.current.conditionSymbol).font(.largeTitle).symbolRenderingMode(.multicolor)
                            Text("\(Int(forecast.current.temperature.rounded()))°").font(.system(size: 52, weight: .light))
                            Text("Currently").foregroundStyle(Color.nexdoSecondary)
                        }.accessibilityElement(children: .combine)
                        VStack(spacing: 0) {
                            ForEach(forecast.daily?.days ?? []) { day in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(spacing: 12) {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(dateLabel(day.id, zone: forecast.timezone)).font(.headline)
                                            Text(day.condition).font(.caption).foregroundStyle(Color.nexdoSecondary)
                                        }
                                        Spacer()
                                        Image(systemName: day.symbol).font(.title2).symbolRenderingMode(.multicolor).accessibilityHidden(true)
                                        if !typeSize.isAccessibilitySize { temperatures(day) }
                                    }
                                    if typeSize.isAccessibilitySize { temperatures(day) }
                                    if let rain = day.rain {
                                        Label("\(rain)% chance of precipitation", systemImage: "drop.fill")
                                            .font(.caption).foregroundStyle(Color.nexdoSecondary)
                                    }
                                }.padding(16).accessibilityElement(children: .combine)
                                if day.id != forecast.daily?.days.last?.id { Divider().padding(.horizontal, 16) }
                            }
                        }
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
                        .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.nexdoIndigo.opacity(0.12)))
                    }
                    if loading { ProgressView("Loading forecast…").frame(maxWidth: .infinity).padding() }
                    if let failure {
                        Text(failure).foregroundStyle(Color.nexdoSecondary)
                        Button("Retry") { Task { await load() } }.buttonStyle(.borderedProminent).disabled(loading)
                    }
                    Link("Weather by Open-Meteo", destination: URL(string: "https://open-meteo.com/")!).font(.footnote)
                }.padding(24)
            }
            .background(LinearGradient(colors: [Color.nexdoBlue.opacity(0.09), Color.nexdoMagenta.opacity(0.05), Color(uiColor: .systemBackground)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .navigationTitle("Weather").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                        .accessibilityLabel("Close weather forecast")
                }
            }
            .tint(.nexdoIndigo)
            .task {
                if model.weather?.daily?.days.count == 5 { forecast = model.weather }
                await load()
            }
            .refreshable { await load() }
        }
    }

    private func temperatures(_ day: WeatherResponse.Day) -> some View {
        VStack(alignment: .trailing, spacing: 4) {
            Text("H \(temperature(day.high))").font(.subheadline.weight(.semibold))
            Text("L \(temperature(day.low))").font(.subheadline).foregroundStyle(Color.nexdoSecondary)
        }.accessibilityLabel("High \(temperature(day.high)), low \(temperature(day.low)) Fahrenheit")
    }
    private func temperature(_ value: Double?) -> String { value.map { "\(Int($0.rounded()))°" } ?? "—" }
    private func dateLabel(_ day: String, zone: String?) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: zone ?? "America/Los_Angeles")
        formatter.dateFormat = "yyyy-MM-dd"
        if formatter.string(from: Date()) == day { return "Today" }
        guard let date = formatter.date(from: day) else { return day }
        formatter.locale = .current
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: date)
    }
    private func load() async {
        loading = true; failure = nil
        defer { loading = false }
        do { forecast = try await model.loadWeatherForecast() }
        catch {
            guard !Task.isCancelled else { return }
            failure = forecast == nil ? "Couldn’t load the forecast. Please try again." : "Couldn’t refresh. Showing the previous forecast."
        }
    }
}
