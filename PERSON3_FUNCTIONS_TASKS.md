# Person 3 — Functions & Data (branch `feat/functions-data`)

**You own the agents' hands and the truth.** Five DigitalOcean Functions that pull live SF data,
plus the clearance geometry — the one place the *law is computed as real code, never by the LLM*.

**Your directory:** `/functions` — one subdir per tool, each an independent DO Function.
**You depend on:** nobody to start (you build against real SF APIs immediately).
**Person 2 depends on you:** every Function must match its §B schema exactly — that's the contract
the agents call. Return the §B shapes even while data sources are partial.

---

## Definition of done
- [ ] 5 deployed DO Functions: `get_vendors`, `get_closures`, `get_foot_traffic`,
      `get_restaurants`, `get_events` — each matching its §B input/output schema.
- [ ] Clearance-geometry check deployed, returning real computed distances + pass/fail + citations.
- [ ] Every Function handles upstream failure with the common error envelope, never a 500 blank.
- [ ] A seed GeoJSON of all permitted vendors for Person 1's first map render.
- [ ] Secrets (Google Places key, etc.) in DO Function config, never in code.

---

## Task 1 — `get_vendors`
- [ ] Query SF Mobile Food Facility Permit `rqzj-sfat` for vendors near a point (radius filter).
- [ ] Join SF Mobile Food Schedule `jjew-r69b` to determine `scheduled_here` + `schedule_window`
      for the requested `day`/`time`.
- [ ] Join Person 2's cuisine lookup (keyed by permit_id) to fill `cuisine` from the §C enum.
- [ ] Return the §B shape. Also expose a `?format=geojson` mode → the seed layer for Person 1.

## Task 2 — `get_closures`
- [ ] Query SF Temporary Street Closures `8x25-yybr` for active/upcoming closures in radius + date range.
- [ ] Auto-fetch the latest SFMTA event closure list (weekly file) and merge — so Giants games /
      parades are covered without manual updates. Cache it; refetch on a schedule.
- [ ] Normalize both sources into one `closures[]` with `geometry`, `active_from/to`, `source`.

## Task 3 — `get_foot_traffic`
- [ ] Read the Bay Wheels live GBFS feed (station status) for activity near the point.
- [ ] Pre-aggregate a month of trip-history CSVs into a by-station, by-hour, by-day table
      (precompute offline; ship the aggregate as a data file the Function reads).
- [ ] Score activity around a point for the requested day/hour → `score` (0–1) + basis fields.
- [ ] **Honesty:** this is a pedestrian *proxy*. Return `basis: "bay_wheels"`; never claim it's a
      literal head count (Person 1 labels it as a proxy in the UI).

## Task 4 — `get_restaurants`
- [ ] Query Google Places for food establishments near the point.
- [ ] Bucket by category → §C cuisine enum, and by `price_level` (1–4).
- [ ] Compute a `saturation` verdict (low/medium/high) from count + density.
- [ ] Respect Places free-tier limits: cache by rounded lat/lng + radius.

## Task 5 — `get_events` (growth pillar)
- [ ] Query Ticketmaster Discovery for events near the point within the date range.
- [ ] Return name, venue, point, start, `expected_attendance` (when available), source.
- [ ] Filter to SF-relevant venues; cap results sensibly.

## Task 6 — Clearance geometry (the invariant)
- [ ] Implement as **pure code** — no LLM. Given a point + `vendor_type`, compute real distances:
  - [ ] 75 ft from restaurant entrances (use `get_restaurants`/Places points).
  - [ ] 500 ft from middle schools during school hours (SF school dataset).
  - [ ] 7 ft from fire hydrants (SF hydrant dataset).
  - [ ] Any vendor-type-specific sidewalk-clearance rule.
- [ ] Return the §B `checks[]` with `required_ft`, `actual_ft`, `pass`, and a `cite` id that
      matches Person 2's KB source ids (e.g. `dpw-182101`).
- [ ] Use a real geodesic distance (turf.js `distance` or haversine) — not naive lat/lng deltas.
- [ ] Unit-test the geometry with known fixtures (a point 50 ft from a restaurant → fail at 75 ft).

## Task 7 — Cross-cutting
- [ ] Common error envelope (`UPSTREAM_TIMEOUT | BAD_INPUT | RATE_LIMIT`) on every Function.
- [ ] Input validation (lat/lng bounds ~SF, radius caps) → `BAD_INPUT` instead of crashing.
- [ ] Timeouts + retry/backoff on every upstream call; degrade partial data rather than fail whole.
- [ ] Caching layer for slow/limited sources (Places, SFMTA file). Document TTLs.
- [ ] Secrets via DO Function env config. `README` per function: what it queries, how to deploy, how to test.

---

## Interfaces you must not break
- Each Function's I/O **is** its §B schema. If a real API forces a field change, edit
  `docs/CONTRACTS.md` §B and ping Person 2 (the agents will break otherwise).
- `cite` ids in the clearance check must match Person 2's KB source ids — agree the id list early.
- `cuisine` values must come from the §C enum (Person 2 owns it).

## Fast-start workflow
1. `get_vendors` first (unblocks Person 1's map seed + Person 2's most-used tool).
2. Then `get_closures` + clearance geometry (the constraint story of the demo).
3. Then `get_foot_traffic` + `get_restaurants` (demand signals).
4. `get_events` last (growth pillar, nice-to-have for the demo).
