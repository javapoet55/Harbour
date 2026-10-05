import type { GroceryItem, GroceryList, ShoppingAlternative, ShoppingInput } from '../../api/shopping';

/**
 * The pure Shopping model: ios/Sources/NexdoCore/ShoppingList.swift and the logic ShoppingViews.swift
 * keeps inline. Nothing here touches the network or the device.
 */

/** `GroceryItem.categories` (ShoppingList.swift:28), in Swift's section order. */
export const CATEGORIES = ['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Bakery', 'Pantry', 'Frozen', 'Drinks', 'Household', 'Other'] as const;

/** `GroceryItem(category:)`: a new, unchecked item with Swift's defaults. */
export function newItem(id: string, category = 'Other'): GroceryItem {
  return { id, name: '', category, quantity: '1', size: '', notes: '', imageData: null, checked: false };
}

/** `amountLabel` (ShoppingList.swift:23-27). */
export function amountLabel(item: Pick<GroceryItem, 'quantity' | 'size'>): string {
  if (item.size === '') return item.quantity;
  if (/^\p{N}/u.test(item.size)) return item.quantity === '1' ? item.size : `${item.quantity} × ${item.size}`;
  return `${item.quantity} ${item.size}`;
}

/** `remaining` (ShoppingList.swift:43). */
export function remaining(list: Pick<GroceryList, 'items'>): number {
  return list.items.filter((item) => !item.checked).length;
}

/** `GroceryList.itemCount(_:)` (ShoppingList.swift:107-110): "1 item" / "N items" for list counts shown in the UI. */
export function itemCount(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

/** `shareText` (ShoppingList.swift:44-46), character for character. */
export function shareText(list: Pick<GroceryList, 'title' | 'date' | 'items'>): string {
  return [
    list.title,
    list.date,
    ...list.items.map((item) => `${item.checked ? '✓' : '○'} ${item.name} — ${item.quantity} ${item.size}${item.notes === '' ? '' : ` · ${item.notes}`}`),
  ].join('\n');
}

/** Swift's synthesized `encodeIfPresent`: the key only when it has a value. */
function present<K extends string, V>(key: K, value: V | null | undefined): Partial<Record<K, V>> {
  return value == null ? {} : ({ [key]: value } as Record<K, V>);
}

/**
 * `ShoppingInput(list)` (ShoppingStore.swift:5-10) and `GroceryItem.encode(to:)` (ShoppingList.swift:30-38).
 * Every item key is encoded, `imageData` as `null` when absent; `brand`, `barcode`, `favorite`,
 * `favoriteAlternatives` and the store fields only when set; `chosenOffer` never. Leaving `brand` out
 * would make the server drop the item's chosen offer (src/server/shopping/service.ts:68).
 */
export function listInput(
  list: Pick<GroceryList, 'title' | 'date' | 'timeZone' | 'weekly' | 'items' | 'storePlaceId' | 'storeWebsite' | 'storeName' | 'storeAddress' | 'storeZip'>,
): ShoppingInput {
  return {
    title: list.title,
    date: list.date,
    timeZone: list.timeZone,
    weekly: list.weekly,
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

/** Swift's `localizedCaseInsensitiveContains`. */
function contains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

/** The phone-side suggestions (ShoppingViews.swift:237-238), verbatim, and at most three of them. */
export const SUGGESTIONS = ['Bananas', 'Apples', 'Tomatoes', 'Cherry Tomatoes', 'Spinach', 'Milk', 'Eggs', 'Cheese', 'Bread', 'Rice', 'Pasta', 'Coffee', 'Paper towels'] as const;

export function suggestionsFor(quick: string): string[] {
  if (quick === '') return [];
  return SUGGESTIONS.filter((name) => contains(name, quick)).slice(0, 3);
}

/** The next list after a toggle (ShoppingViews.swift:287-291). */
export function toggled(list: GroceryList, id: string): GroceryList {
  return { ...list, items: list.items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)) };
}

/** "Uncheck all" (ShoppingViews.swift:266). */
export function uncheckedAll(list: GroceryList): GroceryList {
  return { ...list, items: list.items.map((item) => ({ ...item, checked: false })) };
}

/** The item editor's save (ShoppingViews.swift:270): replace in place, or append a new one. */
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

/**
 * `previous` for "Use Last Week's List" (ShoppingViews.swift:152): the given source, else the newest
 * completed list, else the newest list.
 */
export function previousList(lists: GroceryList[], source?: GroceryList | null): GroceryList | undefined {
  return source ?? lists.find((list) => list.completedAt != null) ?? lists[0];
}

/** The copy "Use Last Week's List" and "Use This List Again" create (ShoppingViews.swift:180): unchecked. */
export function copiedItems(list: GroceryList | undefined): GroceryItem[] {
  return (list?.items ?? []).map((item) => ({ ...item, checked: false }));
}

// ---------------------------------------------------------------------------------------------
// Item alternatives (ShoppingList.swift:33-76, ShoppingViews.swift:344-352)

/** `ShoppingAlternative.id` (ShoppingList.swift:40): the four item fields joined with `|`. */
export function alternativeId(alternative: Pick<ShoppingAlternative, 'name' | 'category' | 'quantity' | 'size'>): string {
  return [alternative.name, alternative.category, alternative.quantity, alternative.size].join('|');
}

/**
 * `ShoppingAlternative.groceryItem` (ShoppingList.swift:74-78): a new, unchecked item with no image,
 * whose notes are the alternative's `detail`, with the source's brand and barcode when it has them.
 * `id` is the new item's (Swift: `UUID().uuidString`).
 */
export function alternativeItem(alternative: ShoppingAlternative, id: string): GroceryItem {
  return {
    id,
    name: alternative.name,
    category: alternative.category,
    quantity: alternative.quantity,
    size: alternative.size,
    notes: alternative.detail,
    imageData: null,
    checked: false,
    ...(alternative.facts?.brand ? { brand: alternative.facts.brand } : {}),
    ...(alternative.facts?.barcode ? { barcode: alternative.facts.barcode } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// GroceryArtwork (ShoppingViews.swift:363-402)

export type GroceryAsset = 'onion' | 'milk' | 'mango' | 'banana' | 'tomato' | 'eggs';

/** `words`: the name lowercased and split on every non-letter. */
function words(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((word) => word !== ''),
  );
}

function any(set: Set<string>, candidates: string[]): boolean {
  return candidates.some((word) => set.has(word));
}

/** The bundled illustration, matched by whole word, in Swift's order (`asset`, `:367-374`). */
export function groceryAsset(name: string): GroceryAsset | null {
  const set = words(name);
  if (any(set, ['onion', 'onions'])) return 'onion';
  if (set.has('milk')) return 'milk';
  if (any(set, ['mango', 'mangoes', 'mangos'])) return 'mango';
  if (any(set, ['banana', 'bananas'])) return 'banana';
  if (any(set, ['tomato', 'tomatoes'])) return 'tomato';
  if (any(set, ['egg', 'eggs'])) return 'eggs';
  return null;
}

const NON_FOOD = new Set(['pump', 'parts', 'accessories', 'graphics', 'ssd', 'motherboard', 'processor', 'mouse', 'mice', 'keyboard', 'computer', 'laptop', 'desktop', 'monitor', 'charger', 'charging', 'cable', 'adapter', 'usb', 'headphones', 'earbuds', 'speaker', 'speakers', 'phone', 'iphone', 'ipad', 'macbook', 'watch', 'tv', 'television', 'camera', 'printer', 'electronics', 'battery', 'batteries', 'car', 'cars', 'automotive', 'motor', 'engine', 'brake', 'brakes', 'tire', 'tires', 'tyre', 'tyres', 'gear', 'gears', 'bearing', 'bearings', 'spark', 'coolant', 'wiper', 'mechanical', 'screw', 'screws', 'bolt', 'bolts', 'wrench', 'detergent', 'soap', 'shampoo', 'cleaner', 'tissue', 'tissues', 'towel', 'towels']);
const FOOD_CATEGORIES = ['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Bakery', 'Pantry', 'Frozen', 'Drinks'];
const FOODS = new Set(['mango', 'mangoes', 'tofu', 'snack', 'snacks', 'fruit', 'vegetable', 'vegetables', 'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'tomato', 'tomatoes', 'potato', 'potatoes', 'onion', 'onions', 'carrot', 'carrots', 'avocado', 'avocados', 'spinach', 'lettuce', 'broccoli', 'berry', 'berries', 'strawberries', 'grapes', 'lemon', 'lime', 'pepper', 'peppers', 'milk', 'egg', 'eggs', 'cheese', 'yogurt', 'butter', 'bread', 'bagel', 'bagels', 'tortilla', 'rice', 'pasta', 'flour', 'sugar', 'salt', 'olive', 'canola', 'sauce', 'beans', 'lentils', 'cereal', 'oats', 'honey', 'chicken', 'beef', 'pork', 'salmon', 'fish', 'shrimp', 'turkey', 'coffee', 'tea', 'juice', 'soda', 'water', 'nuts', 'almonds', 'chocolate', 'chips', 'crackers', 'cookies', 'soup']);

/**
 * `supportsFoodAlternatives` (ios/Sources/NexdoCore/ShoppingList.swift:40-50): "Nutrition alternatives
 * apply to food, not every item stored in a shopping list." The name is checked first — "older parsers
 * can classify “Apple mouse” as produce" — then the food categories, then common foods under Other.
 */
export function supportsFoodAlternatives(item: Pick<GroceryItem, 'name' | 'category'>): boolean {
  const set = words(item.name);
  if ([...set].some((word) => NON_FOOD.has(word))) return false;
  if (FOOD_CATEGORIES.includes(item.category)) return true;
  if (item.category !== 'Other') return false;
  return [...set].some((word) => FOODS.has(word));
}

const KEYWORD_EMOJI: [string[], string][] = [
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

/** `fallback` (`:375-394`): a keyword emoji, else the category's. */
export function groceryEmoji(item: Pick<GroceryItem, 'name' | 'category'>): string {
  const set = words(item.name);
  const match = KEYWORD_EMOJI.find(([keywords]) => any(set, keywords));
  if (match) return match[1];
  return CATEGORY_EMOJI[item.category] ?? '🛍️';
}

export type Artwork = { kind: 'photo'; base64: string } | { kind: 'asset'; asset: GroceryAsset } | { kind: 'emoji'; emoji: string };

/**
 * The image priority (`body`, `:395-401`): the attached photo, then the bundled illustration, then the
 * emoji.
 *
 * Swift falls through when the stored data does not DECODE (`UIImage(data:)` is nil). Whether it
 * decodes is only known once the image loads, so `GroceryArtwork` passes `skip` for a stage whose
 * image failed. The server accepts any string shaped like JPEG base64 (`/^\/9j\/…$/`), so `/9j/AA==`
 * passes validation and decodes to nothing: without the skip it drew an empty slot where the
 * illustration belongs.
 */
export function artworkFor(
  item: Pick<GroceryItem, 'name' | 'category' | 'imageData'>,
  skip: { photo?: boolean; asset?: boolean } = {},
): Artwork {
  if (item.imageData && !skip.photo) return { kind: 'photo', base64: item.imageData };
  const asset = groceryAsset(item.name);
  if (asset && !skip.asset) return { kind: 'asset', asset };
  return { kind: 'emoji', emoji: groceryEmoji(item) };
}

// ---------------------------------------------------------------------------------------------
// ShoppingTranscript (ShoppingList.swift:48-63)

/**
 * Each completed utterance is keyed by the provider's item id, so duplicate events and partial
 * transcription updates never add the same groceries twice.
 */
export class ShoppingTranscript {
  private order: string[] = [];
  private final = new Map<string, string>();
  private partial = new Map<string, string>();

  append(id: string, text: string, completed: boolean): void {
    if (!this.order.includes(id)) this.order.push(id);
    if (completed) {
      this.final.set(id, text);
      this.partial.delete(id);
    } else if (!this.final.has(id)) {
      this.partial.set(id, (this.partial.get(id) ?? '') + text);
    }
  }

  get text(): string {
    return this.order
      .map((id) => this.final.get(id) ?? this.partial.get(id))
      .filter((value): value is string => value !== undefined && value !== '')
      .join('; ');
  }

  get completedText(): string {
    return this.order
      .map((id) => this.final.get(id))
      .filter((value): value is string => value !== undefined && value !== '')
      .join('; ');
  }

  get hasPending(): boolean {
    return this.partial.size > 0;
  }
}
