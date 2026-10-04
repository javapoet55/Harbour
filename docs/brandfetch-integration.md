# NexDo Brandfetch Integration

## Architecture

Audit: ShoppingList persists store name/address/ZIP, with no separate canonical Store table. Offers have source/location records for collection, not a general identity model. Store Manager name/email belong to ShoppingEmailSchedule. Recommendations are item-level and must not trigger brand lookup. Native ShoppingStore manages list requests. The previous local StoreLogo attempted a missing binary endpoint; it is replaced. Existing AsyncImage callers have no bounded shared loader, while ProfilePhotoEncoder demonstrates ImageIO downsampling.

`StoreBrandService` centralizes matching and cache policy; `BrandfetchClient` owns typed provider calls. StoreBrandLogo is a reusable iOS component consuming backend metadata. Existing `FoodDataCache` storage/lease primitives are reused under a separate `store-brand:v1:` namespace; no duplicate Store table or asset bucket.

## Brand Resolution Flow

Authenticated list ID → saved store identity → cache → saved domain or conservative Brand Search match → canonical domain cache → Brand API verifies exact domain → safe raster logo URL. Fallback metadata has no logo. The endpoint is separate from list loading, so provider latency cannot block shopping.

## Google Places Relationship

Shopping store search previously omitted websites, although task-agent Places research already used websiteUri. Now the same search requests it and returns `website`; selected `storePlaceId` and `storeWebsite` persist on ShoppingList and carry to next week's list. Manual location edits clear identity. Older clients changing store fields without website/ID also clear old identity. Existing lists are not backfilled with guessed domains. No extra Places details requests or logo lookup per nearby result.

## Environment Configuration

`BRANDFETCH_API_KEY` is backend-only. `BRANDFETCH_CLIENT_ID` is the distinct Search credential. See [setup](brandfetch-setup.md). Tests pin both empty by default. No live provider verification was required for unit tests.

## Cache Strategy

Positive metadata TTL **29 days**, leaving an hourly-cleanup margin under the provider's 30-day maximum. Negative TTL **24 hours**. Domain keys take precedence; accepted name results reuse the domain cache without extending its expiry. Cache outages fail closed to a cart rather than stampeding the provider. No stale logo served after expiry. The authenticated offers tick deletes expired brand cache rows even when offers are disabled. Deployment must keep this worker running. Assets are hotlinked to Brandfetch's returned CDN URL; no server image downloading or persistent iOS logo cache.

## Match Confidence Strategy

Small explicit alias table for common retailers, including Costco/Whole Foods/Trader Joe's/99 Ranch. Name-only results require both an exact normalized alias match and its expected domain. Domains are confidence anchors, never fabricated logo URLs. Unknown local names, including Joe's Market, cannot acquire another brand's logo via fuzzy matching. A saved website allows unknown local businesses to resolve, but returned Brand API domain and normalized brand name must agree. Known retailer domains can accept location suffixes. Social website brands are rejected for unrelated local stores. Meaningful subdomains are retained, not collapsed. An ambiguous Target Pharmacy name needs its actual selected website.

## Fallback Behavior

Missing key, unknown brand, denied/limited provider, malformed JSON, timeout, missing raster logo, blocked redirects, large image, or decode failure all retain the generic cart. No provider errors or payloads reach iOS. Image identity resets on list/store changes; cancelled requests cannot paint a stale logo.

## UI Integration

Shopping List detail header uses StoreBrandLogo at a stable 56×56 size, aspect-fit padding, and a brand accessibility label. Resolution occurs in a SwiftUI identity-keyed task rather than body rendering. Remote images have 8-second request/10-second resource limits, HTTPS exact-host checks, redirects rejected, 1 MB byte limit, and off-main ImageIO thumbnail decoding to 168px. A bounded 4MB/30-entry memory cache reuses decoded logos for 60 seconds when reopening the same list; there is no disk cache. No product-row lookup.

## Security

Secrets only in backend environment and Brand API Authorization. Search uses its public client ID. External URLs are never fetched by the backend except fixed Brandfetch API hosts. Returned logo URL must be HTTPS cdn.brandfetch.io without userinfo, port, or fragment; only the provider public `c` query parameter is allowed. Normalized schema strips all other provider fields. No raw logging. List endpoint checks ownership and limits requests per user. Counters contain no user/store identifiers or credentials.

## Rate-Limit Protection

Existing database leases coalesce requests across replicas. Existing provider-budget machinery allows 100 Brandfetch HTTP requests/hour shared across replicas; 429 Retry-After sets shared backoff (60s–1h). Maximum one retry on 5xx, no auth or 429 retries; 4s timeout per attempt and 512KB JSON limit. Safe counters: lookup, cache_hit, cache_miss, match, no_match, error, rate_limited.

## Testing

Mocked provider tests cover identities, cache reuse/expiry/negative results, domain priority, ambiguous names, 401/403/404/429/500, timeout, malformed responses, secret boundaries, and image URL/size selection. Route tests cover list ownership and saved identity; Places test verifies website reuse in one call. Run `npm test -- src/server/shopping/brands src/app/api/shopping/store-brand src/server/shopping/stores.test.ts`, `npm run typecheck`, targeted eslint, backend build, and an isolated Xcode simulator build. See task completion for actual outcomes.

## Production Deployment

Migration required for two nullable ShoppingList columns. No cache-table migration or worker source change is needed: existing offers tick invokes the cleanup. Apply backend migration/code, configure secrets, ensure hourly worker health, then rebuild iOS. This local implementation does not by itself deploy or push unrelated workspace changes. Brandfetch subscription and current terms must permit the documented metadata use. Production credentials have not been printed or installed by this implementation.

## Future Reuse

StoreBrand metadata and StoreBrandLogo can be reused for Offers, Schedule Email, store selection, and pickup without coupling views to Brandfetch or triggering product-level requests. Those screens and personalization are outside this change.

## Validation result (2026-10-04)

- 45 focused tests passed across brand service/client, endpoint ownership, Places search, and shopping persistence/weekly rollover.
- TypeScript passed. Targeted ESLint passed; repository-wide ESLint had zero errors and five pre-existing warnings.
- Next.js production build passed.
- Xcode Debug iOS Simulator build passed with isolated DerivedData `/tmp/nexdo-brandfetch-build`.
- Real Brandfetch credentials, live logo rendering, and production deployment were not exercised. Generic fallback and mocked provider paths were tested.

## Files changed for this integration

New:
- `src/server/shopping/brands/identity.ts`
- `src/server/shopping/brands/client.ts`
- `src/server/shopping/brands/service.ts`
- `src/server/shopping/brands/brands.test.ts`
- `src/app/api/shopping/store-brand/route.ts`
- `src/app/api/shopping/store-brand/route.test.ts`
- `ios/App/StoreBrandLogo.swift`
- `prisma/migrations/20261004000000_shopping_store_identity/migration.sql`
- `prisma/sqlite/migrations/20261004000000_shopping_store_identity/migration.sql`
- `docs/brandfetch-setup.md`
- `docs/brandfetch-integration.md`

Extended (preserving existing unrelated workspace edits):
- `.env.example`
- `vitest.config.ts`
- `prisma/schema.prisma`
- `prisma/sqlite/schema.prisma`
- `src/server/shopping/domain.ts`
- `src/server/shopping/service.ts`
- `src/server/shopping/shopping.test.ts`
- `src/server/shopping/stores.ts`
- `src/server/shopping/stores.test.ts`
- `src/server/shopping/food/cache.ts`
- `src/app/api/shopping/offers-tick/route.ts`
- `ios/Sources/NexdoCore/ShoppingList.swift`
- `ios/App/ShoppingStore.swift`
- `ios/App/ShoppingViews.swift`

## Backend release scope

This release contains backend, database, tests, configuration examples, and documentation only. The native component and model/view updates listed above remain in the original local iOS workspace for the next app build. The latest main-branch sparse-Places-response fix and legacy photo endpoint are preserved. Live Production Brand API verification returned Costco successfully; its CDN URLs use the public `c` parameter, now accepted with a regression test. Release validation: 51 focused tests, production build, and targeted ESLint passed.
