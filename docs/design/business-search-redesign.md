# Business search redesign

Reference: the user's September 24 business details mockup and asset sheet.

## Artwork

Workspace asset: `ios/Media.xcassets/business-search-hero.imageset/hero.png`.
Created with the built-in image-generation tool from the supplied asset sheet; transparent PNG.

Prompt:
> Use case: background-extraction. Extract ONLY the artwork labeled 2. Hero Illustration (Wrench & Map Pin) from the attached asset sheet as a high-resolution standalone PNG on a genuinely transparent background. Preserve the glossy purple/blue wrench leaning diagonally, pink map pin, pastel folded map underneath, little purple sparkles, and soft shadows exactly in this style. Tight square composition with all the artwork visible and a small margin. No text, no labels, no UI, no speech bubble, no other components of the asset sheet. This is an asset for a native mobile app.

## Functional details

- Business names, addresses, phone numbers, ratings, counts, and reviews come from the existing API. The minimum review count and highest-review-count ordering remain in effect.
- Business info, Reviews, and Services are native tabs. Services describes the requested service and confirmation requirements; the API does not provide a verified service catalog.
- The map tile is a native symbolic map graphic linking to the actual Google Maps listing, not a fictional geographic map screenshot.
- The hero says “Businesses near you!” rather than claiming businesses have been verified. “Most reviewed” identifies the first result under the requested ranking.
- Search notices retain their collapsed-by-default control.
- Messages opens the existing composer; only the user sends the message. The simulator displays the unavailable-device fallback.
- Native controls and gradients are used for tabs, action buttons, icons, stars, and number circles.

## Preview and verification

Debug-only offline launch arguments: `-agent-design-preview -business-results-preview`. All example business data in that fixture is illustrative and does not update production tasks.

Verified simulator build, all three tabs, expansion of the draft editor, and the unavailable-Messages fallback on the small iPhone simulator.
