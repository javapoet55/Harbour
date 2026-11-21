import { describe, expect, it } from 'vitest';
import {
  amountLabel, appended, completionSummary, copiedItems, groceryEmoji, isOriginalItem, listInput, newItem, previousList, remaining, removed,
  setAllChecked, shareText, shareUrl, shortDay, suggestionsFor, supportsFoodAlternatives, swapAdding, swapReplacing, toggled, upserted,
  type GroceryList, type ShoppingAlternative,
} from './shopping';

const item = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ ...newItem(id, 'Produce'), name, ...extra });
const list = (items = [item('a', 'Milk'), item('b', 'Eggs')], extra: Partial<GroceryList> = {}): GroceryList => ({ id: 'L', title: 'Weekly', date: '2026-09-25', timeZone: 'America/New_York', weekly: true, revision: 3, items, ...extra });
const alt = (extra: Partial<ShoppingAlternative> = {}): ShoppingAlternative => ({ name: 'Oat Milk', category: 'Drinks', quantity: '1', size: '1 L', reason: 'r', detail: 'No dairy', ...extra });

describe('item and list helpers', () => {
  it('labels amounts', () => {
    expect(amountLabel({ quantity: '1', size: '' })).toBe('1');
    expect(amountLabel({ quantity: '2', size: '12 oz' })).toBe('2 × 12 oz');
    expect(amountLabel({ quantity: '1', size: '12 oz' })).toBe('12 oz');
    expect(amountLabel({ quantity: '3', size: 'bottles' })).toBe('3 bottles');
  });
  it('toggles, checks all, upserts and removes without mutating', () => {
    const base = list();
    expect(toggled(base, 'a').items[0].checked).toBe(true);
    expect(base.items[0].checked).toBe(false);
    expect(remaining(setAllChecked(base, true))).toBe(0);
    expect(upserted(base, item('c', 'Rice')).items).toHaveLength(3);
    expect(upserted(base, item('a', 'Oat')).items[0].name).toBe('Oat');
    expect(removed(base, 'a').items.map((i) => i.id)).toEqual(['b']);
    expect(appended(base, [item('z', 'Z')]).items).toHaveLength(3);
  });
  it('suggests at most three matches', () => {
    expect(suggestionsFor('')).toEqual([]);
    expect(suggestionsFor('tom')).toEqual(['Tomatoes', 'Cherry Tomatoes']);
    expect(suggestionsFor('e').length).toBeLessThanOrEqual(3);
  });
  it('shares as text', () => {
    expect(shareText(list([item('a', 'Milk', { checked: true, size: '1 gal', notes: 'whole' })]))).toBe('Weekly\n2026-09-25\n✓ Milk — 1 1 gal · whole');
  });
});

describe('listInput', () => {
  it('sends every item key and keeps optional fields only when set', () => {
    const body = listInput(list([item('a', 'Milk', { brand: 'B', favorite: true, imageData: 'x' })], { storeName: 'Shop' }));
    expect(body.storeLogoData).toBe('');
    expect(body.storeName).toBe('Shop');
    expect('storeZip' in body).toBe(false);
    expect(body.items[0]).toMatchObject({ id: 'a', brand: 'B', favorite: true, imageData: 'x', checked: false });
    expect('barcode' in body.items[0]).toBe(false);
    expect(listInput(list([item('b', 'Eggs')])).items[0].imageData).toBeNull();
  });
});

describe('copying', () => {
  it('prefers the source, then the newest completed list, then the newest', () => {
    const open = list([], { id: '1' });
    const done = list([], { id: '2', completedAt: 'x' });
    expect(previousList([open, done])?.id).toBe('2');
    expect(previousList([open])?.id).toBe('1');
    expect(previousList([open, done], open)?.id).toBe('1');
    expect(previousList([])).toBeUndefined();
  });
  it('copies items unchecked with new ids', () => {
    let n = 0;
    const copy = copiedItems(list([item('a', 'Milk', { checked: true })]), () => `n${++n}`);
    expect(copy).toEqual([expect.objectContaining({ id: 'n1', name: 'Milk', checked: false })]);
    expect(copiedItems(undefined, () => 'x')).toEqual([]);
  });
});

describe('icons and alternatives', () => {
  it('picks keyword then category emoji', () => {
    expect(groceryEmoji({ name: 'Whole Milk', category: 'Other' })).toBe('🥛');
    expect(groceryEmoji({ name: 'Thing', category: 'Bakery' })).toBe('🥐');
    expect(groceryEmoji({ name: 'Thing', category: 'Other' })).toBe('🛍️');
  });
  it('offers alternatives for food only', () => {
    expect(supportsFoodAlternatives({ name: 'Greek yogurt', category: 'Dairy & Eggs' })).toBe(true);
    expect(supportsFoodAlternatives({ name: 'Dish soap', category: 'Household' })).toBe(false);
    expect(supportsFoodAlternatives({ name: 'USB cable', category: 'Pantry' })).toBe(false);
    expect(supportsFoodAlternatives({ name: 'Mango', category: 'Other' })).toBe(true);
    expect(supportsFoodAlternatives({ name: 'Widget', category: 'Other' })).toBe(false);
  });
  it('recognises the original item', () => {
    expect(isOriginalItem({ name: ' milk ' }, { name: 'Milk' })).toBe(true);
    expect(isOriginalItem({ name: 'Oat Milk' }, { name: 'Milk' })).toBe(false);
  });
  it('replaces in place keeping quantity and checked state', () => {
    const base = list([item('a', 'Milk', { quantity: '2', checked: true, imageData: 'img', brand: 'Old' })]);
    const next = swapReplacing('a', alt({ facts: { source: 's', brand: 'Oatly', barcode: '123' } }), base)!;
    expect(next.items[0]).toMatchObject({ id: 'a', name: 'Oat Milk', quantity: '2', checked: true, brand: 'Oatly', barcode: '123', imageData: null });
    expect(swapReplacing('missing', alt(), base)).toBeNull();
  });
  it('adds an alternative once', () => {
    const base = list();
    const next = swapAdding(alt(), base, 'n')!;
    expect(next.items.at(-1)).toMatchObject({ id: 'n', name: 'Oat Milk', notes: 'No dairy' });
    expect(swapAdding(alt(), next, 'm')).toBeNull();
  });
});

describe('completion and sharing', () => {
  it('summarises a finished trip', () => {
    expect(completionSummary({ title: 'T', items: [{ checked: true }, { checked: false }] }, { completedAt: null })).toEqual({ listName: 'T', purchased: 1, total: 2, remaining: 1, nextListReady: true });
    expect(completionSummary({ title: 'T', items: [] }, { completedAt: 'x' }).nextListReady).toBe(false);
  });
  it('builds the compact share link', () => {
    const token = '00'.repeat(32);
    expect(shareUrl('https://app.example.com/', token)).toBe(`https://app.example.com/s/${'A'.repeat(43)}`);
    expect(shareUrl('https://x', 'nothex')).toBeNull();
    const ff = shareUrl('https://x', 'ff'.repeat(32))!;
    expect(ff).toBe(`https://x/s/${'_'.repeat(42)}8`);
    expect(ff.slice('https://x/s/'.length)).not.toMatch(/[+/=]/);
  });
  it('formats a calendar day without shifting it', () => {
    expect(shortDay('2026-09-25')).toMatch(/25/);
    expect(shortDay('2026-01-01')).toMatch(/1/);
  });
});
