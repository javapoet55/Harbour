/**
 * `ShoppingRecommendationContext` (ios/App/AskNexdoView.swift:89-95) and the shopping-only copy of
 * `AskNexdoView` (`:195`, `:309-323`, `:402`, `:415-418`, `:469-473`): the Ask screen reused for AI
 * Powered Recommendations on a shopping list (global pattern 16).
 */
export type ShoppingRecommendationContext = { listName: string; itemNames: string[] };

/** `assistantContext` (AskNexdoView.swift:92-94), character for character. */
export function shoppingAssistantContext(context: ShoppingRecommendationContext): string {
  const items = context.itemNames.length === 0 ? 'none yet' : context.itemNames.join(', ');
  return `Review my shopping list "${context.listName}". Current items: ${items}. Give practical grocery advice for this list. Do not add, replace, remove, or complete anything without my explicit approval.`;
}

/** `request(_:)` (AskNexdoView.swift:469): the context goes first, then the customer's own words. */
export function shoppingSubmission(context: ShoppingRecommendationContext, query: string): string {
  return `${shoppingAssistantContext(context)}\n\nCustomer request: ${query}`;
}

/** `promptSuggestions` with a shopping context (AskNexdoView.swift:309-316). */
export const SHOPPING_PROMPTS = [
  'What practical essentials are missing from this list?',
  'Suggest groceries for three balanced dinners.',
  'Find budget-friendly swaps for items on this list.',
  'Check whether these quantities look right for one week.',
] as const;

export type ShoppingPromptIcon = 'basket.fill' | 'fork.knife' | 'dollarsign.circle' | 'number.circle';

/** `suggestionIcon(_:)` (AskNexdoView.swift:318-323). */
export function shoppingPromptIcon(prompt: string): ShoppingPromptIcon {
  if (prompt.includes('dinners')) return 'fork.knife';
  if (prompt.includes('budget')) return 'dollarsign.circle';
  if (prompt.includes('quantities')) return 'number.circle';
  return 'basket.fill';
}
