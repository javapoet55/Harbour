// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NexdoCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "NexdoCore", targets: ["NexdoCore"])],
    targets: [
        .target(name: "NexdoCore"),
        .executableTarget(name: "NexdoCoreChecks", dependencies: ["NexdoCore"], path: "Checks"),
        .testTarget(name: "NexdoCoreTests", dependencies: ["NexdoCore"])
    ]
)
