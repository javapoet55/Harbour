import Foundation

/// Time zone identifiers by their current IANA name. `TimeZone.knownTimeZoneIdentifiers` still lists several
/// zones by an old link name — India is `Asia/Calcutta` there — while the phone reports the current one
/// (`Asia/Kolkata`), so a picker built from that list had no row for the device's own zone and drew blank.
/// Same list as RN's `ZONE_ALIASES` (mobile/src/features/moments/dates.ts).
public enum TimeZoneNames {
    static let aliases: [String: String] = [
        "Asia/Calcutta": "Asia/Kolkata",
        "Asia/Katmandu": "Asia/Kathmandu",
        "Asia/Saigon": "Asia/Ho_Chi_Minh",
        "Asia/Rangoon": "Asia/Yangon",
        "Asia/Dacca": "Asia/Dhaka",
        "Asia/Thimbu": "Asia/Thimphu",
        "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
        "Europe/Kiev": "Europe/Kyiv",
        "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
        "America/Godthab": "America/Nuuk",
        "Atlantic/Faeroe": "Atlantic/Faroe",
        "Pacific/Truk": "Pacific/Chuuk",
        "Pacific/Ponape": "Pacific/Pohnpei",
        "Pacific/Enderbury": "Pacific/Kanton",
    ]

    /// The current name of `identifier` (`Asia/Calcutta` → `Asia/Kolkata`) when this system knows it; else `identifier`.
    public static func canonical(_ identifier: String) -> String {
        guard let current = aliases[identifier], TimeZone(identifier: current) != nil else { return identifier }
        return current
    }

    /// Whether two identifiers name the same zone, legacy spellings included.
    public static func same(_ a: String, _ b: String) -> Bool { canonical(a) == canonical(b) }

    /// Every known zone once, by its current name, sorted, and always including `selected` (by its current
    /// name), so the picker has a row for any stored or device zone.
    public static func pickerIdentifiers(including selected: String? = nil, known: [String] = TimeZone.knownTimeZoneIdentifiers) -> [String] {
        var names = Set(known.map(canonical))
        if let selected, !selected.isEmpty, TimeZone(identifier: selected) != nil { names.insert(canonical(selected)) }
        return names.sorted()
    }
}
