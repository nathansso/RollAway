# Knowledge-Base Source IDs (authoritative)

Every citation in a `/chat` response (`citations[].source` in §A) and every `cite`
value Person 3 returns from the clearance geometry check (§B) **must** be one of the
ids below. This table is the single source of truth; it is mirrored additively into
`docs/CONTRACTS.md §E`. Changing an id pings Person 1 (renders citations) and Person 3
(returns `cite`).

> Rule for citations: **every permit/legal claim carries a `source` id from this table.**
> If a fact is not backed by a doc here, the agent says it isn't in the KB — it never invents.

| `source` id | Doc (in `kb/`) | Covers | Used as `cite`/`source` by |
|---|---|---|---|
| `dpw-182101` | `dpw-182101.md` | **DPW Order No. 182,101** — core Mobile Food Facility placement law. Clearance distances: **75 ft** restaurant entrance, **7 ft** hydrant, **500 ft** school (school hours), plus other placement rules. | Spot Scout (clearance check rows), Permit Copilot, **Person 3** (clearance geometry `cite`) |
| `sfpw-mff` | `sfpw-mff-permit.md` | SF **Public Works** MFF permit *process*: application, **30-day** public-notice window, hearing, **15-day** appeal window, **90-day** document window. | Permit Copilot |
| `sfpw-fees` | `sfpw-mff-permit.md` | SF Public Works MFF **fee schedule** (dollar amounts — some `SOURCE-NEEDED`). | Permit Copilot |
| `sfdph-mff` | `sfdph-mff.md` | SF **Department of Public Health** MFF health permit + plan review / commissary. | Permit Copilot |
| `sffd-permit` | `sffd-permit.md` | SF **Fire Department** permit for cooking with open flame / LPG (propane) / generators. | Permit Copilot |
| `ttx-cert` | `ttx-cert.md` | SF **Treasurer & Tax Collector** business registration certificate. | Permit Copilot |
| `ca-dmv` | `ca-dmv.md` | **California DMV** vehicle/trailer registration — applies to `truck`/`trailer` only (a pushcart is not a motor vehicle). | Permit Copilot |
| `clearance-ref` | `clearance-rules.md` | Consolidated clearance & fee **quick-reference** table (derived; each distance row cites `dpw-182101`). | Permit Copilot, Spot Scout (explainer) |
| `checklist-truck` | `truck.md` | Authored ordered checklist — **truck**. | Permit Copilot |
| `checklist-trailer` | `trailer.md` | Authored ordered checklist — **trailer**. | Permit Copilot |
| `checklist-pushcart-cooking` | `pushcart_cooking.md` | Authored ordered checklist — **pushcart (cooking)**. | Permit Copilot |
| `checklist-pushcart-nocook` | `pushcart_nocook.md` | Authored ordered checklist — **pushcart (no-cook)**. | Permit Copilot |

## The one contract-critical id

`dpw-182101` is the **only** id already baked into `docs/CONTRACTS.md` (as the `cite`
value in the §B clearance example and a `source` in the §A example). Person 3 returns
`"cite": "dpw-182101"` for every clearance-distance row. Do not diverge from that string.

## Distance rules pinned by the contract (single source of truth = `dpw-182101`)

| Rule | Required | `cite` |
|---|---|---|
| Distance from a restaurant entrance | **75 ft** | `dpw-182101` |
| Distance from a fire hydrant | **7 ft** | `dpw-182101` |
| Distance from a school (during school hours) | **500 ft** | `dpw-182101` |

These three values are frozen by `docs/CONTRACTS.md §B` and must match everywhere:
`dpw-182101.md`, `clearance-rules.md`, the eval assertions, and Person 3's geometry code.

## Published to Person 3

- Return `cite: "dpw-182101"` for **every** clearance row (restaurant / hydrant / school).
- If you add a new distance rule, add its `source` id **here first**, then use it — do not
  invent a `cite` string in Function code.
- Cuisine values you join from `cuisine_lookup.json` come from the §C enum (see
  `enrichment/README.md`), not from this table.
