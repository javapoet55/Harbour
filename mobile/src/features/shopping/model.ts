import type { GroceryItem, GroceryList, ShoppingAlternative, ShoppingAlternativesResponse, ShoppingInput } from '../../api/shopping';

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

/** `ShoppingInput(list)` (ShoppingStore.swift:5-8). Every item key is encoded, `imageData` as `null` when absent. */
export function listInput(list: Pick<GroceryList, 'title' | 'date' | 'timeZone' | 'weekly' | 'items'>): ShoppingInput {
  return {
    title: list.title,
    date: list.date,
    timeZone: list.timeZone,
    weekly: list.weekly,
    items: list.items.map((item) => ({
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
 * `ShoppingAlternative.groceryItem` (ShoppingList.swift:44-46): a new, unchecked item with no image,
 * whose notes are the alternative's `detail`. `id` is the new item's (Swift: `UUID().uuidString`).
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
  };
}

function alternative(name: string, category: string, quantity: string, size: string, reason: string, detail: string): ShoppingAlternative {
  return { name, category, quantity, size, reason, detail };
}

/**
 * `ShoppingAlternativesResponse.local(for:)` (ShoppingList.swift:53-75), verbatim: what
 * `ShoppingStore.alternatives(for:)` shows when the request fails for any reason but a lost session.
 * It is the PHONE's list, not the server's fallback (src/server/shopping/alternatives.ts:45-55): the
 * reasons differ in places and the item's own quantity and size are kept.
 */
export function localAlternatives(item: Pick<GroceryItem, 'name' | 'category' | 'quantity' | 'size'>): ShoppingAlternativesResponse {
  const text = item.name.toLowerCase();
  if (text.includes('chicken')) {
    const size = item.size === '' ? 'lb' : item.size;
    return {
      alternatives: [
        alternative('Chicken breast (skinless)', 'Meat & Seafood', item.quantity, size, 'Lower calorie option', 'Lean cut with less saturated fat'),
        alternative('Turkey breast', 'Meat & Seafood', item.quantity, size, 'Lean protein', 'Mild flavor and lower in fat'),
        alternative('Salmon', 'Meat & Seafood', item.quantity, size, 'Omega-3 option', 'Rich flavor and useful nutrients'),
        alternative('Firm tofu', 'Produce', '1', 'package', 'Plant-based alternative', 'Versatile source of protein'),
        alternative('Chickpeas', 'Pantry', '2', 'cans', 'High-fiber option', 'Plant-based protein with fiber'),
      ],
      tip: 'Try turkey breast for a lean swap with a similar mild flavor.',
      usedAI: false,
    };
  }
  if (text.includes('milk')) {
    return {
      alternatives: [
        alternative('Low-fat milk', 'Dairy & Eggs', item.quantity, item.size, 'Lower-fat option', 'Similar dairy taste with less fat'),
        alternative('Lactose-free milk', 'Dairy & Eggs', item.quantity, item.size, 'Lactose-free', 'Dairy milk without lactose'),
        alternative('Unsweetened oat milk', 'Dairy & Eggs', '1', 'carton', 'Plant-based option', 'Creamy texture without dairy'),
        alternative('Unsweetened soy milk', 'Dairy & Eggs', '1', 'carton', 'More plant protein', 'Neutral flavor with protein'),
      ],
      tip: 'Choose an unsweetened alternative when you want to avoid added sugar.',
      usedAI: false,
    };
  }
  // `replacingOccurrences(of:"Organic ",with:"")`: every occurrence, case-sensitive.
  const base = item.name.split('Organic ').join('');
  return {
    alternatives: [
      alternative(`Organic ${base}`, item.category, item.quantity, item.size, 'Organic option', 'A comparable certified-organic choice'),
      alternative(`Store-brand ${base}`, item.category, item.quantity, item.size, 'Budget-friendly', 'A similar option that may cost less'),
      alternative(`Family-size ${base}`, item.category, item.quantity, item.size === '' ? 'large pack' : item.size, 'Larger package', 'Useful when you need more servings'),
    ],
    tip: `Compare unit prices and package sizes before replacing ${base}.`,
    usedAI: false,
  };
}

/**
 * "Replace with Selected Item" — `ShoppingDetail.replace(_:with:)` (ShoppingViews.swift:344-351): the
 * alternative takes the original's slot, id and checked state. `null` when the original is no longer
 * on the list, where Swift returns without saving.
 */
export function replacedWithAlternative(list: GroceryList, originalId: string, choice: ShoppingAlternative): GroceryList | null {
  const index = list.items.findIndex((item) => item.id === originalId);
  if (index === -1) return null;
  const original = list.items[index];
  const items = [...list.items];
  items[index] = { ...alternativeItem(choice, original.id), checked: original.checked };
  return { ...list, items };
}

/** "Add to Cart Instead" — `ShoppingDetail.add(_:)` (ShoppingViews.swift:352): appended as a new item. */
export function addedAlternative(list: GroceryList, choice: ShoppingAlternative, id: string): GroceryList {
  return { ...list, items: [...list.items, alternativeItem(choice, id)] };
}

// ---------------------------------------------------------------------------------------------
// GroceryArtwork (ShoppingViews.swift:363-402)

export type GroceryAsset = 'onion' | 'milk' | 'banana' | 'tomato' | 'eggs';

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
  if (any(set, ['banana', 'bananas'])) return 'banana';
  if (any(set, ['tomato', 'tomatoes'])) return 'tomato';
  if (any(set, ['egg', 'eggs'])) return 'eggs';
  return null;
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
