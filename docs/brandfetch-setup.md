# Brandfetch setup

## Credentials

Get a **Brand API key** and a separate **Brand Search client ID** from https://developers.brandfetch.com.

Set in your private local environment (never commit values):

- `BRANDFETCH_API_KEY`: secret Brand API bearer token, server only.
- `BRANDFETCH_CLIENT_ID`: Brand Search client ID (not interchangeable with the API key).

No `NEXT_PUBLIC_` variables or iOS configuration keys are needed. Missing API key disables resolution with a generic icon. Missing Search client ID still allows a saved website to resolve through Brand API.

Verified documentation:
- [Brand API](https://docs.brandfetch.com/reference/brand-api): `GET https://api.brandfetch.io/v2/brands/{domain}`, bearer token in Authorization.
- [Brand Search](https://docs.brandfetch.com/reference/brand-search-api): `GET https://api.brandfetch.io/v2/search/{name}?c={clientId}`.
- [Terms](https://brandfetch.com/terms): applicable plan permits metadata caching for at most 30 days; no permanent asset redistribution. Verify your subscription permits this use.

## Railway production and development

1. Apply migration `20261004000000_shopping_store_identity` using the existing migration deployment process. There are PostgreSQL and SQLite equivalents. Deploy the backend before rebuilding iOS.
2. In Railway, choose NexdoApp → the intended environment → Harbour → Variables. Add both variables through the secret UI. Never paste credentials into source, chat, logs, or command-line arguments.
3. Redeploy Harbour. Configure both Production and Develop if using both: native Debug builds use the development API.
4. Keep the existing authenticated `/api/shopping/offers-tick` worker running at least hourly. It purges expired brand metadata even when offer collection is disabled. No Brandfetch credentials are required in the worker. Alert if the tick is down; purge overdue metadata before resuming service after a prolonged outage.
5. Rebuild/install iOS from this checkout. No new entitlement or client API key is required.

## Verify

Select Costco in Stores Near You, save List Settings, and open the list. The backend receives the selected website from the same Google search. The header should show its verified logo; selecting a different store clears stale identity. Older saved lists with known retailer names can use Brand Search; local stores should be selected again to obtain a website.

An authenticated `GET /api/shopping/store-brand?listId=<your-list-id>` returns normalized metadata only. Repeat it and inspect the existing metrics counters for `brandfetch.cache_hit` without another `brandfetch.lookup`. No credentials appear in the JSON. No real emails or purchases are triggered by this check.

## Troubleshooting

- Cart icon: inspect missing configuration, no safe match, unsupported/non-raster asset, CDN failure, or missing store name. Generic fallback is intentional.
- 401/403/402 from provider: verify Brand API key and entitlement; errors are not sent to the app. Provider calls pause for five minutes in the process.
- 429: shared backend budget (100 calls/hour) and provider Retry-After backoff apply. Retry later; do not rotate keys to bypass limits.
- Negative results cache for 24 hours. After correcting configuration, wait for expiry or have an operator delete only `FoodDataCache` rows whose keys start with `store-brand:v1:`. Do not clear unrelated food caches.
- A Places field-mask change adds `websiteUri` to the existing request and may change Google's billing tier; there is no additional Places request. Verify the enabled Places plan.
- If changing the CDN allowlist in future, review redirects, asset size limits, and provider terms first.
