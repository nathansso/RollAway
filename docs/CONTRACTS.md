# Rollaway — Interface Contracts (FREEZE THIS FIRST)

This is the single file all three people agree on before writing code. It lets the
frontend, the agents, and the Functions be built in parallel against stubs.

> Rule: changing a schema here requires a heads-up to the two other owners.
> Version each contract; bump `contract_version` when a breaking change lands.

`contract_version: 1`

---

## A. Frontend ↔ Gradient entry point (Person 1 ↔ Person 2)

Single routed endpoint. The frontend only ever calls this.

### `POST /chat`

Request:
```json
{
  "session_id": "uuid",
  "message": "I sell tacos from a truck, where should I set up Friday lunch near SoMa?",
  "context": {
    "vendor_type": "truck | trailer | pushcart_cooking | pushcart_nocook | null",
    "map_center": { "lat": 37.78, "lng": -122.40 },
    "pinned_point": { "lat": 37.78, "lng": -122.40 }
  }
}
```

Response (streamed or whole):
```json
{
  "agent": "spot_scout | permit_copilot",
  "reply_markdown": "Here are three spots ...",
  "citations": [
    { "label": "DPW Order 182,101 §3.2", "source": "dpw-182101", "quote": "..." }
  ],
  "map_actions": [
    {
      "type": "add_spot",
      "id": "spot-1",
      "point": { "lat": 37.781, "lng": -122.401 },
      "verdict": "good | caution | avoid",
      "score": 0.82,
      "reasons": ["High lunch foot traffic", "No taco trucks scheduled Fri"],
      "breakdown": {
        "constraints": [
          { "rule": "75ft from restaurant entrance", "pass": true, "detail": "nearest 110ft" }
        ],
        "demand": { "foot_traffic_score": 0.7, "restaurant_saturation": "low" },
        "nearby_vendors": [ { "name": "...", "cuisine": "tacos", "scheduled_here": false } ]
      }
    }
  ],
  "checklist": null
}
```

`checklist` is populated by Permit Copilot instead of `map_actions` (see §D). Frontend
renders whichever is present. Both agents return the same envelope.

---

## B. DigitalOcean Function tool schemas (Person 2 ↔ Person 3)

These are the function-calling tool definitions the agents invoke. Each Function is an
HTTP endpoint taking JSON, returning JSON. **Freeze the field names.**

### 1. `get_vendors`
```jsonc
// input
{ "lat": 37.78, "lng": -122.40, "radius_m": 500, "day": "fri", "time": "12:00" }
// output
{ "vendors": [ {
    "permit_id": "21MFF-0123", "name": "El Sabor", "type": "Truck",
    "cuisine": "tacos",          // enriched by serverless inference (P2)
    "status": "APPROVED",
    "point": { "lat": 37.781, "lng": -122.401 },
    "scheduled_here": true, "schedule_window": "11:00-14:00"
} ], "count": 1 }
```

### 2. `get_closures`
```jsonc
// input
{ "lat": 37.78, "lng": -122.40, "radius_m": 800, "date_from": "2026-07-10", "date_to": "2026-07-13" }
// output
{ "closures": [ {
    "id": "...", "reason": "Street fair", "source": "sfmta_event | dpw_permit",
    "geometry": { "type": "LineString | Polygon", "coordinates": [] },
    "active_from": "...", "active_to": "..."
} ], "count": 1 }
```

### 3. `get_foot_traffic`
```jsonc
// input
{ "lat": 37.78, "lng": -122.40, "radius_m": 400, "day": "fri", "hour": 12 }
// output  (bike activity is a PROXY for pedestrians — label as such in UI)
{ "score": 0.7, "basis": "bay_wheels", "nearby_stations": 4,
  "live_activity": 22, "historical_avg": 18 }
```

### 4. `get_restaurants`
```jsonc
// input — day/time_from/time_to are OPTIONAL (additive, 2026-07-11); provided
// together they describe the vendor's planned setup window ("fri 18:00-22:00").
// time_to <= time_from means the window runs overnight into the next day.
{ "lat": 37.78, "lng": -122.40, "radius_m": 300,
  "day": "fri", "time_from": "18:00", "time_to": "22:00" }
// output — total/by_cuisine/by_price/saturation unchanged (all venues).
// saturation is popularity-weighted (review mass × rating; a typical venue ≈
// weight 1), not a raw count. `window` appears ONLY when a window was
// requested: competition among venues OPEN during that window (open = open
// ≥ 50% of the window, from Google regularOpeningHours).
{ "total": 14,
  "by_cuisine": { "tacos": 2, "burgers": 3, "coffee": 5 },
  "by_price": { "1": 6, "2": 7, "3": 1 },
  "saturation": "low | medium | high",
  "window": {
    "day": "fri", "time_from": "18:00", "time_to": "22:00",
    "open_total": 9,
    "open_by_cuisine": { "tacos": 1, "burgers": 3 },
    "saturation_open": "low | medium | high"
  } }
```

#### §B.4 — window-aware competition (additive; contract_version unchanged)

Optional inputs let a vendor scope competition to *when they'll actually be out*
("Friday 6–10pm"). All three are optional and go together: **`time_from`/`time_to` require each
other and `day`** (else `BAD_INPUT`). Overnight windows wrap (`20:00`–`01:00` = Fri→Sat).

| Param | Form | Notes |
|---|---|---|
| `day` | `mon`..`sun` | required if a time window is given |
| `time_from` | `HH:MM` | requires `time_to` + `day` |
| `time_to` | `HH:MM` | requires `time_from` + `day`; may wrap past midnight |

`saturation` (top-level) is now computed from **Σ venueWeight** (popularity-weighted) instead of a
raw storefront count — **same field name, same enum**, so this is invisible to any existing consumer.

**When (and only when) a valid window is supplied**, the output gains one additive block:
```jsonc
"window": {
  "day": "fri", "time_from": "18:00", "time_to": "22:00",
  "open_count": 6,                 // venues open during the window (raw count)
  "open_weighted": 7.4,            // Σ venueWeight over venues open in the window
  "saturation": "low | medium | high",   // window-specific weighted verdict (same enum)
  "by_cuisine_open": { "tacos": 1, "burgers": 3 }   // per-cuisine open-during-window counts (demand-gap)
}
```
> Field names pinned here by Person 2 so Person 3's Function matches exactly (see the last two
> issues on why we pin names in §B). No existing field name/enum changes → non-breaking, so
> `contract_version` stays at 1. Person 3 (`feat/functions-data`) implements this block in
> `get_restaurants`; Person 2's tool registration + Spot Scout already read it.

### 5. `get_events`  (growth pillar)
```jsonc
// input
{ "lat": 37.78, "lng": -122.40, "radius_m": 3000, "date_from": "2026-07-11", "date_to": "2026-07-13" }
// output
{ "events": [ {
    "name": "SF Giants vs Dodgers", "venue": "Oracle Park",
    "point": { "lat": 37.778, "lng": -122.389 },
    "start": "2026-07-11T18:45:00", "expected_attendance": 40000,
    "source": "ticketmaster"
} ], "count": 1 }
```

### `check_clearance` — clearance geometry check (called by Spot Scout, implemented by P3)

Function name is **`check_clearance`** (pinned here so both sides agree; the tool, fixtures, and
agent prompt all use this exact name).

```jsonc
// input
{ "lat": 37.78, "lng": -122.40, "vendor_type": "truck" }
// output — code computes real distances, agent only explains
{ "allowed": false, "checks": [
    { "rule": "75ft from restaurant entrance", "required_ft": 75, "actual_ft": 50, "pass": false, "cite": "dpw-182101" },
    { "rule": "7ft from hydrant", "required_ft": 7, "actual_ft": 20, "pass": true, "cite": "dpw-182101" },
    { "rule": "500ft from middle school (school hours)", "required_ft": 500, "actual_ft": 900, "pass": true, "cite": "dpw-182101" }
] }
```

**Row count by vendor type (clarification, non-breaking):** `truck` and `trailer` return the **3**
distance rows above (all `cite: "dpw-182101"`). `pushcart_cooking` and `pushcart_nocook` return a
**4th** row for minimum sidewalk width — they operate on the sidewalk — citing `sf-sidewalk-width`
(see §E):
```jsonc
{ "rule": "10ft min sidewalk width (6ft path + 4ft cart)", "required_ft": 10, "actual_ft": 12, "pass": true, "cite": "sf-sidewalk-width" }
```

### Common error envelope (all Functions)
```json
{ "error": { "code": "UPSTREAM_TIMEOUT | BAD_INPUT | RATE_LIMIT", "message": "..." } }
```

---

## C. Cuisine categories (shared vocabulary — Person 2 owns the enum)

Serverless-inference classification maps free-text food descriptions to ONE of:
`tacos, burritos, burgers, hot_dogs, sandwiches, coffee, ice_cream, bbq, asian,
halal, pizza, seafood, desserts, drinks, other`

`get_vendors` and `get_restaurants` both return cuisines from this enum so
"another taco truck nearby" is answerable.

---

## D. Permit checklist shape (Person 2 → Person 1)

```jsonc
{ "vendor_type": "pushcart_nocook",
  "steps": [ {
    "order": 1, "agency": "Public Works", "title": "Apply for MFF permit",
    "detail": "...", "deadline_days": 30, "deadline_label": "30-day public notice",
    "cite": "dpw-182101", "status": "todo"
  } ] }
```

Vendor types (canonical strings, shared everywhere):
`truck, trailer, pushcart_cooking, pushcart_nocook`.

---

## E. Source IDs (Person 2 owns; the `source`/`cite` vocabulary)

> **Additive appendix.** Nothing in §A–§D changes; this only pins the string vocabulary
> already used by §A `citations[].source` and §B's clearance `cite`. Authoritative copy
> lives in `agents/kb/SOURCES.md`; this table is the in-contract mirror. Adding/renaming an
> id pings Person 1 (renders citations) and Person 3 (returns `cite`).

Every `citations[].source` (§A) and every clearance `cite` (§B) MUST be one of:

`dpw-182101, sf-sidewalk-width, sfpw-mff, sfpw-fees, sfdph-mff, sffd-permit, ttx-cert, ca-dmv,
clearance-ref, checklist-truck, checklist-trailer, checklist-pushcart-cooking,
checklist-pushcart-nocook`

- `dpw-182101` — DPW Order No. 182,101 (core placement law + clearance distances). **This is
  the `cite` Person 3 returns from `check_clearance` for the three distance rows.**
- The distance values are frozen in §B and owned by `dpw-182101`: **75 ft** restaurant
  entrance, **7 ft** hydrant, **500 ft** school (school hours).
- `sf-sidewalk-width` — SF Public Works Code + ADA path-of-travel: **10 ft** minimum sidewalk
  width (6 ft clear path + 4 ft cart). **This is the `cite` Person 3 returns for the 4th
  `check_clearance` row, on `pushcart_cooking`/`pushcart_nocook` only** (distinct legal basis
  from `dpw-182101`; the dataset `4g86-grxu` is the compute input, not the citation).
- Full descriptions of every id: `agents/kb/SOURCES.md`.
