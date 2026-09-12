import Foundation
public enum VoiceJSON: Codable, Sendable {
    case object([String: VoiceJSON]), array([VoiceJSON]), string(String), number(Double), bool(Bool), null
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let value = try? c.decode(Bool.self) { self = .bool(value) }
        else if let value = try? c.decode(Double.self) { self = .number(value) }
        else if let value = try? c.decode(String.self) { self = .string(value) }
        else if let value = try? c.decode([VoiceJSON].self) { self = .array(value) }
        else { self = .object(try c.decode([String: VoiceJSON].self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let x): try c.encode(x)
        case .array(let x): try c.encode(x)
        case .string(let x): try c.encode(x)
        case .number(let x): try c.encode(x)
        case .bool(let x): try c.encode(x)
        case .null: try c.encodeNil()
        }
    }
}
public struct VoiceToolResponse: Codable, Sendable {
    private let value: VoiceJSON
    public init(from decoder: Decoder) throws { value = try VoiceJSON(from: decoder) }
    public func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
    public var success: Bool {
        if case .object(let fields) = value, case .bool(let flag) = fields["success"] { return flag }; return false
    }
    public var task: NexdoTask? {
        if case .object(let fields) = value, let task = fields["task"], let data = try? JSONEncoder().encode(task) { return try? JSONDecoder().decode(NexdoTask.self, from: data) }; return nil
    }
}
