# Production food data for Item Alternatives

## Existing flow

`POST /api/shopping` with `operation: "alternatives"` remains authenticated through `requireUser`. Its input accepts optional `brand`, `barcode`, and `goal` alongside the existing name/category/quantity/size. Native requests now pass stored brand/barcode metadata. No provider schema, credential, account email, account ID, or user ID is sent to iOS or to food providers. Only individual product queries leave the backend.

Responses retain the existing alternatives contract and add `originalFacts`, per-alternative `facts`, `nutritionComparison`, `nutritionUnavailable`, and `whyThisSwap`. Swift performs its existing deterministic comparison from the same normalized values. Replace/Add use the existing shopping save operation.

## Sources and matching

- USDA FoodData Central search and full food details supply generic representative nutrition or conservatively matched branded data. Full-detail nutrients are normalized per **100 g**, never confused with per-serving label values. kcal, g, and mg conversions are explicit.
- Open Food Facts provides exact barcode lookup and structured brand search. Name-only branded discovery can use USDA, then query OFF by the discovered barcode. Exact OFF records take precedence as a whole record; values from a generic food are never mixed into a packaged label.
- Matching is intentionally conservative: whole milk must not match a milk-containing dish, buttermilk, cheese, yogurt, flavored or powdered milk. Unknown/unmatched foods retain the usable alternatives flow with facts unavailable.
- OFF contains and trace tags remain separate. Only explicit dietary label tags are used, not computed ingredient-analysis claims. Missing tags never mean allergen-free. Contradictory free-from/dietary claims are suppressed.
- Ingredients and provenance appear in the native detail screen. Generic foods are explicitly labeled representative, exact barcode matches are labeled exact, and stale cached records are labeled accordingly. Pricing is not available from these providers and stays absent.

Current provider references: [USDA API guide](https://fdc.nal.usda.gov/api-guide/), [OFF API guidance and limits](https://openfoodfacts.github.io/openfoodfacts-server/api/), [OFF search capabilities](https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/). OFF v2 product/structured search is still supported; it is used for its stable response contract. The current v3 search endpoint is not implemented. A future v3 product migration must update tag normalization and fixtures together. OFF data is attributed in the UI with a source link and is subject to ODbL; its individual contents and images have separate licenses. We do not copy OFF images into repository assets.

## Cache and scale

`FoodDataCache` uses the existing Prisma/Postgres database (SQLite in isolated tests). Keys are SHA-256 hashes of normalized product identifiers or factual explanation inputs, with a v1 namespace and record schema version. No user-specific cache partition is needed.

Defaults: exact product 14 days, generic normalized food 30 days, search resolution 24 hours, negative result 1 hour, explanations 7 days, stale grace 2 days. Slightly stale data returns immediately and refreshes via Next `after`. Very stale records are not returned. Timeouts/outages do not replace good cached records with negative results.

An in-process promise map coalesces requests; an atomic database lease coalesces across workers/replicas. A second worker waits briefly for the owner and does not duplicate provider requests. Shared database budgets cap USDA at 900/hour, OFF reads at 14/minute and searches at 9/minute. HTTP 429 sets a shared cooldown, and bounded exponential retry handles transient failures. Provider limits take precedence over always returning facts for a cold item. At substantially larger catalogs, follow OFF's bulk-data guidance rather than increasing API pressure.

`FoodProviderBudget` has a small fixed set of rows. Cache rows have an indexed `staleUntil`; operators can periodically remove long-expired, unleased rows using the existing database maintenance process.

## Explanations

Numeric differences are calculated in application code. The default explanation is deterministic and factual. Optional GPT explanation selection only runs after facts exist and selects indices from immutable fact-derived statements. It cannot introduce free-text nutrients, allergens, prices, availability, certifications, or medical claims. Results are cached by original/alternative nutrition, dietary attributes, goal, and version. Existing OpenAI networking, model configuration, and telemetry are reused.

## Deployment

1. Apply `20260925170000_food_data` with the existing migration deployment command. It adds the two cache/budget tables and shopping item brand/barcode/favorite fields. It is additive and does not modify existing items.
2. Configure server-side `USDA_FDC_API_KEY` and `OPEN_FOOD_FACTS_CONTACT_EMAIL`. Never use `NEXT_PUBLIC_` variables or native build settings for these values. The supplied credentials were stored only in ignored local `.env.local`; production hosting needs its own secret configuration.
3. Optionally enable `FOOD_GPT_EXPLANATIONS_ENABLED=true` after setting the existing `OPENAI_API_KEY`. Deterministic explanations work without GPT.
4. Deploy the backend and build the updated native app. Until the migration is deployed, food enrichment degrades to unavailable; new favorite/brand/barcode persistence requires the migration.

Optional tuning variables in `.env.example`: `FOOD_EXACT_TTL_SECONDS`, `FOOD_GENERIC_TTL_SECONDS`, `FOOD_SEARCH_TTL_SECONDS`, `FOOD_NEGATIVE_TTL_SECONDS`, `FOOD_EXPLANATION_TTL_SECONDS`, `FOOD_STALE_TTL_SECONDS`, `FOOD_TIMEOUT_SECONDS` (default 8 seconds per attempt, maximum 10).

Metrics reuse `src/lib/metrics.ts` and provider health telemetry: requests/errors/rate limits, cache hits/misses/stale/errors, match quality, GPT request/results, and provider latency. URLs, headers, upstream errors, shopping text, and credentials are not logged. Cache hit rate can be derived from hit/miss counters.

## Validation and limits

Provider fixtures cover normalization, units, ingredients, declared/unknown allergens, trace separation, exact/generic matching, source precedence, missing facts, retries, and rate limits. Cache tests cover shared hits, misses, expiration, stale refresh, negative caching, version invalidation, and 100 concurrent requests. Integration tests use a migrated isolated SQLite database and the existing shopping action/save/read flow. Swift tests cover production metadata decoding and replacement identity. Native UI tests cover detail tabs, replacement, and persisted favorites.

Live read-only smoke checks confirmed USDA whole milk and 2% milk nutrition and an OFF barcode response using the actual provider clients. No credentials are included in fixtures, source code, or this document.

Limitations: no barcode scanner is added; stored or API-supplied barcodes are supported. Brand lookup requires a conservative name/brand or exact barcode match, so some real products will correctly show unavailable data. OFF is community-maintained, and the label disclaimer remains visible. No database can certify a product safe for an allergy.
