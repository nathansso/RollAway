# get_restaurants

CONTRACTS.md **§B.4** — food establishments near a point, bucketed into the
§C cuisine enum and `price_level` 1–4, with a `saturation` verdict.

## What it queries
**Google Places API (New)** `places:searchNearby` (POST, `X-Goog-Api-Key` +
FieldMask; types `restaurant, cafe, meal_takeaway, bakery, bar`, max 20
results). Reads the key from **`GOOGLE_PLACES_KEY`**.

**Without the key** (or when Places is unreachable) the bundled
`data/sample_places.json` fixture (labeled `_synthetic`, `TODO(real-key)`,
SoMa demo area) feeds the identical bucketing pipeline, so the §B.4 shape is
always returned.

## Bucketing & saturation
- Cuisine: keyword map over Places `types` + name → §C enum, else `other`.
  `by_cuisine` contains only non-zero buckets (matches the §B example).
- `by_price`: Places `priceLevel` enum → `"1"`..`"4"`; unpriced places are
  counted in `total` but not in `by_price`.
- `saturation`: density = total / circle area. `< 15/km² → low`,
  `15–40 → medium`, `> 40 → high`. (Places caps at 20 results, so density at
  large radii understates reality — thresholds tuned for the 300 m default.)

## Caching (documented TTL)
**6 h** per warm container, keyed by lat/lng rounded to 3 decimals (~110 m
grid) + radius rounded to 50 m — map jitter never re-bills the Places free tier.
Set a quota cap on the key in Google Cloud console regardless.

## Input
`lat`, `lng` (required), `radius_m` (default 300, max 2000).

## Errors
`BAD_INPUT`; upstream Places failures degrade to the fixture (never a 500).

## Test locally
```
node functions/scripts/invoke_local.js get_restaurants '{"lat":37.78,"lng":-122.40,"radius_m":300}'
```
