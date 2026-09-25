# Native shopping alternatives

The existing Shopping List blue-star entry opens `ShoppingAlternativesView`. Goal chips filter alternatives using optional structured facts, with a match count or explicit no-match state and a Show all action, while the existing alternatives endpoint supplies practical suggestions. All detail buttons push one details screen inside the existing navigation stack with Nutrition, Allergens, Why this?, and Best For tabs.

## Facts and sources

`ShoppingProductFacts` is optional metadata separate from recommendation text. It records source, optional source URL/date, serving-based nutrition, explicitly declared allergens/dietary attributes, uses, and optional price/package/currency. Nutrition uses kcal, grams for macronutrients, and milligrams for sodium/calcium. Comparisons normalize positive finite servings with matching `g` or `ml` units; incompatible or unknown servings have no difference.

Production enrichment now uses USDA FoodData Central and Open Food Facts through the existing backend. See [food-data.md](food-data.md) for matching, provenance, caching, configuration, and deployment. Missing facts remain unavailable; model output is never a nutrition/allergen source.

Numeric sample values exist only in the DEBUG `ShoppingPreview` mock transport and unit tests, explicitly labeled as test fixtures. General milk usage suggestions use a deterministic culinary mapping, not nutritional or allergy inference.

## Persistence and behavior

- Replace modifies the original item in its existing list, retaining identity, quantity, size, notes, checked state, favorites, and list metadata.
- Add Instead appends a new item and keeps the original. Matching names/package sizes are rejected as duplicates.
- Favorites use optional fields on the existing shopping item JSON, accepted by the backend item save schema and persisted in the additive shopping item migration. Deploy the corresponding backend schema change before relying on favorites in a device build against production.
- Completed-list changes create an active copy, matching existing shopping edit behavior.
- Save failures leave the detail screen open with an error; success closes it after persistence. Existing revision checks and analytics are reused.
- Alternatives are cached per store for five minutes, capped at 30 entries. Scrolling and switching tabs make no recommendation calls.

## Artwork

The five `swap-*.imageset` cartons were extracted from the user-supplied `ChatGPT Image Sep 25, 2026, 08_59_25 AM.png` asset sheet. They are generic category illustrations, not evidence of a particular manufacturer/product. Other products retain the existing grocery placeholder. Native SF Symbols and existing NexDo color/gradient tokens keep controls accessible and scalable.

## Validation

Core tests cover numeric differences, serving normalization, missing/invalid facts, goal ranking, price comparability, explicit allergen declarations, replacement metadata, duplicate additions, legacy decoding, and favorites. Backend tests verify favorite schema compatibility and reject model-generated factual metadata. Native UI tests exercise the blue-star entry, detail tabs, Replace, Add Instead, closing without replacement, and saved favorites using the existing offline shopping preview.

For manual testing, launch the DEBUG app with `-shopping-design-preview`, open Weekly Shopping List, and tap the blue star beside Milk. For normal server-backed testing, launch without preview arguments; unverified product facts should remain unavailable.

Request failures are displayed with Retry instead of silently substituting unverified local alternatives. Xcode Debug uses app-dev.nexdoapp.com; its backend needs the same food-data migration and server-only provider configuration as production.
