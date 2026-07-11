# Person 3 — Gradient AI: Agents & RAG (branch `feat/gradient-ai`)

**Layer: DigitalOcean Gradient (`/agents`).** You own all AI reasoning — but it runs **backstage**. Your output is always structured JSON that Person 1 renders as UI (ranked spots, permit checklist). **Never a chat window.** Code (Person 2) does math and law; you do judgment and language, grounded in real menus and real rules.

> Reuse the existing `/agents` (Spot Scout, Permit Copilot, KB, guardrails, evals, the working Gradient runtime already exist). This build adds the **per-user Menu RAG**, the **fooditems normalization** enrichment, and reshapes both agents for the **map-first, single-turn, no-router** flow.

---

## Demo-reliability stance (your pieces)
- **Menu KB is pre-provisioned.** `menu_kb_id` points at a knowledge base created **ahead of the demo**, not built at runtime. (Optional showpiece: ONE live menu ingestion, only if there's a stable moment — never on the critical path.)
- **Single-turn agents, no router.** Spot Scout is called **once** with all signals pre-gathered by Person 2's `recommend_spots` — it explains, it does NOT discover data through multi-round tool calls. Permit Copilot is invoked directly by the Permits tab. There is **no router LLM turn** — do not build one.
- **Guardrails on both agents.** Agent evaluations (~10 test prompts) if time allows.

---

## What you own

### 1. Menu RAG (per user) — the core enrichment
- Ingest each vendor's **actual menu (items + prices)** into a Gradient knowledge base; return a `menu_kb_id`.
- Expose a **competition-overlap query** Person 2's `recommend_spots` calls: given a candidate spot's nearby vendors/restaurants (their normalized items + price points), return how much they overlap THIS vendor's real items + price points. **Reason over menu items, never a coarse cuisine label.**
- Pre-provision the **demo vendor's** menu KB ahead of time.

### 2. `fooditems` normalization (serverless inference)
- Normalize nearby vendors' messy `fooditems` free text (from `rqzj-sfat`) into comparable items/keywords so the Menu RAG can match against them.
- Use **prompt caching** (shared instruction prefix — every call differs only by the record). Best-effort; **preserve the raw text** (frontend shows it in vendor detail).

### 3. Spot Scout agent (ranking rationale)
- Input: `{user_profile, when, candidate spots WITH their pre-computed signals + deterministic scores}` (Person 2 gathers everything).
- Output: ranked recommendations + a **one-line "why" per spot**. It explains the deterministic score; it does not recompute it and does no math/legality.
- **Single turn, invoked directly** by `recommend_spots`. Return strict JSON for the frontend.

### 4. Permit Copilot agent
- Input: `{vendor_type, permit_progress}`. Grounded in a **Gradient Knowledge Base** (SF Public Works mobile-food rules, DPW Order 182,101, fee schedule, vendor-type requirements).
- Output: the **personalized checklist with citations** — four agencies (Public Works, Public Health, Fire, Treasurer) as ordered sections, each document an item, with the **hidden deadlines surfaced** (30-day notice, 90-day tentative approval, 15-day appeal) and `autofill_field` hints where the profile can pre-fill. Rendered as the Permits tab UI (not chat), invoked directly.

### 5. Guardrails + evals
- Guardrails on both agents. ~10-prompt eval gate (vendor-type checklist correctness, no ungrounded rules, single-turn behavior) if time allows.

---

## Contracts (lock day 1)
- **You consume → Person 2:** Spot Scout input (pre-gathered signals + scores); the Menu RAG competition-overlap query interface; raw `fooditems` batches to normalize.
- **You produce → Person 1 (via Person 2's Functions):** Spot Scout ranked JSON (`why_one_line` per spot); Permit Copilot checklist JSON (agencies → documents → {label, deadline, cite, autofill_field?}).
- **Honesty:** every permit claim carries a **citation**; ungrounded → say so, don't invent. Legality wording stays "a guide, verify with the SF Permit Center." You never assert foot-traffic/legality numbers — those are Person 2's.

## Files (target)
`agents/instructions/{spot_scout,permit_copilot}.md`, `agents/kb/` (permit KB docs), `agents/menu_rag/{ingest.mjs,query.mjs}`, `agents/enrichment/normalize_fooditems.mjs` (prompt-cached), `agents/runtime/*` (reuse existing), `agents/evals/`, `agents/scripts/provision*.mjs` (pre-provision demo menu KB + both KBs).

## Verification (DoD)
- [x] Menu KB pre-provisioned by script; `menu_kb_id` handle returned; competition-overlap query returns item/price overlap (not a cuisine label). — `menu_rag/{ingest,query}.mjs`, `scripts/provision-kbs.mjs`; eval "menu_rag overlap: item+price overlap, not a cuisine label" (taqueria=0.7, coffee=0). *(Real Gradient KB creation runs once a DO token is injected — DECISIONS D24.)*
- [x] `fooditems` normalizer runs with prompt caching; raw text preserved. — `enrichment/normalize_fooditems.mjs --mock` (187 permits, byte-identical prefix sha256:6d06217ef6ac, raw kept on every record); eval "normalize_fooditems: items+keywords, raw preserved, constant cache prefix".
- [x] Spot Scout returns strict ranked JSON in a single turn from pre-gathered signals (no multi-round tool calls, no router). — `spot_scout.md` v2.0.0 + `runtime/runSpotScoutSingleTurn`; eval "spot_scout single-turn: valid §A, 0 tool calls, ranked from pre-gathered signals".
- [x] Permit Copilot returns the four-agency checklist with surfaced deadlines + citations; vendor-type differences correct (pushcart_no_cook skips DMV/Fire; truck includes them). — `permit_copilot.md` v2.0.0 + `kb/<vt>.md`; evals "four agencies + autofill", "30/90/15-day clocks", "truck DMV+Fire", "pushcart_nocook excludes DMV".
- [x] Guardrails attached to both agents; eval gate green (24/24 offline). — `guardrails.config.json` (attach_to both) + evals.
- [x] No key committed; KBs provisioned via script, not runtime, on the demo path. — grep clean; `scripts/provision-kbs.mjs` + `menu_rag/ingest.mjs` are scripts; token read from env only.
- [~] **LIVE** (real token): provision both KBs, live competition-overlap against the real menu KB, live end-to-end runtime run, `run.mjs --live` — all wired and ready; blocked only on the DO token being present in the session env (not found this session; DECISIONS D24 + final report).

## Branch etiquette
Own `/agents`. Lock the Spot Scout input/output and the Menu-RAG query interface with Person 2, and the checklist JSON shape with Person 1, on day 1. Pre-provision the demo menu KB against the shared **demo scenario** (pick it with the team first).
