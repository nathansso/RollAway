<!--
version: 1.0.0
updated: 2026-07-10
owner: Person 2 (Agents & Platform)
changelog:
  - 1.0.0 (2026-07-10): initial shared envelope contract. Both agents import this verbatim.
-->

# Shared Output Envelope (import into BOTH agents)

Every response from **either** agent MUST be a single JSON object in exactly this shape — the
`docs/CONTRACTS.md §A` envelope. Person 1 renders it verbatim, so drifting from these field names
breaks the frontend. This file is the single source of truth; `spot_scout.md` and
`permit_copilot.md` both say "obey `output_envelope.md`."

## The shape (§A)

```jsonc
{
  "agent": "spot_scout | permit_copilot",   // which agent produced this
  "reply_markdown": "string",                // human-readable answer (markdown)
  "citations": [                              // 0+; REQUIRED non-empty for any permit/legal claim
    { "label": "string", "source": "<id from kb/SOURCES.md>", "quote": "string" }
  ],
  "map_actions": [ /* Spot Scout fills this; Permit Copilot leaves it [] */ ],
  "checklist": null                           // Permit Copilot fills this; Spot Scout sets null
}
```

## Division of the envelope

| Field | Spot Scout | Permit Copilot |
|---|---|---|
| `agent` | `"spot_scout"` | `"permit_copilot"` |
| `reply_markdown` | prose ranking of spots | prose explanation of the checklist / answer |
| `citations[]` | when it explains a clearance rule, cite `dpw-182101` | **every** claim cites a `source` id |
| `map_actions[]` | **populated** (one per ranked spot) | **`[]`** (empty) |
| `checklist` | **`null`** | **populated** (§D shape) |

**Hard rule:** exactly one of `map_actions` (non-empty) / `checklist` (non-null) is filled per
response. Never both, never neither for a substantive answer. Every `source` in `citations[]`
and every `cite` in a checklist step must resolve in `kb/SOURCES.md`.

## `map_actions[]` item shape (Spot Scout) — §A

```jsonc
{
  "type": "add_spot",
  "id": "spot-1",
  "point": { "lat": 37.781, "lng": -122.401 },
  "verdict": "good | caution | avoid",
  "score": 0.82,                              // 0..1
  "reasons": ["High lunch foot traffic", "No taco trucks scheduled Fri"],
  "breakdown": {
    "constraints": [
      { "rule": "75ft from restaurant entrance", "pass": true, "detail": "nearest 110ft" }
    ],
    "demand": { "foot_traffic_score": 0.7, "restaurant_saturation": "low" },
    "nearby_vendors": [ { "name": "El Sabor", "cuisine": "tacos", "scheduled_here": false } ]
  }
}
```

> `constraints[]` rows come **verbatim from the clearance geometry tool** (`rule`, `pass`,
> `detail` from its `checks[]`). The model never computes or edits `pass`/distances.

## `checklist` shape (Permit Copilot) — §D

```jsonc
{
  "vendor_type": "truck | trailer | pushcart_cooking | pushcart_nocook",
  "steps": [
    { "order": 1, "agency": "Public Works", "title": "Apply for MFF permit",
      "detail": "...", "deadline_days": 30, "deadline_label": "30-day public notice",
      "cite": "dpw-182101", "status": "todo" }
  ]
}
```

`deadline_days` is an integer or `null`; `deadline_label` mirrors it or is `null`;
`status` is one of `todo | in_progress | done`.

---

## Filled example — Spot Scout (valid against §A)

```json
{
  "agent": "spot_scout",
  "reply_markdown": "Top pick for Friday lunch near SoMa: **Folsom & 2nd** (good). High midday foot-traffic proxy, low taco saturation, and it clears the 75 ft restaurant rule (nearest entrance ~110 ft). One caution spot is within the school buffer. Foot traffic is a bike-activity proxy, and the clearance checker is a guide, not legal clearance.",
  "citations": [
    { "label": "DPW Order 182,101 — 75 ft from restaurant entrance", "source": "dpw-182101", "quote": "A mobile food facility shall not be located within 75 feet of the entrance to a fixed food establishment." }
  ],
  "map_actions": [
    {
      "type": "add_spot",
      "id": "spot-1",
      "point": { "lat": 37.7852, "lng": -122.3969 },
      "verdict": "good",
      "score": 0.82,
      "reasons": ["High lunch foot-traffic proxy (bike activity)", "No taco trucks scheduled here Fri", "Clears 75 ft restaurant rule"],
      "breakdown": {
        "constraints": [
          { "rule": "75ft from restaurant entrance", "pass": true, "detail": "nearest 110ft" },
          { "rule": "7ft from hydrant", "pass": true, "detail": "nearest 20ft" },
          { "rule": "500ft from middle school (school hours)", "pass": true, "detail": "nearest 900ft" }
        ],
        "demand": { "foot_traffic_score": 0.7, "restaurant_saturation": "low" },
        "nearby_vendors": [ { "name": "El Sabor", "cuisine": "tacos", "scheduled_here": false } ]
      }
    }
  ],
  "checklist": null
}
```

## Filled example — Permit Copilot (valid against §A + §D)

```json
{
  "agent": "permit_copilot",
  "reply_markdown": "For a **no-cook ice-cream pushcart** you do **not** need a DMV registration (it's not a vehicle) or a Fire permit (no flame/propane). You do need business registration, a no-cook health permit + commissary, and the Public Works MFF permit for your sidewalk spot — and you must keep a wide, unobstructed sidewalk path. Watch the clocks: keep documents current within the 90-day window, the location application triggers a 30-day public notice, and decisions have a 15-day appeal window.",
  "citations": [
    { "label": "SF Treasurer — business registration", "source": "ttx-cert", "quote": "Every person engaging in business in San Francisco must register with the Treasurer & Tax Collector." },
    { "label": "SFDPH — mobile food facility health permit", "source": "sfdph-mff", "quote": "Mobile food facilities require a health permit; prepackaged/no-cook operations use a lower-tier permit." },
    { "label": "SF Public Works — MFF permit process (30-day notice, 15-day appeal)", "source": "sfpw-mff", "quote": "The location application is subject to a 30-day public notice; decisions may be appealed within 15 days." },
    { "label": "DPW Order 182,101 — sidewalk clearance", "source": "dpw-182101", "quote": "A mobile food facility must maintain the required unobstructed pedestrian path on the sidewalk." }
  ],
  "map_actions": [],
  "checklist": {
    "vendor_type": "pushcart_nocook",
    "steps": [
      { "order": 1, "agency": "Treasurer", "title": "Register the business", "detail": "Obtain/renew the SF Business Registration Certificate; keep it current.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "ttx-cert", "status": "todo" },
      { "order": 2, "agency": "Public Health", "title": "Health permit (no-cook tier) + commissary", "detail": "Lower-tier health permit for prepackaged/cold items; commissary/base agreement.", "deadline_days": 90, "deadline_label": "90-day document window", "cite": "sfdph-mff", "status": "todo" },
      { "order": 3, "agency": "Public Works", "title": "Apply for the MFF permit (sidewalk location)", "detail": "Apply for your sidewalk location; triggers a 30-day public notice.", "deadline_days": 30, "deadline_label": "30-day public notice", "cite": "sfpw-mff", "status": "todo" },
      { "order": 4, "agency": "Public Works", "title": "Appeal window", "detail": "Grant/deny decisions can be appealed within 15 days.", "deadline_days": 15, "deadline_label": "15-day appeal window", "cite": "sfpw-mff", "status": "todo" },
      { "order": 5, "agency": "Public Works", "title": "Maintain wide sidewalk pedestrian clearance", "detail": "Leave the required unobstructed sidewalk path; stay 75 ft from restaurant entrances, 7 ft from hydrants, 500 ft from schools during school hours.", "deadline_days": null, "deadline_label": null, "cite": "dpw-182101", "status": "todo" }
    ]
  }
}
```

## Degraded / error responses

If a needed tool returns the §B error envelope (`{ "error": { "code": ... } }`) or the KB has no
answer, still return a valid envelope: set the populated side to `[]`/`null`, put an honest
explanation in `reply_markdown` naming exactly what signal is missing, and keep `citations`
truthful (don't cite what you didn't use).
