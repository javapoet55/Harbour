/**
 * `ShoppingRecommendationContext` (ios/App/AskNexdoView.swift:89-95) and the shopping-only copy of
 * `AskNexdoView` (`:195`, `:309-323`, `:402`, `:415-418`, `:469-473`): the Ask screen reused for AI
 * Powered Recommendations on a shopping list (global pattern 16).
 */
export type ShoppingRecommendationContext = { listName: string; itemNames: string[] };

/**
 * `AppModel.askShopping(_:context:)` (NexdoApp.swift:804-814): the question, the list's name and its
 * item names go to `POST /api/shopping/recommendations`, not into an `/api/assistant` prompt.
 */
export function recommendationInput(context: ShoppingRecommendationContext, prompt: string) {
  return { prompt, listName: context.listName, itemNames: context.itemNames };
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
