# Person 2 — Functions, Data & Scoring (branch `feat/functions-data`)

**Layer: DO Functions + data snapshots + deterministic scoring (`/functions`).** You are the **only layer that touches external APIs**, and you own the demo-reliability spine. Code does math and law; you gather every signal and compute the deterministic score. Person 3's agent only *explains* what you compute.

> Reuse the existing `/functions` (get_vendors, get_closures, get_foot_traffic, get_restaurants, get_events, check_clearance already exist). This build adds the **`recommend_spots` orchestrator**, the **`DEMO_DATA_MODE` snapshot layer**, **fail-fast fetch**, the **prewarm script**, and **travel times** — and hardens everything to the demo-reliability rules.

---

## Demo-reliability spine (YOU OWN MOST OF THIS — day-one, not last-day)
- **`DEMO_DATA_MODE` flag on every Function.** on = read a frozen **snapshot** (bundled JSON/GeoJSON or DO Spaces); off = hit the live API. Demo runs ON; a judge can flip it OFF and it's still real.
- **Freeze snapshots** for the chosen demo neighborhood + date: Socrata (`rqzj-sfat`, `jjew-r69b`, `8x25-yybr`), Google Places, Ticketmaster, Bay Wheels. Same response every run.
- **Fail-fast fetch** in the shared fetch layer: `timeoutMs ~2500`, `retries 0` on the demo build. A live miss degrades to snapshot in ~2s, never ~20s.
- **Prewarm script** — pings every Function on the exact demo coordinates/date/time to fill warm-container caches, and confirms the menu KB + both agents are up. Run minutes before presenting. **No cold starts on stage.**
- **No router LLM turn.** `recommend_spots` gathers all signals then calls Spot Scout **once**. Spot Scout and Permit Copilot are invoked directly; never build a router.

---

## Functions you own

### Base-signal Functions (harden existing to demo rules)
- `get_vendors(lat,lng,radius,when)` — merge `rqzj-sfat` (status=APPROVED) + `jjew-r69b`; return nearby vendors with cuisine category + `occupied_now` flag for `when`. Hand messy `fooditems` free text to Person 3's normalization (keep raw text too — frontend shows it).
- `get_closures(lat,lng,radius)` — from `8x25-yybr`; active + upcoming.
- `get_restaurants(lat,lng,radius)` — Google Places, bucketed by type + `price_level`.
- `get_foot_traffic(lat,lng)` — Bay Wheels GBFS live + pre-aggregated station-hour counts; return **score by hour**. Label as an estimate/proxy, never literal pedestrian counts.
- `get_events(lat,lng,date_range)` — Ticketmaster Discovery; nearby events with venue/date/size for the demand bonus.
- `check_clearance(lat,lng)` — **pure geometry against encoded constants, NEVER the LLM.** Rules: 75 ft from restaurant entrances; 500 ft from public middle schools / 1000 ft from most public high schools (7am–5pm weekdays); 12 ft from bus/blue zones; 7 ft from fire hydrants; 5 ft from curb returns; 8 ft from street artists; legal parallel parking space for trucks. Return `{legal, violations[]}` each with the specific rule.

### `recommend_spots(user_profile, when, location)` — the orchestrator (your keystone)
1. Generate candidate spots within the user's travel radius — **capped at 3 for the demo.**
2. For each candidate, fetch ALL per-candidate signals **IN PARALLEL** (vendors, closures, restaurants, foot traffic, events, clearance, travel time).
3. Query the user's **menu RAG** (Person 3) for competition overlap — real menu items + price points vs. nearby vendors/restaurants (not a cuisine label).
4. Compute the **deterministic score** (below) and **eliminate** any candidate that fails a hard constraint.
5. Call **Spot Scout ONCE** with all signals pre-gathered → ranked list + one-line "why" per spot.
6. Return top 3 with **full score breakdowns** shaped for the frontend's "Good to Know" cards.

### Travel times
- Mapbox Directions/Matrix API from the user's location to each recommended spot (feeds the travel row + travel-feasibility constraint).

---

## Scoring model (deterministic core — code does it, agent explains)
Per candidate at the chosen window:
1. **Hard constraints (any failure eliminates):** inside an active closure; clearance violation; spot occupied per schedule; outside max travel time.
2. **Demand score:** foot-traffic estimate for that hour + restaurant density + event-proximity bonus.
3. **Competition penalty:** nearby vendors/restaurants overlapping the user's menu items + price tier (from menu RAG).
4. Output `{score, breakdown, eliminated?, violations[]}` per candidate. The agent receives these and writes rationale — **you never ask the LLM to do math or legality.**

---

## Contracts (lock day 1)
- **You produce → Person 1:** `recommend_spots` response `{spots:[{rank, point, block_label, score_breakdown:{foot_traffic, competition, legality:{pass,rule}, closures, travel_minutes}, why_one_line}]}`, plus `get_vendors`/`get_closures` for base layers.
- **You consume → Person 3:** call Spot Scout once (pass pre-gathered signals), query the menu RAG for competition overlap, hand raw `fooditems` for normalization. Agree the Spot Scout input/output and the RAG query interface with Person 3 day 1.
- **You consume → Person 1:** the `user_profile` + `when` + `location`.

## Files (target)
`functions/packages/rollaway/{recommend_spots,...}/`, a shared `demo_data/` snapshot dir keyed to the demo scenario, `shared/fetch.js` (fail-fast + DEMO_DATA_MODE), `scripts/prewarm.mjs`, `scripts/freeze_snapshots.mjs`, `functions/project.yml`.

## Verification (DoD)
- [ ] Every Function honors `DEMO_DATA_MODE`; snapshots produce identical output every run.
- [ ] Fail-fast verified: a forced live miss degrades to snapshot in ~2s.
- [ ] `recommend_spots` returns exactly 3 scored spots with full breakdowns, parallel signal fetch, single Spot Scout call, no router turn.
- [ ] `check_clearance` unit-tested against known-fail fixtures (geometry only, no LLM).
- [ ] Prewarm script pings all Functions on demo coords + confirms KB/agents up.
- [ ] No keys committed; snapshots contain no secrets.

## Branch etiquette
Own `/functions`. Lock the `recommend_spots` output shape with Person 1 and the Spot Scout / menu-RAG interface with Person 3 on day 1. **Freeze snapshots off the shared demo scenario** (see the demo-scenario decision — pick it with the team before writing a single Function).
