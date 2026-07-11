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
| `dpw-182101` | `dpw-182101.md` | **DPW Order No. 182,101** — core Mobile Food Facility placement law. Clearance **distances**: **75 ft** restaurant entrance, **7 ft** hydrant, **500 ft** school (school hours). (The sidewalk path-of-travel / min-width rule has a different legal basis and is cited separately to `sf-sidewalk-width`.) | Spot Scout (clearance rows 1-3), Permit Copilot, **Person 3** (`check_clearance` `cite` for the 3 distances) |
| `sfpw-mff` | `sfpw-mff-permit.md` | SF **Public Works** MFF permit *process*: application, **30-day** public-notice window, hearing, **15-day** appeal window, **90-day** document window. | Permit Copilot |
| `sfpw-fees` | `sfpw-mff-permit.md` | SF Public Works MFF **fee schedule** (dollar amounts — some `SOURCE-NEEDED`). | Permit Copilot |
| `sfdph-mff` | `sfdph-mff.md` | SF **Department of Public Health** MFF health permit + plan review / commissary. | Permit Copilot |
| `sffd-permit` | `sffd-permit.md` | SF **Fire Department** permit for cooking with open flame / LPG (propane) / generators. | Permit Copilot |
| `ttx-cert` | `ttx-cert.md` | SF **Treasurer & Tax Collector** business registration certificate. | Permit Copilot |
| `ca-dmv` | `ca-dmv.md` | **California DMV** vehicle/trailer registration — applies to `truck`/`trailer` only (a pushcart is not a motor vehicle). | Permit Copilot |
| `sf-sidewalk-width` | `sf-sidewalk-width.md` | **Minimum sidewalk width / pedestrian path-of-travel** for sidewalk MFFs: **10 ft** min (6 ft clear path + 4 ft cart). SF Public Works Code + ADA path-of-travel (distinct legal basis from `dpw-182101`). Applies to **pushcart** types only. | Spot Scout (clearance row 4), Permit Copilot, **Person 3** (`check_clearance` `cite` for the sidewalk-width row) |
| `clearance-ref` | `clearance-rules.md` | Consolidated clearance & fee **quick-reference** table (derived; distance rows cite `dpw-182101`, sidewalk-width row cites `sf-sidewalk-width`). | Permit Copilot, Spot Scout (explainer) |
| `checklist-truck` | `truck.md` | Authored ordered checklist — **truck**. | Permit Copilot |
| `checklist-trailer` | `trailer.md` | Authored ordered checklist — **trailer**. | Permit Copilot |
| `checklist-pushcart-cooking` | `pushcart_cooking.md` | Authored ordered checklist — **pushcart (cooking)**. | Permit Copilot |
| `checklist-pushcart-nocook` | `pushcart_nocook.md` | Authored ordered checklist — **pushcart (no-cook)**. | Permit Copilot |

## The contract-baked ids

`dpw-182101` is baked into `docs/CONTRACTS.md` (the `cite` in the §B clearance example, a
`source` in the §A example) and Person 3 returns it for the three clearance **distances**.
`sf-sidewalk-width` is the new id for the **4th** clearance row (sidewalk width) on pushcart
types; it is registered in `docs/CONTRACTS.md §E`. Do not diverge from either string.

## Clearance rows returned by `check_clearance` (the `cite` per row)

| # | Rule | Required | Vendor types | `cite` |
|---|---|---|---|---|
| 1 | Distance from a restaurant entrance | **75 ft** | all | `dpw-182101` |
| 2 | Distance from a fire hydrant | **7 ft** | all | `dpw-182101` |
| 3 | Distance from a school (during school hours) | **500 ft** | all | `dpw-182101` |
| 4 | Minimum sidewalk width (6 ft path + 4 ft cart) | **10 ft** | `pushcart_cooking`, `pushcart_nocook` only | `sf-sidewalk-width` |

Rows 1-3 are frozen by `docs/CONTRACTS.md §B` (values 75/7/500). Row 4 is returned **only** for
the two pushcart types (trucks/trailers operate from the curb lane, not the sidewalk), so
`check_clearance` returns **3 rows for truck/trailer, 4 rows for pushcart types**. These must
match everywhere: `dpw-182101.md`, `sf-sidewalk-width.md`, `clearance-rules.md`, the fixtures,
the eval assertions, and Person 3's geometry code.

## Published to Person 3

- The function is named **`check_clearance`** (pinned in `docs/CONTRACTS.md §B`).
- Return `cite: "dpw-182101"` for clearance rows 1-3 (restaurant / hydrant / school).
- Return `cite: "sf-sidewalk-width"` for the **4th** sidewalk-width row (pushcart types only).
  See the exact one-line change in `agents/RUNBOOK.md → HANDOFF` for
  `functions/packages/rollaway/check_clearance/constants.js`.
- If you add a new clearance rule, add its `source` id **here first**, then use it — do not
  invent a `cite` string in Function code.
- Cuisine values you join from `cuisine_lookup.json` come from the §C enum (see
  `enrichment/README.md`), not from this table.
