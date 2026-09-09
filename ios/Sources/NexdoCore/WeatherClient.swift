import Foundation

/// Public weather uses its own session and never sends Nexdo account cookies.
public actor WeatherClient {
    private let session: URLSession
    public init(configuration: URLSessionConfiguration = .ephemeral) {
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 25
        session = URLSession(configuration: configuration)
    }

    public func forecast() async throws -> WeatherResponse {
        var url = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        url.queryItems = [
            URLQueryItem(name: "latitude", value: "37.7547"),
            URLQueryItem(name: "longitude", value: "-121.8997"),
            URLQueryItem(name: "current", value: "temperature_2m,weather_code"),
            URLQueryItem(name: "daily", value: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"),
            URLQueryItem(name: "forecast_days", value: "5"),
            URLQueryItem(name: "temperature_unit", value: "fahrenheit"),
            URLQueryItem(name: "timezone", value: "auto")
        ]
        let (data, response) = try await session.data(from: url.url!)
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse,
              (200..<300).contains(response.statusCode) else { throw APIError.invalidResponse }
        let forecast = try JSONDecoder().decode(WeatherResponse.self, from: data)
        guard forecast.daily?.days.count == 5 else { throw APIError.invalidResponse }
        return forecast
    }
}
