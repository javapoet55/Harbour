import Foundation
import Testing
@testable import NexdoCore

private final class WeatherStub: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
        #expect(query.contains(URLQueryItem(name: "latitude", value: "40.71")))
        #expect(query.contains(URLQueryItem(name: "longitude", value: "-74.01")))
        #expect(request.url?.host == "api.open-meteo.com")
        #expect(query.contains(URLQueryItem(name: "forecast_days", value: "5")))
        #expect(query.contains(URLQueryItem(name: "temperature_unit", value: "fahrenheit")))
        #expect(request.value(forHTTPHeaderField: "Cookie") == nil)
        let mode = request.value(forHTTPHeaderField: "X-Test-Weather") ?? "success"
        let json = mode == "legacy" ? #"{"current":{"temperature_2m":72}}"# : #"{"current":{"temperature_2m":72},"daily":{"time":["2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-12"],"weather_code":[0,0,0,0,0],"temperature_2m_max":[80,81,82,83,84],"temperature_2m_min":[55,56,57,58,59],"precipitation_probability_max":[0,0,0,0,0]}}"#
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: mode == "failure" ? 503 : 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@Test func weatherClientLoadsPublicForecastAndRejectsIncompleteResponses() async throws {
    for mode in ["success", "legacy", "failure"] {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [WeatherStub.self]
        config.httpAdditionalHeaders = ["X-Test-Weather": mode]
        let client = WeatherClient(configuration: config)
        if mode == "success" {
            let forecast = try await client.forecast(latitude: 40.71, longitude: -74.01)
            #expect(forecast.daily?.days.count == 5)
            #expect(forecast.daily?.days.last?.high == 84)
        } else {
            await #expect(throws: APIError.self) { try await client.forecast(latitude: 40.71, longitude: -74.01) }
        }
    }
}

@Test func liveWeatherProviderWhenRequested() async throws {
    guard ProcessInfo.processInfo.environment["NEXDO_LIVE_WEATHER_TEST"] == "1" else { return }
    let forecast = try await WeatherClient().forecast(latitude: 40.71, longitude: -74.01)
    #expect(forecast.daily?.days.count == 5)
    #expect(forecast.daily?.days.allSatisfy { $0.high != nil && $0.low != nil } == true)
}

@Test func weatherRejectsInvalidCoordinatesBeforeNetworkRequest() async {
    let client = WeatherClient()
    for (latitude, longitude) in [(91.0, 0.0), (0.0, 181.0), (Double.nan, 0.0), (0.0, Double.infinity)] {
        await #expect(throws: APIError.self) { try await client.forecast(latitude: latitude, longitude: longitude) }
    }
}
