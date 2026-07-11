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
// input
{ "lat": 37.78, "lng": -122.40, "radius_m": 300 }
// output
{ "total": 14,
  "by_cuisine": { "tacos": 2, "burgers": 3, "coffee": 5 },
  "by_price": { "1": 6, "2": 7, "3": 1 },
  "saturation": "low | medium | high" }
```

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

### Clearance geometry check (called by Spot Scout, implemented by P3)
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

`dpw-182101, sfpw-mff, sfpw-fees, sfdph-mff, sffd-permit, ttx-cert, ca-dmv, clearance-ref,
checklist-truck, checklist-trailer, checklist-pushcart-cooking, checklist-pushcart-nocook`

- `dpw-182101` — DPW Order No. 182,101 (core placement law + clearance distances). **This is
  the `cite` Person 3 returns from the clearance geometry check for every distance row.**
- The distance values are frozen in §B and owned by `dpw-182101`: **75 ft** restaurant
  entrance, **7 ft** hydrant, **500 ft** school (school hours).
- Full descriptions of every id: `agents/kb/SOURCES.md`.
