import type { GroceryList } from '../../../api/shopping';
import { withStore } from '../ListSettings';
import { LOGO_MAX_BASE64, logoAcceptable, logoForSave, logoScale, withStoreName } from '../listLogo';
import { listInput } from '../model';
import { offerOriginalPrice, offerPriceRows } from '../offerPricing';
import { storeHoursRowIsToday, storeHoursRowLabel } from '../storeHoursDay';

/**
 * Phase 13 shopping logic. The pricing and hours cases are Swift's own:
 * ShoppingOfferPricingTests.swift (bdb68ce) and ShoppingStoreHoursDayTests.swift (bb57e09).
 */

describe('ShoppingOfferPricing', () => {
  // offerPriceBreakdownUsesExactDollarAmounts
  it('adds an exact dollar discount back on', () => {
    expect(offerOriginalPrice('$7.99', '$2 off')).toBe('$9.99');
    expect(offerOriginalPrice('$199.99', '$99.99 OFF')).toBe('$299.98');
    expect(offerOriginalPrice('$1,299.99', '$100 off')).toBe('$1,399.99');
  });

  // offerPriceBreakdownDoesNotInventMissingOrConditionalPrices
  it('does not invent a missing or conditional price', () => {
    expect(offerOriginalPrice(null, '$99.99 off')).toBeNull();
    expect(offerOriginalPrice('$7.99', null)).toBeNull();
    for (const savings of ['Up to $2 off', '$2 off when you buy 3', '20% OFF', 'Buy one get one free']) {
      expect(offerOriginalPrice('$7.99', savings)).toBeNull();
    }
    for (const price of ['2 for $7.99', '$7.99/lb', 'From $7.99', '$7,99']) {
      expect(offerOriginalPrice(price, '$2 off')).toBeNull();
    }
  });

  it('adds without floating-point drift, and refuses a zero discount', () => {
    expect(offerOriginalPrice('$0.10', '$0.20 off')).toBe('$0.30');
    expect(offerOriginalPrice(' $7 ', ' $2 off ')).toBe('$9.00');
    expect(offerOriginalPrice('$7.99', '$0 off')).toBeNull();
  });

  it('lays out the card rows, saying what is not published', () => {
    expect(offerPriceRows({ price: '$7.99', savings: '$2 off' })).toEqual({ beforeDiscount: '$9.99', discount: '$2 off', finalPrice: '$7.99', calculated: true });
    expect(offerPriceRows({ price: null, savings: '20% OFF' })).toEqual({ beforeDiscount: 'Not published', discount: '20% OFF', finalPrice: 'Not published', calculated: false });
  });
});

describe('ShoppingStoreHoursDay', () => {
  // storeHoursHighlightUsesStoreDayAcrossMidnight
  it('uses the store’s own day across midnight', () => {
    const instant = Date.parse('2026-10-10T01:00:00Z');
    expect(storeHoursRowIsToday('Friday: 10:00 AM–8:30 PM', instant, -420)).toBe(true);
    expect(storeHoursRowIsToday('Saturday: 9:30 AM–7:00 PM', instant, -420)).toBe(false);
    expect(storeHoursRowIsToday('Saturday: Closed', instant, 330)).toBe(true);
    expect(storeHoursRowIsToday('Open 24 hours', instant, 330)).toBe(false);
    expect(storeHoursRowIsToday('Saturday: Closed', instant + 86_400_000, -420)).toBe(true);
  });

  it('falls back to the phone’s zone for a missing or impossible offset', () => {
    // Jest runs in America/Los_Angeles (jest.setup.js): this instant is Friday evening there.
    const instant = Date.parse('2026-10-10T01:00:00Z');
    expect(storeHoursRowIsToday('friday: 10 AM–8:30 PM', instant, null)).toBe(true);
    expect(storeHoursRowIsToday('Friday: 10 AM–8:30 PM', instant, 900)).toBe(true);
    expect(storeHoursRowLabel('Friday: 10 AM–8:30 PM', true)).toBe('Today, Friday: 10 AM–8:30 PM');
  });
});

function list(overrides: Partial<GroceryList> = {}): GroceryList {
  return { id: 'l', title: 'Groceries', date: '2026-10-10', timeZone: 'UTC', weekly: true, revision: 3, items: [], storeName: 'Safeway', storeWebsite: 'https://safeway.com', storePlaceId: 'p1', ...overrides };
}

describe('the list logo', () => {
  it('is always sent: the logo, or "" to clear it', () => {
    expect(listInput(list({ storeLogoData: '/9j/AA==' })).storeLogoData).toBe('/9j/AA==');
    expect(listInput(list({ storeLogoData: null })).storeLogoData).toBe('');
    expect(listInput(list()).storeLogoData).toBe('');
    expect(logoForSave({})).toBe('');
  });

  it('goes with the store when the store changes', () => {
    expect(withStoreName(list({ storeLogoData: '/9j/AA==' }), 'Trader Joe’s')).toMatchObject({ storeName: 'Trader Joe’s', storeLogoData: null, storeWebsite: null, storePlaceId: null });
    expect(withStore(list({ storeLogoData: '/9j/AA==' }), { id: 'p2', name: 'Lucky', address: '1 Main St', zip: '94526', website: null } as never).storeLogoData).toBeNull();
  });

  it('accepts only what the server stores: bare JPEG base64 under 90,000 characters', () => {
    expect(logoAcceptable('/9j/AA==')).toBe(true);
    expect(logoAcceptable('')).toBe(true);
    expect(logoAcceptable('iVBORw0KGgo=')).toBe(false);
    expect(logoAcceptable('data:image/jpeg;base64,/9j/AA==')).toBe(false);
    expect(logoAcceptable('https://example.com/logo.jpg')).toBe(false);
    expect(logoAcceptable('/9j/' + 'A'.repeat(LOGO_MAX_BASE64))).toBe(false);
  });

  it('scales down to 384 px on the long edge, never up', () => {
    expect(logoScale(1024, 512)).toBe(0.375);
    expect(logoScale(200, 100)).toBe(1);
  });
});
