import type { ShoppingOfferMatch, StoreOffer } from '../../../api/shopping';
import { ALL_STORES, chosenPanels, currentChoice, initialTab, offerBadge, offerDate, offersFor, storeChoices, visibleOffers } from '../offers';

/** ShoppingOffersView.swift. Swift has no unit tests for these; they pin the copied rules. */

function offer(id: string, store = 'Costco'): StoreOffer {
  return { id, product: `Product ${id}`, conditions: '', sourceURL: 'https://example.com', startsAt: '2026-09-28', expiresAt: '2026-10-04', checkedAt: '2026-09-28T10:00:00Z', store };
}

function match(itemId: string, category: string, id: string, store?: string): ShoppingOfferMatch {
  return { itemId, itemName: itemId, category, reasons: [], differences: [], offer: offer(id, store), selected: false };
}

test('the badge names the kind of offer, or the choice', () => {
  expect(offerBadge(undefined, null)).toBe('View offers');
  expect(offerBadge([], null)).toBe('No verified offers');
  expect(offerBadge([match('i', 'matching', 'a')], null)).toBe('1 matching offer');
  expect(offerBadge([match('i', 'alternative', 'a'), match('i', 'alternative', 'b')], null)).toBe('2 alternative offers');
  expect(offerBadge([match('i', 'matching', 'a'), match('i', 'alternative', 'b')], null)).toBe('2 available offers');
  const chosen = { id: 'a', product: 'Oat milk', store: 'Costco', sourceURL: 'https://example.com', expiresAt: '2026-10-04' };
  expect(offerBadge([match('i', 'matching', 'a')], chosen)).toBe('Chosen: Oat milk');
  // A choice that is no longer among the item's offers is not shown as chosen.
  expect(currentChoice([match('i', 'matching', 'b')], chosen)).toBeNull();
  expect(currentChoice([match('i', 'matching', 'a')], chosen)).toBe(chosen);
});

test('filters by item, tab and store; the store menu is sorted with All stores first', () => {
  const all = [match('milk', 'matching', 'a', 'Safeway'), match('milk', 'available', 'b', 'Costco'), match('eggs', 'available', 'c', 'Costco')];
  expect(offersFor(all, 'milk')).toHaveLength(2);
  expect(offersFor(all, null)).toHaveLength(3);
  expect(visibleOffers(all, 'available', ALL_STORES).map((m) => m.offer.id)).toEqual(['b', 'c']);
  expect(visibleOffers(all, 'available', 'Safeway')).toEqual([]);
  expect(storeChoices(all)).toEqual([ALL_STORES, 'Costco', 'Safeway']);
});

test('opens on the first tab that has offers, keeping the current one when it has any', () => {
  expect(initialTab([match('i', 'available', 'a')], 'matching')).toBe('available');
  expect(initialTab([match('i', 'available', 'a'), match('i', 'matching', 'b')], 'matching')).toBe('matching');
  expect(initialTab([], 'matching')).toBe('matching');
});

test('chosen panels flag a selection that is no longer a current offer', () => {
  const chosen = { id: 'gone', product: 'Old', store: 'Costco', sourceURL: 'https://example.com', expiresAt: '2026-09-01' };
  const items = [
    { id: 'milk', name: 'Milk', category: 'Dairy & Eggs', quantity: '1', size: '', notes: '', checked: false, chosenOffer: chosen },
    { id: 'eggs', name: 'Eggs', category: 'Dairy & Eggs', quantity: '1', size: '', notes: '', checked: false },
  ];
  expect(chosenPanels({ items }, [match('milk', 'matching', 'a')]).map((panel) => [panel.item.id, panel.stale])).toEqual([['milk', true]]);
  expect(chosenPanels({ items }, [match('milk', 'matching', 'gone')])[0].stale).toBe(false);
  expect(chosenPanels({ items }, [], 'eggs')).toEqual([]);
});

test('offer dates fall back to the raw text', () => {
  expect(offerDate('not a date')).toBe('not a date');
  expect(offerDate('2026-10-04T12:00:00Z', 'en-US')).toBe('Oct 4, 2026');
});
