# Shopping List offers

## Release scope

Native iOS now has store settings (name, address, ZIP), an item offer badge, list overview, Matching / Available / Alternatives and store filters, offer details, and choose/change/remove actions. Existing item entry, categories, selection, favorites/alternatives, email scheduling and trip completion are preserved. Chosen offers are separate from original item preferences. Editing preferences/location clears the choice; recurring trips retain store settings but start without old offer selections.

The API matches the current saved list against the current shared catalog on each read. There is no per-user scraping or stale materialized match cache. iOS refreshes badges when the list revision changes; overview refresh/pull-to-refresh reads newly collected offers. No ML, recommendations personalization, restock predictions or trip optimization is included. The Expo client does not yet have the new Offers screens; this release targets the native Xcode app shown in the references.

## Confirmed source — 2026-10-03

- Costco: `https://www.costco.com/o/-/warehouse-savings` fetched successfully from the development host. HTML contains a global date range, warehouse applicability, item descriptions, sizes, explicit savings, and sometimes selling prices. Collect only warehouse entries with explicit savings and an identified validity period. Restrict the region to contiguous US ZIP prefixes 010–966; AK/HI/PR/territories and Business Centers are not supported. Supported stores: Costco (warehouses in the contiguous US; “Warehouse” and “Warehouse Only” tiles, not “Online Only” or Business Centers) and the Albertsons-family banners (Safeway, Vons, Jewel-Osco, ACME, Shaw’s, Tom Thumb, Randalls, Pavilions, Albertsons, Albertsons Market, Andronico’s, Balducci’s, United Supermarkets, Market Street, Haggen, Carrs, Amigos, Kings Food Markets and Star Market). Store names are matched loosely, so “Costco Wholesale” or “Safeway - Bay Area” work.
- **Costco** offers come from the published warehouse-savings page and are collected into the shared source `costco-us-warehouse`. Package size is read from the text block before the item number, not from generated CSS class names.
- **Albertsons-family** offers come from each store’s digital Weekly Ad (Flipp-powered, the same data shown at `<store>/weeklyad`). Their merchant id and public access token are resolved at runtime from the store’s own weekly-ad page, so no credential is stored. Sources are per store per ZIP (`flipp:<merchant>:<zip>`) and are created only for store/ZIP combinations customers actually use; sources no list uses are removed. Prices can be local and loyalty-specific, so the offer conditions say so.
Each tick upserts needed sources, then collects up to 10 due sources per run (one success per source per 24h, exponential backoff up to 6h on failures, which are logged as `shopping_offers_check_failed`). Address is retained for the user's location, while published regional offers are shared. This is not a guarantee of inventory at that address.
- Target: `https://www.target.com/weekly-ad` is accessible but the inspected response did not expose verifiable location-specific offer records. NOT enabled. Do not populate the screenshot's Target prices as production deals. Add and validate a location-specific adapter before enabling this source.

Collector uses a fixed HTTPS URL, forbids redirects, caps body size at 6 MB and request time at 20 seconds. Source markup changes fail closed. `Save $X` is savings, never a selling price. `After $X OFF` plus an explicit price supports showing both. No inferred regular prices, computed savings, or inferred unit prices. Unit price stays absent unless a future source explicitly publishes one. Conditions and the original source link remain visible.

Matching uses explicit product families (see `families` in `src/server/shopping/offers/domain.ts`): staples such as coffee, cooking oils, milk, eggs, bread, butter, yogurt, rice, pasta, paper goods, detergent, chicken, salmon and cheese, plus common warehouse categories such as water, juice, snacks, cookies, candy, soup, pizza, personal care, batteries, supplements, medicine and pet food. Specific product types are checked before the staples they mention, so “Butter” does not match butter cookies and “Rice” does not match Rice Krispies Treats. For broad families (supplements, medicine, pet food) an offer must share at least one word with the item. Unknown families produce no matches. Known brands embedded in names and explicit item brand fields are checked. Any differing/unverified brand, package size, name qualifier or note puts the offer in Alternatives. Package size comparison is conservative; equivalent but differently written sizes may be alternatives. Quantities represent number of packages, not package size. Extend families/brand aliases with regression tests as sources expand.

## Deploy and enable

1. Apply `20261003070000_shopping_offers` after preceding migrations using the normal migration deployment. PostgreSQL and SQLite migrations are supplied.
2. Deploy the backend and updated `scripts/moments-worker.mjs`. The worker calls `POST /api/shopping/offers-tick` with existing `HARBOR_CRON_SECRET` credentials; no new public mutation endpoint for catalog ingestion exists.
3. Set `SHOPPING_OFFERS_ENABLED=true` on the backend service. Default is off. One catalog lease per source region prevents concurrent collection; next check is 24 hours after success. Failed checks retry after 15 minutes, doubling to a 6-hour cap. Leases expire after 2 minutes and an ownership token fences replacement workers.
4. Verify a successful tick and source records before publishing the new iOS build. The first valid snapshot enables display for supported locations. An unavailable source is explained in the UI, not represented by sample prices.
5. Run the new native app build on the phone. Local builds do not update installed App Store apps.

Reads exclude expired/not-yet-valid offers and catalogs whose last successful check is older than 48 hours. Successful refresh atomically replaces a regional snapshot. Existing chosen product information remains as a shopping reference when its offer expires, without retaining an outdated price; the UI flags it and permits removal. Choosing always revalidates expiry, freshness, location, match and ownership inside a revision-checked transaction. Only the user can choose an alternative; list preferences are not silently overwritten.

## Verification

`npx vitest run src/server/shopping/offers/offers.test.ts src/server/shopping/shopping.test.ts src/server/shopping/email.test.ts`

`npm run typecheck`

Build `ios/Nexdo.xcodeproj`, scheme Nexdo. Debug flags `-shopping-design-preview -shopping-offers-preview` show explicitly labeled synthetic design data using a `.invalid` URLProtocol host; they do not fetch live deals or mutate a customer's list.
