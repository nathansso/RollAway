# check_clearance

CONTRACTS.md **§B "Clearance geometry check"** — THE INVARIANT. The law is
computed as pure code: turf.js **geodesic** distances (`@turf/distance`,
`@turf/nearest-point`, `@turf/point-to-line-distance`), output in **feet**.
No LLM does any math here; the agent only explains these numbers.

## Rules
| Rule (exact §B string) | Threshold | Data | Applies to |
|---|---|---|---|
| `75ft from restaurant entrance` | 75 ft | Google Places Nearby (live, 6 h cache) or bundled fixture without a key | all |
| `7ft from hydrant` | 7 ft | `data/hydrants.geojson` snapshot (1,204 hydrants, OpenStreetMap) | all |
| `500ft from middle school (school hours)` | 500 ft | `data/schools.geojson` snapshot (Socrata `7e7j-59qk`, grades overlapping 6–8) | all |
| `10ft min sidewalk width for pushcart (6ft pedestrian path)` | 10 ft width | `data/sidewalks.geojson` snapshot (Sidewalk Widths 2014, `sidewalk_f`) | `pushcart_*` only |

All thresholds and `cite` ids are centralized in **`constants.js`** — when
Person 2 finalizes the KB source-id list, update that one file. Current ids
are placeholders (`dpw-182101` = DPW Director's Order 182,101, per §B).

## Semantics & documented decisions
- **School hours** = Mon–Fri 07:00–16:00 America/Los_Angeles, evaluated at
  request time (the §B input has no time field). Outside those hours the 500 ft
  rule doesn't bind → `pass: true`, but `actual_ft` still reports the real distance.
- **Hydrants**: data.sfgov.org publishes **no hydrant dataset** (Socrata catalog
  checked 2026-07-10), so the snapshot comes from OpenStreetMap
  (`emergency=fire_hydrant`). If the snapshot is empty/missing the hydrant check
  is **omitted from `checks[]`** — never silently marked passing.
- **Restaurants**: searched within 150 m of the spot. If none found, the 75 ft
  check passes with `actual_ft` = 492.1 (the 150 m search floor — we only know
  "farther than that"). Without `GOOGLE_PLACES_KEY` a SoMa-area fixture is used
  (`data/sample_restaurants.geojson`, `// TODO(real-key)`).
- **Sidewalk rule**: pushcarts vend on the sidewalk and must leave a 6 ft
  pedestrian path; with a ~4 ft cart footprint the sidewalk must be ≥ 10 ft
  (`sidewalk_f` of the geodesically-nearest street segment). Trucks/trailers
  vend from the street → rule not emitted for them.
- Checks that lack data or don't apply are **omitted**, so `allowed` is the AND
  of only real, computed checks.

## Input
`lat`, `lng` (SF bounds enforced), `vendor_type` ∈
`truck | trailer | pushcart_cooking | pushcart_nocook`. Anything else → `BAD_INPUT`.

## Test (no deploy — required part of Definition of Done)
```
cd functions/packages/rollaway/check_clearance
npm install
npm test        # 14 tests: 50ft-from-restaurant fails 75ft, 20ft hydrant passes 7ft, etc.
```

## Regenerating snapshots
```
node functions/scripts/fetch_static_data.js
```

## Deploy
See `functions/DEPLOY.md`. The DO remote build runs `npm install` from this
package.json automatically.

> **Demo reliability:** honors `DEMO_DATA_MODE` (reads a frozen snapshot from `demo_data/`); in live mode a transient upstream miss fail-fast-degrades to that snapshot in ~2.5s (`shared.js` `withData`/`demoFetchOpts`).
