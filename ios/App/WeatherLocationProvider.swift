import CoreLocation
import Foundation

enum WeatherLocationError: LocalizedError {
    case permissionNeeded, unavailable
    var errorDescription: String? {
        switch self {
        case .permissionNeeded: "Allow location access in Settings to see weather near you. Approximate location is sufficient."
        case .unavailable: "Your current location is unavailable. Please try again when location services are available."
        }
    }
}

/// Requests a single approximate position; never starts background location tracking.
@MainActor final class WeatherLocationProvider: NSObject, @preconcurrency CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var waiters: [CheckedContinuation<CLLocationCoordinate2D, Error>] = []
    private var timeout: Task<Void, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func locate(requestPermission: Bool) async throws -> CLLocationCoordinate2D {
        let status = manager.authorizationStatus
        if status == .denied || status == .restricted || (status == .notDetermined && !requestPermission) {
            throw WeatherLocationError.permissionNeeded
        }
        return try await withCheckedThrowingContinuation { continuation in
            waiters.append(continuation)
            guard waiters.count == 1 else { return }
            timeout = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
                self?.finish(.failure(WeatherLocationError.unavailable))
            }
            if status == .notDetermined { manager.requestWhenInUseAuthorization() }
            else { manager.requestLocation() }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard !waiters.isEmpty else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation()
        case .denied, .restricted: finish(.failure(WeatherLocationError.permissionNeeded))
        default: break
        }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, location.horizontalAccuracy >= 0,
              abs(location.timestamp.timeIntervalSinceNow) < 300 else {
            finish(.failure(WeatherLocationError.unavailable)); return
        }
        // Weather does not need a precise street-level position.
        let coordinate = CLLocationCoordinate2D(latitude: (location.coordinate.latitude * 100).rounded() / 100,
                                                longitude: (location.coordinate.longitude * 100).rounded() / 100)
        finish(.success(coordinate))
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(.failure(WeatherLocationError.unavailable))
    }
    private func finish(_ result: Result<CLLocationCoordinate2D, Error>) {
        timeout?.cancel(); timeout = nil
        let pending = waiters; waiters.removeAll()
        pending.forEach { $0.resume(with: result) }
    }
}
