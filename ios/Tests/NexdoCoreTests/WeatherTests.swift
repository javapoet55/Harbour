import Foundation
import Testing
@testable import NexdoCore

@Test func weatherStillDecodesCurrentOnlyResponse() throws {
    let value = try JSONDecoder().decode(WeatherResponse.self, from: Data(#"{"current":{"temperature_2m":72,"weather_code":0}}"#.utf8))
    #expect(value.current.temperature == 72)
    #expect(value.daily == nil)
}

@Test func weatherMapsFiveDaysAndHandlesMissingMeasurements() throws {
    let json = #"{"current":{"temperature_2m":72},"timezone":"America/Los_Angeles","daily":{"time":["2026-09-07","2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-12"],"weather_code":[0,61,null],"temperature_2m_max":[80,null],"temperature_2m_min":[55],"precipitation_probability_max":[10,90]}}"#
    let value = try JSONDecoder().decode(WeatherResponse.self, from: Data(json.utf8))
    let days = try #require(value.daily?.days)
    #expect(days.count == 5)
    #expect(days[0].high == 80)
    #expect(days[1].condition == "Rain")
    #expect(days[1].rain == 90)
    #expect(days[4].high == nil)
    #expect(days[4].condition == "Conditions unavailable")
}
