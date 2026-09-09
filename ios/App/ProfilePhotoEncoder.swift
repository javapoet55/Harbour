import UIKit
import ImageIO

enum ProfilePhotoEncoder {
    enum Failure: LocalizedError {
        case invalid
        var errorDescription: String? { "Could not process this photo. Please choose another image." }
    }

    /// Downsample before decoding and adapt compression to the server limit.
    static func encode(_ data: Data) throws -> String {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { throw Failure.invalid }
        for size in [512, 384, 256] {
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: size,
                kCGImageSourceCreateThumbnailWithTransform: true
            ]
            guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { continue }
            let image = UIImage(cgImage: thumbnail)
            for quality in [0.8, 0.65, 0.5] {
                if let jpeg = image.jpegData(compressionQuality: quality), jpeg.count <= 256000 {
                    return "data:image/jpeg;base64," + jpeg.base64EncodedString()
                }
            }
        }
        throw Failure.invalid
    }
}
