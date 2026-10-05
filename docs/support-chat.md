# Website support chat

The global Ask support button opens an accessible dialog with suggested questions, a short conversation, source links, reset, loading/error states, and an editable retry after a failed request. Chat state stays in component memory; it is not saved to local storage or the database. The public `/help` page republishes the existing task/calendar help articles with explicit iPhone labels. Marketing navigation links to Help.

## Published sources

`npm run support:index` regenerates `src/content/support-articles.json` from approved source files:

- `src/components/harbour-landing.tsx`: product overview and actual FAQs (not sample task stories).
- `src/components/pricing.tsx`: plan prices, features, and billing FAQs.
- `src/components/ai-feature-showcase.tsx`: feature descriptions and limitations.
- `ios/Sources/NexdoCore/HelpTopics.swift`: native iPhone help articles.

The index runs automatically before `npm run dev` and `npm run build`. Update those source files, regenerate, and deploy to refresh answers. This is a build-time index of repository-owned public content, not a live crawler. No external help-center URL was supplied. Add new approved sources to the generator if help moves elsewhere; do not index authenticated pages, secrets, or internal implementation documents. The generated JSON is checked in so direct Next commands still have a usable index.

## Answer service

`POST /api/support/chat` accepts up to nine user/assistant messages, a final question of at most 1,000 characters, and at most 16 KB of request body. It retrieves relevant articles and uses the existing server-only `OPENAI_API_KEY`, with `SUPPORT_CHAT_MODEL` optionally overriding `OPENAI_MODEL`. Without a key or when the provider fails, the service returns a labeled published excerpt and related links. Missing evidence produces an explicit unknown answer.

The Responses API uses `store: false`, structured output, a 20-second timeout, and no tools. Messages and published text are treated as data. Source IDs are validated against the supplied corpus; link destinations come only from server-owned article metadata. This guards citation links, but generated prose still requires quality review and is labeled AI. No personal account data or database access is provided to this chatbot. The UI discloses that messages may be processed by OpenAI before submission. There is no live-agent handoff, ticket creation, or invented support email.

Same-host and browser fetch-site checks reject cross-site use. Per-process limits are 10 requests per visitor/minute, 60 total/minute, and five concurrent requests. IPs are hashed in a bounded expiring in-memory map; message contents are not logged by the implementation. These limits reset on restart and multiply with replicas. For multi-instance production, add a shared gateway/Redis rate limit and provider spending limits. The endpoint does not rely on IP authenticity for its global cap.

## Validation

Run `npm run test:support` for isolated tests (no database setup), `npm run typecheck`, and ESLint on changed support files. Tests cover retrieval, iPhone labels, valid/invalid citations, unknown answers, provider failure/incomplete output, follow-ups, same-host checks, invalid roles, request size, and throttling. Browser checks cover opening/closing the dialog, suggestions, source navigation, desktop layout, and a 390px mobile viewport. Live model responses require configured credentials; mocked provider tests do not establish live model answer quality.

## Public website deployment — September 29, 2026

The public `nexdoapp.com` site is a separate static Node website in `javapoet55/nexgo-website`, not this Harbour app. The chatbot was adapted there and deployed from commit `5dcc4b1b80e5cd53a3af05b015b0fb14cb06b226`. Railway production deployment `dd279f04-e401-4024-a85c-51629b043dfd` succeeded. Previous release: `7c5a2266-1bf5-4aa0-b71c-501a35e01d07`.

The public site builds its own index from 41 published page descriptions and FAQs, including its existing Help center; hidden pricing is excluded. No GPT key was added. A live browser check on https://nexdoapp.com/help confirmed the calendar question returned the published help answer and source links in article mode. Tests in that repository passed (23 pages, 1,563 links, five chatbot tests).

Add `OPENAI_API_KEY` later to Railway project NexdoApp → Production → nexdoapp website, then apply/redeploy. No Harbour backend or mobile deployment was made. The Next.js implementation above remains local in this repository.
