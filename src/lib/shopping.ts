/**
 * Shopping Lists for the web app: the wire types and the pure list logic. The behaviour is the phones':
 * ios/Sources/NexdoCore/ShoppingList.swift and the Android port (mobile/src/features/shopping/model.ts,
 * productFacts.ts). Nothing here touches the network or the browser.
 */

export const CATEGORIES = ['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Bakery', 'Pantry', 'Frozen', 'Drinks', 'Household', 'Other'] as const;

export type ShoppingProductFacts = {
  source: string;
  brand?: string | null;
  barcode?: string | null;
  name?: string | null;
  nutrition?: { servingSize?: string; calories?: number | null; protein?: number | null; sugar?: number | null; totalFat?: number | null } | null;
  dietary?: string[] | null;
  price?: number | null;
  currency?: string | null;
  pricePackage?: string | null;
};

export type GroceryItem = {
  id: string;
  name: string;
  category: string;
  quantity: string;
  size: string;
  notes: string;
  /** Base64 JPEG, or null. Sent back unchanged on every save so a photo set on the phone is kept. */
  imageData?: string | null;
  checked: boolean;
  brand?: string | null;
  barcode?: string | null;
  favorite?: boolean | null;
  favoriteAlternatives?: string[] | null;
  chosenOffer?: unknown;
};

export type GroceryList = {
  id: string;
  title: string;
  /** yyyy-MM-dd in the list's own time zone. */
  date: string;
  timeZone: string;
  weekly: boolean;
  completedAt?: string | null;
  revision: number;
  shareToken?: string | null;
  storePlaceId?: string | null;
  storeWebsite?: string | null;
  storeName?: string | null;
  storeAddress?: string | null;
  storeZip?: string | null;
  storeLogoData?: string | null;
  items: GroceryItem[];
};

export type ShoppingAlternative = {
  name: string;
  category: string;
  quantity: string;
  size: string;
  reason: string;
  detail: string;
  facts?: ShoppingProductFacts | null;
  whyThisSwap?: string | null;
};

export type ShoppingAlternativesResponse = { alternatives: ShoppingAlternative[]; tip: string; usedAI: boolean };

export function newItem(id: string, category = 'Other'): GroceryItem {
  return { id, name: '', category, quantity: '1', size: '', notes: '', imageData: null, checked: false };
}

/** "2 × 12 oz", "3 bottles", or just the quantity. */
export function amountLabel(item: Pick<GroceryItem, 'quantity' | 'size'>): string {
  if (item.size === '') return item.quantity;
  if (/^\p{N}/u.test(item.size)) return item.quantity === '1' ? item.size : `${item.quantity} × ${item.size}`;
  return `${item.quantity} ${item.size}`;
}

export function remaining(list: Pick<GroceryList, 'items'>): number {
  return list.items.filter((item) => !item.checked).length;
}

export function itemCount(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

/** The list as plain text, for copying. */
export function shareText(list: Pick<GroceryList, 'title' | 'date' | 'items'>): string {
  return [
    list.title,
    list.date,
    ...list.items.map((item) => `${item.checked ? '✓' : '○'} ${item.name} — ${item.quantity} ${item.size}${item.notes === '' ? '' : ` · ${item.notes}`}`),
  ].join('\n');
}

function present<K extends string, V>(key: K, value: V | null | undefined): Partial<Record<K, V>> {
  return value == null ? {} : ({ [key]: value } as Record<K, V>);
}

export type ShoppingInput = Record<string, unknown> & { title: string; date: string; timeZone: string; weekly: boolean; items: Record<string, unknown>[] };

/**
 * The body of a create or save. Every item key is sent, and so are the store fields and each item's brand,
 * barcode and favourites when set: the server drops a chosen offer when an item's brand is left out, and
 * forgets the store's website when its fields are left out. `storeLogoData` is always sent ("" for none).
 */
export function listInput(
  list: Pick<GroceryList, 'title' | 'date' | 'timeZone' | 'weekly' | 'items' | 'storePlaceId' | 'storeWebsite' | 'storeName' | 'storeAddress' | 'storeZip' | 'storeLogoData'>,
): ShoppingInput {
  return {
    title: list.title,
    date: list.date,
    timeZone: list.timeZone,
    weekly: list.weekly,
    storeLogoData: list.storeLogoData ?? '',
    ...present('storePlaceId', list.storePlaceId),
    ...present('storeWebsite', list.storeWebsite),
    ...present('storeName', list.storeName),
    ...present('storeAddress', list.storeAddress),
    ...present('storeZip', list.storeZip),
    items: list.items.map((item) => ({
      ...present('brand', item.brand),
      ...present('barcode', item.barcode),
      ...present('favorite', item.favorite),
      ...present('favoriteAlternatives', item.favoriteAlternatives),
      id: item.id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      size: item.size,
      notes: item.notes,
      checked: item.checked,
      imageData: item.imageData ?? null,
    })),
  };
}

function contains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

export const SUGGESTIONS = ['Bananas', 'Apples', 'Tomatoes', 'Cherry Tomatoes', 'Spinach', 'Milk', 'Eggs', 'Cheese', 'Bread', 'Rice', 'Pasta', 'Coffee', 'Paper towels'] as const;

/** At most three names that contain what was typed. */
export function suggestionsFor(quick: string): string[] {
  if (quick === '') return [];
  return SUGGESTIONS.filter((name) => contains(name, quick)).slice(0, 3);
}

export function toggled(list: GroceryList, id: string): GroceryList {
  return { ...list, items: list.items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)) };
}

export function setAllChecked(list: GroceryList, checked: boolean): GroceryList {
  return { ...list, items: list.items.map((item) => ({ ...item, checked })) };
}

/** Replace in place, or append when the item is new. */
export function upserted(list: GroceryList, updated: GroceryItem): GroceryList {
  const index = list.items.findIndex((item) => item.id === updated.id);
  if (index === -1) return { ...list, items: [...list.items, updated] };
  const items = [...list.items];
  items[index] = updated;
  return { ...list, items };
}

export function removed(list: GroceryList, id: string): GroceryList {
  return { ...list, items: list.items.filter((item) => item.id !== id) };
}

export function appended(list: GroceryList, items: GroceryItem[]): GroceryList {
  return { ...list, items: [...list.items, ...items] };
}

/** The given source, else the newest completed list, else the newest list. */
export function previousList(lists: GroceryList[], source?: GroceryList | null): GroceryList | undefined {
  return source ?? lists.find((list) => list.completedAt != null) ?? lists[0];
}

/** The copy "Use last week's list" makes: every item unchecked. */
export function copiedItems(list: GroceryList | undefined, newId: () => string): GroceryItem[] {
  return (list?.items ?? []).map((item) => ({ ...item, id: newId(), checked: false }));
}

// ---------------------------------------------------------------------------------------------
// Icons

function words(name: string): Set<string> {
  return new Set(name.toLowerCase().split(/[^\p{L}]+/u).filter((word) => word !== ''));
}

const KEYWORD_EMOJI: [string[], string][] = [
  [['milk'], '🥛'],
  [['egg', 'eggs'], '🥚'],
  [['banana', 'bananas'], '🍌'],
  [['tomato', 'tomatoes'], '🍅'],
  [['mango', 'mangoes', 'mangos'], '🥭'],
  [['onion', 'onions'], '🧅'],
  [['apple', 'apples'], '🍎'],
  [['spinach', 'lettuce', 'kale'], '🥬'],
  [['carrot', 'carrots'], '🥕'],
  [['potato', 'potatoes'], '🥔'],
  [['avocado', 'avocados'], '🥑'],
  [['cheese'], '🧀'],
  [['bread'], '🍞'],
  [['rice'], '🍚'],
  [['pasta', 'spaghetti'], '🍝'],
  [['chicken'], '🍗'],
  [['fish', 'salmon'], '🐟'],
  [['coffee'], '☕️'],
  [['soap'], '🧼'],
];

const CATEGORY_EMOJI: Record<string, string> = {
  Produce: '🥬',
  'Dairy & Eggs': '🥛',
  'Meat & Seafood': '🥩',
  Bakery: '🥐',
  Pantry: '🫙',
  Frozen: '🧊',
  Drinks: '🧃',
  Household: '🧺',
};

/** A keyword emoji for the item's name, else its category's. */
export function groceryEmoji(item: Pick<GroceryItem, 'name' | 'category'>): string {
  const set = words(item.name);
  const match = KEYWORD_EMOJI.find(([keywords]) => keywords.some((word) => set.has(word)));
  if (match) return match[1];
  return CATEGORY_EMOJI[item.category] ?? '🛍️';
}

// ---------------------------------------------------------------------------------------------
// Alternatives

const NON_FOOD = new Set(['pump', 'parts', 'accessories', 'graphics', 'ssd', 'motherboard', 'processor', 'mouse', 'mice', 'keyboard', 'computer', 'laptop', 'desktop', 'monitor', 'charger', 'charging', 'cable', 'adapter', 'usb', 'headphones', 'earbuds', 'speaker', 'speakers', 'phone', 'iphone', 'ipad', 'macbook', 'watch', 'tv', 'television', 'camera', 'printer', 'electronics', 'battery', 'batteries', 'car', 'cars', 'automotive', 'motor', 'engine', 'brake', 'brakes', 'tire', 'tires', 'tyre', 'tyres', 'gear', 'gears', 'bearing', 'bearings', 'spark', 'coolant', 'wiper', 'mechanical', 'screw', 'screws', 'bolt', 'bolts', 'wrench', 'detergent', 'soap', 'shampoo', 'cleaner', 'tissue', 'tissues', 'towel', 'towels']);
const FOOD_CATEGORIES = ['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Bakery', 'Pantry', 'Frozen', 'Drinks'];
const FOODS = new Set(['mango', 'mangoes', 'tofu', 'snack', 'snacks', 'fruit', 'vegetable', 'vegetables', 'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'tomato', 'tomatoes', 'potato', 'potatoes', 'onion', 'onions', 'carrot', 'carrots', 'avocado', 'avocados', 'spinach', 'lettuce', 'broccoli', 'berry', 'berries', 'strawberries', 'grapes', 'lemon', 'lime', 'pepper', 'peppers', 'milk', 'egg', 'eggs', 'cheese', 'yogurt', 'butter', 'bread', 'bagel', 'bagels', 'tortilla', 'rice', 'pasta', 'flour', 'sugar', 'salt', 'olive', 'canola', 'sauce', 'beans', 'lentils', 'cereal', 'oats', 'honey', 'chicken', 'beef', 'pork', 'salmon', 'fish', 'shrimp', 'turkey', 'coffee', 'tea', 'juice', 'soda', 'water', 'nuts', 'almonds', 'chocolate', 'chips', 'crackers', 'cookies', 'soup']);

/** Nutrition alternatives apply to food, not to every item kept in a shopping list. */
export function supportsFoodAlternatives(item: Pick<GroceryItem, 'name' | 'category'>): boolean {
  const set = words(item.name);
  if ([...set].some((word) => NON_FOOD.has(word))) return false;
  if (FOOD_CATEGORIES.includes(item.category)) return true;
  if (item.category !== 'Other') return false;
  return [...set].some((word) => FOODS.has(word));
}

/** An alternative with the item's own name (ignoring case and spacing) is not offered. */
export function isOriginalItem(alternative: Pick<ShoppingAlternative, 'name'>, original: { name: string }): boolean {
  const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
  return key(alternative.name) === key(original.name);
}

/**
 * The original keeps its slot, id, quantity, size, notes and checked state; only the name, category, brand
 * and barcode change, and the photo is dropped so it cannot misdescribe the replacement. Null when the item
 * is no longer in the list.
 */
export function swapReplacing(originalId: string, alternative: ShoppingAlternative, list: GroceryList): GroceryList | null {
  const index = list.items.findIndex((item) => item.id === originalId);
  if (index === -1) return null;
  const items = [...list.items];
  items[index] = {
    ...items[index],
    name: alternative.name,
    category: alternative.category,
    barcode: alternative.facts?.barcode ?? null,
    brand: alternative.facts?.brand ?? null,
    imageData: null,
  };
  return { ...list, items };
}

/** Appended as a new item, unless one of the same name and size is already there (then null). */
export function swapAdding(alternative: ShoppingAlternative, list: GroceryList, id: string): GroceryList | null {
  const name = alternative.name.trim().toLowerCase();
  const size = alternative.size.toLowerCase();
  if (list.items.some((item) => item.name.trim().toLowerCase() === name && item.size.toLowerCase() === size)) return null;
  const added: GroceryItem = {
    id,
    name: alternative.name,
    category: alternative.category,
    quantity: alternative.quantity,
    size: alternative.size,
    notes: alternative.detail,
    imageData: null,
    checked: false,
    brand: alternative.facts?.brand ?? null,
    barcode: alternative.facts?.barcode ?? null,
  };
  return { ...list, items: [...list.items, added] };
}

// ---------------------------------------------------------------------------------------------
// Finishing a trip, and sharing

export type CompletionSummary = { listName: string; purchased: number; total: number; remaining: number; nextListReady: boolean };

/** What the "trip complete" card says, from the list as it was when completed. */
export function completionSummary(finished: { title: string; items: { checked: boolean }[] }, next: { completedAt?: string | null }): CompletionSummary {
  const left = finished.items.filter((item) => !item.checked).length;
  return { listName: finished.title, purchased: finished.items.length - left, total: finished.items.length, remaining: left, nextListReady: next.completedAt == null };
}

/**
 * The view-only link, in the compact form the app shares: /s/ and the 256-bit secret as 43 URL-safe
 * characters. Null for a token that is not 64 hex characters.
 */
export function shareUrl(origin: string, token: string): string | null {
  if (!/^[0-9a-fA-F]{64}$/.test(token)) return null;
  const bytes = token.match(/../g)!.map((pair) => parseInt(pair, 16));
  const binary = String.fromCharCode(...bytes);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${origin.replace(/\/+$/, '')}/s/${encoded}`;
}

/** A short date such as "Sep 25". A list's date is a calendar day, so it is formatted as one (in UTC). */
export function shortDay(day: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`));
  } catch {
    return day;
  }
}
