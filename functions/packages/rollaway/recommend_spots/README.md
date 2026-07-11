# recommend_spots — the orchestrator

Gathers every signal for up to **3 candidate spots in parallel**, computes a
**deterministic score** (code does the math and the law), calls **Spot Scout at
most once** for the one-line "why" prose (no router turn), and returns all 3
candidates shaped for the frontend.

> **Demo reliability:** honors `DEMO_DATA_MODE` (reads frozen snapshots from
> `demo_data/`); live travel uses Mapbox and a live signal miss fail-fast-
> degrades to snapshot in ~2.5s. See `functions/DEPLOY.md`.

## Input (§4a — from Person 1)

```jsonc
{
  "user_profile": {
    "vendor_type": "truck",                         // one of truck|trailer|pushcart_cooking|pushcart_nocook
    "menu": [ { "item": "al pastor taco", "price": 4.5 } ], // OPTIONAL
    "max_travel_minutes": 15,
    "travel_mode": "driving"                         // driving|walking|cycling (default driving)
  },
  "when": { "day": "fri", "time": "12:00", "hour": 12,
            "date_from": "2026-07-17", "date_to": "2026-07-17" },
  "location": { "lat": 37.78, "lng": -122.40, "radius_m": 500 }
}
```

Anything missing in `when` / `location` / limits defaults from
`demo_data/scenario.json`, so a bare `{ "user_profile": { "vendor_type": "truck" } }`
runs the full SoMa Friday-lunch demo.

## Output (§4g — LOCKED; Person 1 depends on it)

```jsonc
{ "spots": [ {
  "rank": 1,                    // 1..n for ranked spots; null for eliminated (listed last)
  "id": "spot-1",
  "point": { "lat": 37.78, "lng": -122.40 },
  "block_label": "Folsom St @ 5th",
  "verdict": "good | caution | avoid",
  "score": 0.82,               // clamp(demand - competition_penalty, 0, 1)
  "eliminated": false,
  "violations": [],            // populated when a hard constraint fails
  "score_breakdown": {
    "foot_traffic": 0.7,
    "competition": { "penalty": 0.1, "overlapping": [ { "name": "...", "cuisine": "tacos", "price_tier": 1 } ] },
    "legality": { "pass": true, "rule": "all setbacks clear", "checks": [ /* check_clearance rows */ ] },
    "closures": { "blocked": false },
    "events": { "bonus": 0.05, "nearest": "..." },
    "travel_minutes": 8
  },
  "why_one_line": "High lunch foot traffic; little direct menu competition; clears all setbacks."
} ] }
```

`verdict`: `good` (score ≥ 0.66 & not eliminated), `caution` (0.33–0.66),
`avoid` (eliminated or < 0.33). All 3 candidates are always returned; eliminated
ones carry `violations[]` so the UI can explain the rejection.

## The 3-tier `callFunction` transport (§4c)

DO bundles each function dir independently, so recommend_spots cannot
`require('../get_vendors')` on the deployed runtime. `callFunction(name, args)`
tries, in order:

1. **`DEMO_DATA_MODE`** → read the sibling's snapshot via `loadSnapshot` (fully
   offline). On a freeze gap it falls through to the in-process sibling (which
   is itself offline in demo mode).
2. **`FUNCTIONS_BASE_URL` set** → `POST ${BASE}/${name}` (deployed HTTP fan-out).
3. **neither** → `require('../<name>/index.js').main(args)` and read `.body`
   (local dev / `invoke_local.js`).

All tiers return the Function's **output body**, so the orchestrator is
transport-agnostic. The 6 signals per candidate run in `Promise.all`, and the 3
candidates run in parallel; the Mapbox travel matrix is one call for the whole
fan-out.

## Scoring model (deterministic — `score.js`)

- **Hard constraints (any ⇒ `eliminated`, kept in output, unranked):** inside an
  active closure (≤60 m), `check_clearance.allowed === false` (failing rows →
  `violations`), spot occupied by a `scheduled_here` vendor (≤30 m), travel time
  > `max_travel_minutes`.
- **Demand (0..1):** `0.60·foot_traffic + 0.25·restaurant_density + event_bonus`
  (event bonus ≤ 0.15, scaled by distance + expected attendance).
- **Competition penalty (0..1):** `0.50·overlap_score` from `menu_competition.js`
  (menu items + price tier vs. nearby vendors/restaurants — not a cuisine label
  alone).
- **`score = clamp(demand − penalty, 0, 1)`.** Weights are named constants in
  `score.js`.

The agent only writes prose — it is never asked to do math or legality.

## Env vars

| Var | Effect when set | Fallback when unset |
|---|---|---|
| `DEMO_DATA_MODE` | read frozen snapshots (offline) | live APIs (miss → snapshot) |
| `MAPBOX_TOKEN` | live Directions/Matrix travel times | haversine estimate (`estimated:true`) |
| `FUNCTIONS_BASE_URL` | HTTP fan-out to deployed siblings | in-process `require` |
| `SPOT_SCOUT_URL` | one POST → `[{id, why_one_line}]` | deterministic templated why-lines |
| `MENU_RAG_URL` | POST → `{overlap_score, overlapping[]}` | deterministic cuisine+price bridge |

## Local run

```bash
node functions/scripts/invoke_local.js recommend_spots \
  '{"user_profile":{"vendor_type":"truck","menu":[{"item":"al pastor taco","price":4.5}]},"location":{"lat":37.78,"lng":-122.40,"radius_m":500}}'
cd functions/packages/rollaway/recommend_spots && npm test
```
