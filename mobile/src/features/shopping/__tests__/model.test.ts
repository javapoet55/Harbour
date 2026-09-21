import type { GroceryItem, GroceryList } from '../../../api/shopping';
import {
  amountLabel,
  artworkFor,
  CATEGORIES,
  copiedItems,
  groceryAsset,
  groceryEmoji,
  listInput,
  newItem,
  previousList,
  remaining,
  shareText,
  ShoppingTranscript,
  suggestionsFor,
  toggled,
  upserted,
} from '../model';

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return { ...newItem('i'), name: 'Milk', ...overrides };
}

function list(overrides: Partial<GroceryList> = {}): GroceryList {
  return { id: 'l', title: 'Weekly Shopping List', date: '2026-09-25', timeZone: 'UTC', weekly: true, revision: 3, completedAt: null, shareToken: null, items: [], ...overrides };
}

describe('ShoppingTranscript (ShoppingTests.swift)', () => {
  it('keeps multiple utterances and ignores duplicate finals', () => {
    const transcript = new ShoppingTranscript();
    transcript.append('one', 'six ', false);
    transcript.append('one', 'bananas', false);
    expect(transcript.text).toBe('six bananas');
    transcript.append('one', 'six bananas', true);
    transcript.append('two', 'one gallon of milk', true);
    transcript.append('one', 'six bananas', true);
    expect(transcript.completedText).toBe('six bananas; one gallon of milk');
    expect(transcript.hasPending).toBe(false);
  });

  it('keeps spoken order when finals arrive out of order', () => {
    const transcript = new ShoppingTranscript();
    transcript.append('first', '', false);
    transcript.append('second', '', false);
    expect(transcript.hasPending).toBe(true);
    transcript.append('second', 'milk', true);
    transcript.append('first', 'bananas', true);
    expect(transcript.text).toBe('bananas; milk');
    expect(transcript.hasPending).toBe(false);
  });

  it('never lets a late delta overwrite a final', () => {
    const transcript = new ShoppingTranscript();
    transcript.append('a', 'eggs', true);
    transcript.append('a', ' and more', false);
    expect(transcript.text).toBe('eggs');
  });
});

describe('GroceryItem', () => {
  it('formats the amount (ShoppingTests.swift)', () => {
    expect(amountLabel({ quantity: '2', size: '1 gallon' })).toBe('2 × 1 gallon');
    expect(amountLabel({ quantity: '1', size: '1 bag' })).toBe('1 bag');
    expect(amountLabel({ quantity: '2', size: 'bottles' })).toBe('2 bottles');
    expect(amountLabel({ quantity: '6', size: '' })).toBe('6');
  });

  it('starts new items with Swift’s defaults', () => {
    expect(newItem('x', 'Bakery')).toEqual({ id: 'x', name: '', category: 'Bakery', quantity: '1', size: '', notes: '', imageData: null, checked: false });
    expect(CATEGORIES[0]).toBe('Produce');
    expect(CATEGORIES[CATEGORIES.length - 1]).toBe('Other');
  });

  it('always encodes imageData, as null when there is none, so saving removes an image explicitly', () => {
    const input = listInput(list({ items: [item({ imageData: undefined }), item({ id: 'j', imageData: '/9j/AA==' })] }));
    expect(input.items[0]).toHaveProperty('imageData', null);
    expect(input.items[1].imageData).toBe('/9j/AA==');
    expect(Object.keys(input).sort()).toEqual(['date', 'items', 'timeZone', 'title', 'weekly']);
  });
});

describe('GroceryList', () => {
  it('counts what is left', () => {
    expect(remaining(list({ items: [item(), item({ id: 'j', checked: true })] }))).toBe(1);
  });

  it('shares as Swift’s text, line for line', () => {
    const text = shareText(list({ items: [item({ name: 'bananas', quantity: '6', checked: true }), item({ id: 'j', name: 'milk', quantity: '2', size: 'bottles', notes: 'oat' })] }));
    expect(text).toBe('Weekly Shopping List\n2026-09-25\n✓ bananas — 6 \n○ milk — 2 bottles · oat');
  });

  it('toggles, upserts and reorders within a category only', () => {
    const base = list({
      items: [
        item({ id: 'a', category: 'Produce', name: 'A' }),
        item({ id: 'x', category: 'Dairy & Eggs', name: 'X' }),
        item({ id: 'b', category: 'Produce', name: 'B' }),
      ],
    });
    expect(toggled(base, 'a').items[0].checked).toBe(true);
    expect(upserted(base, item({ id: 'x', name: 'Y', category: 'Dairy & Eggs' })).items[1].name).toBe('Y');
    expect(upserted(base, item({ id: 'new' })).items).toHaveLength(4);
  });

  it('reuses the newest completed list, else the newest, and copies its items unchecked', () => {
    const open = list({ id: 'open' });
    const done = list({ id: 'done', completedAt: '2026-09-18T10:00:00Z', items: [item({ checked: true })] });
    expect(previousList([open, done])?.id).toBe('done');
    expect(previousList([open])?.id).toBe('open');
    expect(previousList([open, done], open)?.id).toBe('open');
    expect(previousList([])).toBeUndefined();
    expect(copiedItems(done).every((value) => !value.checked)).toBe(true);
  });
});

describe('suggestions (ShoppingViews.swift:237-238)', () => {
  it('matches the thirteen names case-insensitively and shows at most three', () => {
    expect(suggestionsFor('')).toEqual([]);
    expect(suggestionsFor('tom')).toEqual(['Tomatoes', 'Cherry Tomatoes']);
    expect(suggestionsFor('A')).toEqual(['Bananas', 'Apples', 'Tomatoes']);
    expect(suggestionsFor('paper')).toEqual(['Paper towels']);
    expect(suggestionsFor('zzz')).toEqual([]);
  });
});

describe('item image priority (ShoppingViews.swift:363-402)', () => {
  it('prefers the attached photo, then the bundled illustration, then an emoji', () => {
    expect(artworkFor({ name: 'Milk', category: 'Dairy & Eggs', imageData: '/9j/AA==' })).toEqual({ kind: 'photo', base64: '/9j/AA==' });
    expect(artworkFor({ name: 'Parity milk', category: 'Dairy & Eggs', imageData: null })).toEqual({ kind: 'asset', asset: 'milk' });
    expect(artworkFor({ name: 'Cheddar cheese', category: 'Dairy & Eggs', imageData: null })).toEqual({ kind: 'emoji', emoji: '🧀' });
  });

  it('matches bundled art by whole word only, in Swift’s order', () => {
    expect(groceryAsset('red onions')).toBe('onion');
    expect(groceryAsset('milk-chocolate eggs')).toBe('milk');
    expect(groceryAsset('buttermilk')).toBeNull();
    expect(groceryAsset('Cherry Tomatoes')).toBe('tomato');
    expect(groceryAsset('eggplant')).toBeNull();
    expect(groceryAsset('1 dozen EGGS')).toBe('eggs');
  });

  it('falls back to the category emoji, then the bag', () => {
    expect(groceryEmoji({ name: 'Frozen peas', category: 'Frozen' })).toBe('🧊');
    expect(groceryEmoji({ name: 'Salmon fillet', category: 'Meat & Seafood' })).toBe('🐟');
    expect(groceryEmoji({ name: 'Widgets', category: 'Other' })).toBe('🛍️');
  });
});
