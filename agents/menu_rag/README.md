# Menu RAG (per-user) — competition overlap over items + prices

The core per-vendor enrichment. Each vendor's **real menu (items + prices)** is ingested into a
**Gradient Knowledge Base** (`menu_kb_id`). Person 2's `recommend_spots` then asks: for a candidate
spot, how much do the **nearby vendors/restaurants** overlap THIS vendor's menu? The answer is
reasoned over **actual menu items and price points — never a coarse cuisine label.**

```
menu.demo.json  ── ingest.mjs ──▶  Gradient KB (menu_kb_id) + local manifest (menu_kb.<id>.json)
                                        │
recommend_spots ──▶ query.mjs competitionOverlap({ menu_kb_id, competitors }) ──▶ item/price overlap
```

## Files

| File | Role |
|---|---|
| `menu.demo.json` | the demo vendor's REAL menu (items + prices). `cuisine_hint` is metadata only — the query never uses it. |
| `ingest.mjs` | ingest a menu → create a real Gradient KB → return `menu_kb_id`; writes a local manifest mirroring the KB. |
| `query.mjs` | `competitionOverlap({menu_kb_id, competitors})` — the interface `recommend_spots` calls. CLI: `--demo`. |
| `overlap.mjs` | pure, deterministic item+price overlap core (reused by the live KB path as fallback). |
| `gradient_kb.mjs` | thin DO Gradient Knowledge-Base REST client (create / get / data source / semantic search). |
| `kb_docs/` | the rendered menu doc ingested as the KB data source (auditing). |
| `menu_kb.<vendor_id>.json` | per-vendor manifest: `menu_kb_id` + the mirrored menu (query.mjs resolves ids through it). |

## Run

```bash
# 1. Ingest the demo menu (offline: local KB manifest; with a token: a REAL Gradient KB)
node agents/menu_rag/ingest.mjs --mock                       # offline
DIGITALOCEAN_ACCESS_TOKEN=... node agents/menu_rag/ingest.mjs # live -> real menu_kb_id

# 2. Competition-overlap query (built-in demo competitors)
node agents/menu_rag/query.mjs --demo
```

Example (`--demo`): the two nearby **taquerias** come back as **high overlap** (they sell the same
tacos/burritos/quesadillas at similar prices); the **coffee shop** and **halal cart** come back as
**zero overlap** — a cuisine label ("Mexican") could never make that item-level, price-aware
distinction.

## The interface `recommend_spots` calls

```js
import { competitionOverlap } from "./query.mjs";
const r = await competitionOverlap({
  menu_kb_id,                       // from ingest.mjs (real Gradient KB uuid, or local id)
  competitors: [                    // a candidate spot's nearby vendors/restaurants
    { name: "Taqueria Cancún", items: ["street taco","carne asada burrito"], price_points: [3.25, 10] },
    { name: "Blue Bottle",      items: ["latte","pastry"], price_level: 2 }
  ]
});
// r.competitors[i] -> { overlap_score, verdict, overlapping_items:[{my_item, competitor_item, price_gap, price_note}], price_summary }
// r.summary -> { max_overlap, direct_competitors, most_overlapping, reasoned_over:"menu items + price points (never a cuisine label)" }
```

`competitors` accepts either explicit `items` (strings or `{name,keywords,price}`) or the
`keywords` array from `enrichment/fooditems_normalized.json` (so a permit vendor's messy
`fooditems` free text becomes comparable items — see `enrichment/normalize_fooditems.mjs`). Price
points come from the restaurant's `price_points`/`price_level`; permit vendors have none, so those
competitors are matched on items alone.

## Live vs local (why the manifest mirrors the KB)

KB **creation** and inference work on the team account, but the **standalone KB retrieval** surface
varies by tier and menu ingestion may require a Spaces bucket (see `agents/RUNBOOK.md §4b`). So:

- `ingest.mjs` always creates a **real** Gradient KB (real `menu_kb_id`) when a token is present,
  attaches the menu doc best-effort, **and** writes a local manifest that mirrors the exact menu.
- `query.mjs` verifies the real KB exists, probes its semantic retrieval, and computes the
  item/price overlap. If retrieval isn't exposed, it falls back to the deterministic core over the
  mirrored menu — the result is identical and always item/price-based, never cuisine.

This keeps the demo path reliable (invariant: KBs provisioned by script, not runtime) while still
being genuinely live against the real KB.
