/**
 * `ShoppingOfferPricing` (bdb68ce, ios/Sources/NexdoCore/ShoppingOfferPricing.swift): the
 * before-discount price an offer card shows, rebuilt ONLY from an unqualified US-dollar final price and
 * a fixed US-dollar discount ("$7.99" and "$2 off" → "$9.99"). Bundles ("2 for $7.99"), unit prices,
 * "From …", percentages and conditional discounts stay as published, and nothing is invented.
 */

const AMOUNT = String.raw`\$(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{2})?`;
const FINAL = new RegExp(`^${AMOUNT}$`);
const DISCOUNT = new RegExp(`^${AMOUNT} off$`, 'i');

/** Whole cents, exactly: every accepted amount has at most two decimals. */
function cents(amount: string): number {
  const [dollars, fraction = '00'] = amount.replace('$', '').replace(/,/g, '').split('.');
  return Number(dollars) * 100 + Number(fraction);
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** `originalPrice(finalPrice:savings:)` (:5-24), or `null` when it cannot be known. */
export function offerOriginalPrice(finalPrice: string | null | undefined, savings: string | null | undefined): string | null {
  if (finalPrice == null || savings == null) return null;
  const final = finalPrice.trim();
  const discount = savings.trim();
  if (!FINAL.test(final) || !DISCOUNT.test(discount)) return null;
  const price = cents(final);
  const saving = cents(discount.slice(0, -4));
  if (!(price >= 0) || !(saving > 0)) return null;
  return USD.format((price + saving) / 100);
}

/** The card's three rows (ShoppingOffersView.swift, bdb68ce); "Not published" for whatever is missing. */
export function offerPriceRows(offer: { price?: string | null; savings?: string | null }): { beforeDiscount: string; discount: string; finalPrice: string; calculated: boolean } {
  const original = offerOriginalPrice(offer.price, offer.savings);
  return { beforeDiscount: original ?? 'Not published', discount: offer.savings ?? 'Not published', finalPrice: offer.price ?? 'Not published', calculated: original !== null };
}

/** The footnote shown only when the first row was calculated. */
export const CALCULATED_PRICE_NOTE = 'Before-discount price calculated from the final price and discount.';
