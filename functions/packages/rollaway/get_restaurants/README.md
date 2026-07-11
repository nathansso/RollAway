# get_restaurants

CONTRACTS.md **§B.4** — food establishments near a point, bucketed into the
§C cuisine enum and `price_level` 1–4, with a popularity-weighted `saturation`
verdict and an optional **setup-window** competition block.

## What it queries
**Google Places API (New)** `places:searchNearby` (POST, `X-Goog-Api-Key` +
FieldMask; types `restaurant, cafe, meal_takeaway, bakery, bar`, max 20
results). Reads the key from **`GOOGLE_PLACES_KEY`**. The FieldMask requests
`rating`, `userRatingCount` and `regularOpeningHours` in addition to the
display fields — all the same Enterprise SKU as `priceLevel`, so no cost-tier
change.

**Without the key** (or when Places is unreachable) the bundled
`data/sample_places.json` fixture (labeled `_synthetic`, `TODO(real-key)`,
SoMa demo area, includes ratings/hours) feeds the identical pipeline, so the
§B.4 shape is always returned.

## Bucketing & saturation
- Cuisine: keyword map over Places `types` + name → §C enum, else `other`.
  `by_cuisine` contains only non-zero buckets (matches the §B example).
- `by_price`: Places `priceLevel` enum → `"1"`..`"4"`; unpriced places are
  counted in `total` but not in `by_price`.
- `saturation` is **popularity-weighted** (`popularity.js`): each venue counts
  `clamp(log10(1+userRatingCount)/log10(301), 0.25, 3) × clamp(rating/4, 0.6, 1.25)`
  instead of 1, so 20 busy institutions saturate a block that 20 dead
  storefronts would not. A typical venue (~300 reviews, 4.0★) ≈ 1.0, keeping
  the density thresholds meaningful: `< 15/km² → low`, `15–40 → medium`,
  `> 40 → high`. Google exposes no Popular Times/busyness API — review mass is
  the busyness proxy (documented approximation).
- Places caps at 20 results ranked by popularity, so density at large radii
  understates reality (the 20 you get are the most popular — the right ones to
  weight). Thresholds tuned for the 300 m default.

## Setup window (optional)
Pass `day` (`mon..sun`) + `time_from`/`time_to` (`HH:MM`; `time_to <=
time_from` wraps overnight) — "I'm setting up fri 18:00–22:00". The response
gains a `window` block: `open_total` / `open_by_cuisine` count venues open
≥ 50% of the window, and `saturation_open` weights each venue by
`popularity × fraction-of-window-open`. Open/closed is computed **locally**
from `regularOpeningHours` periods (cache-safe; works for future windows,
unlike a live openNow flag). Venues with no hours data are assumed open —
conservative when measuring competition. Partial window args → `BAD_INPUT`.

## Caching (documented TTL)
**6 h** per warm container for the *normalized place list*, keyed by lat/lng
rounded to 3 decimals (~110 m grid) + radius rounded to 50 m — map jitter never
re-bills the Places free tier, and different windows share one Places call
(bucketing/window math run per request, pure). Set a quota cap on the key in
Google Cloud console regardless.

## Input
`lat`, `lng` (required), `radius_m` (default 300, max 2000); optional `day` +
`time_from` + `time_to` (all three together).

## Errors
`BAD_INPUT`; upstream Places failures degrade to the fixture (never a 500).

## Test locally
```
cd functions/packages/rollaway/get_restaurants && npm test
node functions/scripts/invoke_local.js get_restaurants '{"lat":37.78,"lng":-122.40,"radius_m":300}'
node functions/scripts/invoke_local.js get_restaurants '{"lat":37.78,"lng":-122.40,"radius_m":300,"day":"fri","time_from":"18:00","time_to":"22:00"}'
```

> **Demo reliability:** honors `DEMO_DATA_MODE` (reads a frozen snapshot from `demo_data/`); in live mode a transient upstream miss fail-fast-degrades to that snapshot in ~2.5s (`shared.js` `withData`/`demoFetchOpts`).
