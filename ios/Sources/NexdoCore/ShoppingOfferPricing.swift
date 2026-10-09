import Foundation

/// Only reconstruct a before-discount price from an unqualified USD final price
/// and a fixed USD discount. Bundle, percentage and conditional offers stay verbatim.
public enum ShoppingOfferPricing {
    public static func originalPrice(finalPrice: String?, savings: String?) -> String? {
        guard let finalPrice, let savings else { return nil }
        let amount = #"\$(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{2})?"#
        let final = finalPrice.trimmingCharacters(in: .whitespacesAndNewlines)
        let discount = savings.trimmingCharacters(in: .whitespacesAndNewlines)
        guard final.range(of: "^" + amount + "$", options: .regularExpression) != nil,
              discount.range(of: "^" + amount + " off$", options: [.regularExpression, .caseInsensitive]) != nil else { return nil }
        let discountAmount = String(discount.dropLast(4))
        func number(_ value: String) -> Decimal? {
            Decimal(string: value.replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: ""),
                    locale: Locale(identifier: "en_US_POSIX"))
        }
        guard let price = number(final), let saving = number(discountAmount), price >= 0, saving > 0 else { return nil }
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: NSDecimalNumber(decimal: price + saving))
    }
}
