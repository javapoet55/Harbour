import type { ChosenShoppingOffer, GroceryList, ShoppingOfferCategory, ShoppingOfferMatch, ShoppingOffersSnapshot } from '../../api/shopping';

/**
 * The pure parts of the store offers screens (ios/App/ShoppingOffersView.swift) and the offer badge on
 * the list detail rows (ShoppingViews.swift:313). Matching itself is done on the server.
 */

/** `tabs` (ShoppingOffersView.swift:37), in order. */
export const OFFER_TABS: { key: ShoppingOfferCategory; title: string }[] = [
  { key: 'matching', title: 'Matching' },
  { key: 'available', title: 'Available' },
  { key: 'alternative', title: 'Alternatives' },
];

export const ALL_STORES = 'All stores';

/**
 * `ShoppingOffersSnapshot.badge(_:selected:)` (:18-25). `matches` is `undefined` before the first
 * answer. The row passes `selected` only while that offer is still among the item's matches.
 */
export function offerBadge(matches: ShoppingOfferMatch[] | undefined, selected: ChosenShoppingOffer | null | undefined): string {
  if (selected) return `Chosen: ${selected.product}`;
  if (!matches) return 'View offers';
  if (matches.length === 0) return 'No verified offers';
  const kinds = new Set(matches.map((match) => match.category));
  const name = kinds.size === 1 ? ([...kinds][0] === 'alternative' ? 'alternative' : [...kinds][0]) : 'available';
  return `${matches.length} ${name} offer${matches.length === 1 ? '' : 's'}`;
}

/** The selection a row's badge shows (ShoppingViews.swift:313): the chosen offer, if it is still current. */
export function currentChoice(itemOffers: ShoppingOfferMatch[] | undefined, chosen: ChosenShoppingOffer | null | undefined): ChosenShoppingOffer | null {
  if (!chosen) return null;
  return (itemOffers ?? []).some((match) => match.offer.id === chosen.id) ? chosen : null;
}

/** `matches` (:38): every match, or one item's. */
export function offersFor(matches: ShoppingOfferMatch[], itemId?: string | null): ShoppingOfferMatch[] {
  return matches.filter((match) => itemId == null || match.itemId === itemId);
}

/** `visible` (:39): one tab, one store or all. */
export function visibleOffers(matches: ShoppingOfferMatch[], category: string, store: string): ShoppingOfferMatch[] {
  return matches.filter((match) => match.category === category && (store === ALL_STORES || match.offer.store === store));
}

/** The store menu (:50): "All stores" then each store once, sorted. */
export function storeChoices(matches: ShoppingOfferMatch[]): string[] {
  return [ALL_STORES, ...[...new Set(matches.map((match) => match.offer.store))].sort()];
}

/**
 * After a load (:86-87): "Open on a tab that has offers; most items have no brand, so their offers are
 * under Available." Keeps the current tab when it has any.
 */
export function initialTab(matches: ShoppingOfferMatch[], current: string): string {
  if (matches.some((match) => match.category === current)) return current;
  return OFFER_TABS.find((tab) => matches.some((match) => match.category === tab.key))?.key ?? current;
}

/** The "Chosen for …" panels (:62-69): items with a saved offer, flagged when it is no longer current. */
export function chosenPanels(list: Pick<GroceryList, 'items'>, matches: ShoppingOfferMatch[], itemId?: string | null) {
  return list.items
    .filter((item) => (itemId == null || item.id === itemId) && item.chosenOffer)
    .map((item) => ({
      item,
      offer: item.chosenOffer!,
      stale: !matches.some((match) => match.itemId === item.id && match.offer.id === item.chosenOffer!.id),
    }));
}

/** `offerDate(_:)` (:125-129): the date alone, or the raw text when it does not parse. */
export function offerDate(value: string, locale?: string): string {
  const at = Date.parse(value);
  if (Number.isNaN(at)) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(at));
}

/**
 * `showsOffersShortcut` (ShoppingViews.swift:414-420): "Once the snapshot loads, show the shortcut for
 * every store: the offers screen itself explains the status for stores and locations the backend does
 * not cover." Before that, only for a Costco or Safeway store name.
 */
export function showsOffersShortcut(snapshot: ShoppingOffersSnapshot | undefined | null, storeName: string | null | undefined): boolean {
  if (snapshot) return true;
  const words = (storeName ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return words.includes('costco') || words.includes('safeway');
}

/**
 * The last day of an offer, as the store states it — NOT Swift's `offerDate(expiresAt)`, which formats
 * the end instant in the phone's zone and so shows a Safeway ad ending 6 Oct in California as "7 Oct"
 * in India (§22 "For the team"). The server sends the end as an instant: 23:59:59 on the last day in
 * the store's US zone (Costco, src/server/shopping/offers/costco.ts:6), or the ad's own end
 * (Flipp `valid_to`). Every US zone is 4–11 hours behind UTC, so 12 hours before the end, in UTC, is
 * always on the store's last day — whether the end is that day's 23:59:59 or the next midnight.
 */
export function offerEndDate(value: string, locale?: string): string {
  const at = Date.parse(value);
  if (Number.isNaN(at)) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(at - 12 * 3_600_000));
}
