import Foundation
import Testing
@testable import NexdoCore

@Test func readsEachConfigurationsServer() throws {
    #expect(try APIEnvironment.baseURL(from: ["NexdoAPIBaseURL": "https://app-dev.nexdoapp.com"]).absoluteString == "https://app-dev.nexdoapp.com")
    #expect(try APIEnvironment.baseURL(from: ["NexdoAPIBaseURL": "https://app.nexdoapp.com"]).absoluteString == "https://app.nexdoapp.com")
    // A trailing slash or surrounding spaces are tolerated and normalized.
    #expect(try APIEnvironment.baseURL(from: ["NexdoAPIBaseURL": " https://app.nexdoapp.com/ "]).absoluteString == "https://app.nexdoapp.com")
    // The result is accepted by the API client.
    #expect(throws: Never.self) { try APIClient(baseURL: APIEnvironment.baseURL(from: ["NexdoAPIBaseURL": "https://app-dev.nexdoapp.com"])) }
}

@Test func missingOrUnexpandedSettingFails() {
    #expect(throws: APIEnvironment.ConfigurationError.missing) { try APIEnvironment.baseURL(from: [:]) }
    #expect(throws: APIEnvironment.ConfigurationError.missing) { try APIEnvironment.baseURL(from: ["NexdoAPIBaseURL": ""]) }
    #expect(throws: APIEnvironment.ConfigurationError.missing) { try APIEnvironment.baseURL(from: ["NexdoAPIBaseURL": "   "]) }
    #expect(throws: APIEnvironment.ConfigurationError.missing) { try APIEnvironment.baseURL(from: ["NexdoAPIBaseURL": 42]) }
    #expect(throws: APIEnvironment.ConfigurationError.unexpanded("$(API_BASE_URL)")) { try APIEnvironment.baseURL(from: ["NexdoAPIBaseURL": "$(API_BASE_URL)"]) }
}

@Test func onlyAPlainHTTPSOriginIsAccepted() {
    for value in ["http://app-dev.nexdoapp.com", "app-dev.nexdoapp.com", "https://", "https://app.nexdoapp.com/api",
                  "https://app.nexdoapp.com?x=1", "https://app.nexdoapp.com#top", "https://user:pw@app.nexdoapp.com", "ftp://app.nexdoapp.com"] {
        #expect(throws: APIEnvironment.ConfigurationError.invalid(value)) { try APIEnvironment.baseURL(from: ["NexdoAPIBaseURL": value]) }
    }
}

@Test func errorsSayWhatToFix() {
    #expect(APIEnvironment.ConfigurationError.missing.description.contains("API_BASE_URL"))
    #expect(APIEnvironment.ConfigurationError.missing.description.contains("https://app-dev.nexdoapp.com"))
    #expect(APIEnvironment.ConfigurationError.unexpanded("$(API_BASE_URL)").description.contains("not defined for this configuration"))
    #expect(APIEnvironment.ConfigurationError.invalid("http://x").description.contains("https://host"))
}

@Test func webLinksUseTheSameServer() {
    let dev = URL(string: "https://app-dev.nexdoapp.com")!
    #expect(APIEnvironment.webURL("/notifications", base: dev).absoluteString == "https://app-dev.nexdoapp.com/notifications")
    #expect(APIEnvironment.webURL("privacy", base: dev).absoluteString == "https://app-dev.nexdoapp.com/privacy")
    #expect(APIEnvironment.webURL("/api/calendar/oauth/google/callback", base: URL(string: "https://app.nexdoapp.com")!).absoluteString == "https://app.nexdoapp.com/api/calendar/oauth/google/callback")
}

/// The Xcode project maps each configuration to its server; Archive (TestFlight/App Store) uses Release.
@Test func projectMapsConfigurationsToServers() throws {
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let project = try String(contentsOf: root.appendingPathComponent("Nexdo.xcodeproj/project.pbxproj"), encoding: .utf8)
    #expect(project.contains("API_BASE_URL = \"https://app-dev.nexdoapp.com\";"))
    #expect(project.contains("API_BASE_URL = \"https://app.nexdoapp.com\";"))
    #expect(!project.contains("railway.app"))
    let plist = try String(contentsOf: root.appendingPathComponent("Nexdo-Info.plist"), encoding: .utf8)
    #expect(plist.contains("<key>NexdoAPIBaseURL</key>") && plist.contains("<string>$(API_BASE_URL)</string>"))
    for scheme in ["Nexdo", "Nexdo Device Check"] {
        let xml = try String(contentsOf: root.appendingPathComponent("Nexdo.xcodeproj/xcshareddata/xcschemes/\(scheme).xcscheme"), encoding: .utf8)
        let archive = try #require(xml.range(of: "<ArchiveAction"))
        #expect(xml[archive.upperBound...].prefix(80).contains("buildConfiguration = \"Release\""), "\(scheme)")
    }
}
