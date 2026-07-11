# Person 2 — Decisions Log (`feat/agents-platform`)

Every assumption made while building the Agents & Gradient Platform layer end-to-end,
so a reviewer can see *why* each choice was made without re-deriving it. Newest sections
appended as work proceeded. Dates are absolute (today = 2026-07-10).

---

## D0. Environment observed at start
- Node `v24.18.0`, npm `11.16.0`. **Single runtime chosen: Node** for fixtures, enrichment,
  and the eval runner (SETUP.md allows Python for enrichment but one toolchain is simpler and
  the fixture server is already Node/Express).
- `doctl` **not installed**; **no** `DIGITALOCEAN_ACCESS_TOKEN` / Gradient keys in the env.
  → All Gradient-console / DO steps are credential-gated. Built everything against local
  fixtures + a `--mock` enrichment classifier, verified `--offline`, and authored
  `RUNBOOK.md` + `scripts/provision.sh` for the human to finish the deploy. (Operating rule §4.)
- External network works from `curl` (SF Open Data returned HTTP 200). The earlier
  "Network error" banners were the model service, not general internet.

## D1. Sourcing the legal KB (honesty invariant)
- The gstack `/browse` skill is installed and functional (headless Chromium built).
- The canonical SF pages (SF Public Works Mobile Food Facility permit page; DPW Order
  No. 182,101 PDF) were **not** reliably retrievable at guessed URLs (404s), and
  DuckDuckGo/Bing returned ad-laden noise instead of the `.gov` canonical pages.
- **Decision:** rather than transcribe specific legal numbers (dollar fees, exact Order
  section numbers) from unreliable search snippets — which would violate *"do not fabricate
  specific legal numbers you can't source"* and *"honesty in copy"* — I:
  1. Treat the **contract-pinned** clearance values as authoritative: **75 ft** from a
     restaurant entrance, **7 ft** from a fire hydrant, **500 ft** from a school (school
     hours). These come straight from `docs/CONTRACTS.md §B` and are cited to `dpw-182101`.
  2. Treat the **task-given clocks** as authoritative: **30-day** public-notice window,
     **90-day** document window, **15-day** appeal window (PERSON2_AGENTS_TASKS.md Task 3/§D).
  3. Use the **four agencies** named in the task (Public Works, Public Health, Fire,
     Treasurer/Tax Collector) as the checklist backbone.
  4. Mark every **dollar fee** and **exact Order §-number** I could not source as a
     `SOURCE-NEEDED` block that names the exact URL to fetch and the fields it must contain.
     A human (or a later browse pass) fills these; nothing is invented.
- Net effect: everything the evals and the clearance geometry depend on is real and
  contract-backed; only unverifiable dollar amounts are stubbed, and they are visibly stubbed.

## D2. Source-id scheme (`kb/SOURCES.md` ↔ `docs/CONTRACTS.md`)
- The one shared id that already lives in the frozen contracts is **`dpw-182101`** — it is the
  `cite` value Person 3 returns from the clearance check (§B) and a `citations[].source` value
  in the §A envelope. All clearance-distance claims cite `dpw-182101` so P2's KB, P3's function
  output, and P1's rendered citation all resolve to the same doc.
- Added the other agency/process/fee ids I own (`sfpw-mff`, `sfpw-fees`, `sfdph-mff`,
  `sffd-permit`, `ttx-cert`) plus the four authored checklist doc ids. Full table in
  `kb/SOURCES.md`.
- **Kept in sync with the contract:** appended an additive **§E "Source IDs"** section to
  `docs/CONTRACTS.md`. This is purely additive — §A and §B field names are untouched, so the
  two frozen contracts stay green. (Operating rule: I may maintain the source-id list in the
  contract; I did not alter §A/§B.)
- **Published to Person 3:** the `cite` values P3 must return from the clearance geometry check
  are exactly the ids in `kb/SOURCES.md` — clearance rows use `dpw-182101`. P3 should not
  hardcode any other string. See the "Publish to Person 3" note at the bottom of `SOURCES.md`.

## D3. Instruction versioning
- Every file in `instructions/` carries a header block (`version:`, `updated:`, `changelog:`).
  Started all at `v1.0.0` dated 2026-07-10. The eval suite is the gate: bump the version and
  add a changelog line on every instruction change, then re-run `evals --offline`.

## D4. Envelope shaping is shared, imported by both agents
- `instructions/output_envelope.md` is the single source of truth for the §A envelope. Both
  `spot_scout.md` and `permit_copilot.md` say "obey `output_envelope.md` verbatim." Spot Scout
  fills `map_actions[]` and sets `checklist: null`; Permit Copilot fills `checklist` and leaves
  `map_actions: []`. This guarantees Person 1 gets one shape regardless of which agent answered.

## D5. Router: LLM prompt + deterministic reference implementation
- `instructions/router.md` is the LLM routing system prompt (keyword lists + worked examples).
- For the **offline eval** to test routing without a live model, `evals/lib/route.mjs`
  implements the *exact same keyword lists* as a pure function. It is the reference
  implementation of the heuristic the LLM router follows; the eval asserts each seed prompt
  routes correctly. If you change the keyword lists in `router.md`, mirror them in `route.mjs`
  (the eval will catch drift on the seed prompts).

## D6. Checklists are markdown **and** machine-readable
- Each `kb/<vendor_type>.md` checklist is a first-class KB doc: human-readable ordered prose
  across all four agencies, **plus** a fenced ` ```json ` block holding the exact §D
  `{ vendor_type, steps:[...] }` object. Single source of truth; the eval runner parses the
  JSON block to assert structure (e.g. pushcart excludes DMV, includes wide sidewalk clearance).

## D7. Tool registration is stub-first and swap-ready
- `fixtures/serve.js` serves one route per §B tool returning the §B example **verbatim**, with
  an error-envelope path behind `?fail=CODE`. `fixtures/tool-schemas.json` holds the six
  function-calling tool definitions with §B field names, ready to paste into the Gradient
  console. Swapping to Person 3's live Functions is a one-line base-URL change (`TOOL_BASE_URL`);
  documented in `RUNBOOK.md`.

## D8. Cuisine enrichment: pre-compute, keyed by permit_id, prompt-cached
- Pulled the **real** SF permit dataset (`rqzj-sfat`, 497 records) so the sample lookup is real.
- `enrichment/classify.mjs` builds an **identical cacheable instruction prefix** on every call
  (the §C enum + rules) and appends only the one record — so Gradient prompt caching hits the
  prefix. Live mode reads `GRADIENT_API_KEY` (+ `GRADIENT_INFERENCE_URL`, `GRADIENT_MODEL`);
  `--mock` runs a deterministic keyword classifier so the pipeline is fully runnable now.
- Output `cuisine_lookup.json` is `{ "<permit_id>": "<cuisine>" }`, **pre-computed** and handed
  to Person 3 to join in `get_vendors` (recommended over inline classification: cheaper, stable,
  no per-request latency). P2 owns the §C enum; any change pings P1 + P3.

## D9. Guardrails live as repo config, attached in the console
- `instructions/guardrails.md` (spec) + `instructions/guardrails.config.json` (machine-readable
  PII types, jailbreak patterns, refusal copy, pre-logging redaction rule). Both agents attach
  the same guardrail set. The console attachment is a deploy step in `RUNBOOK.md`.

## D10. Scope discipline
- Wrote only inside `/agents` plus the additive §E in `docs/CONTRACTS.md`. Did not touch
  `/frontend` or `/functions`. No push, no PR, no deploy, no paid external calls.

## D11. `source` field-name overlap (not a bug)
- The JSON key `source` is used by **two different** contract fields: §A `citations[].source` (a
  KB citation id, must resolve in `SOURCES.md`) and §B `get_events`/`get_closures` `.source` (a
  data-feed label like `ticketmaster` / `sfmta_event` / `bay_wheels`). A naive grep for
  `"source": "..."` flags `ticketmaster` as an "unresolved citation" — it is **not**; it is a §B
  data-provenance value living inside the tool schema in `spot_scout.md`. Citation-id resolution
  is validated correctly by the eval (checks `citations[].source` and checklist `step.cite`
  only). No action needed; documented so a reviewer isn't misled.

## D13. Issue 1 — 4th clearance row (sidewalk width) gets a distinct cite `sf-sidewalk-width`
- **Decision:** add a **new** source id `sf-sidewalk-width` (do NOT reuse `dpw-182101`).
- **Evidence (from the repo, source doc):** `agents/kb/dpw-182101.md` does **not** establish the
  sidewalk minimum-width rule — it explicitly states "The exact minimum clear width is
  `SOURCE-NEEDED`" and lists "minimum unobstructed sidewalk pedestrian clear width (ft) for
  pushcarts" as a field to fill *from the Order*. So `dpw-182101` cannot honestly carry it today.
- **Legal-basis evidence:** the rule (10 ft = 6 ft clear pedestrian path + 4 ft cart footprint)
  is grounded in the **SF Public Works Code + ADA path-of-travel**, a *different* legal basis than
  the Order's placement distances. And a `cite` must resolve to a **source document**, not the
  dataset `4g86-grxu` (that's Person 3's compute input). `SOURCES.md` also requires new distance
  rules to be registered before use. All three point to a distinct id.
- **Slug:** `sf-sidewalk-width` (matches the recommendation and the existing kebab-case naming).
- **Registered + propagated:** new KB doc `kb/sf-sidewalk-width.md` (legal basis stated; exact PW
  Code § left `SOURCE-NEEDED`, not fabricated); added to `kb/SOURCES.md` and `docs/CONTRACTS.md
  §E`; `dpw-182101.md` / `clearance-rules.md` updated to point the sidewalk rule at the new id;
  fixtures return the true **4-row** shape for pushcart types (`clearancePayload()` in
  `payloads.mjs`, vendor-type-aware in `serve.js`); `spot_scout.md` explains the 4th row and cites
  it (still only *explaining* the tool, never computing width); pushcart checklists split the
  clearance step into a sidewalk-width step (`sf-sidewalk-width`) + a distances step
  (`dpw-182101`); evals add checks 8b/8c and tighten #9.
- **Row 4 applies to pushcart types only** (they operate on the sidewalk); truck/trailer stay at 3
  rows. Values 75/7/500 (§B-frozen) unchanged.

## D14. Issue 2 — clearance tool name aligned to `check_clearance`, pinned in §B
- **Decision:** rename OUR tool/route/payload/prompt `clearance_check → check_clearance` to match
  Person 3's DO Function, and **pin the name in `docs/CONTRACTS.md §B`** so it can't recur (§B
  never named the function, which is how the two branches diverged). This makes the go-live
  `tool_base_url` swap a clean same-named mapping to `.../rollaway/check_clearance` (no silent
  404). Renamed across `fixtures/{tool-schemas.json,serve.js,payloads.mjs,README.md}`,
  `instructions/spot_scout.md`, `evals/run.mjs`, `evals/README.md`, `RUNBOOK.md`. Only remaining
  `clearance_check` string is the deliberate old→new note in `RUNBOOK.md → HANDOFF`.

## D15. PING P1 + P3 (contract clarifications — non-breaking, no version bump)
- **PING P1 + P3 (`docs/CONTRACTS.md §B`):** the clearance Function is named **`check_clearance`**;
  pushcart vendor types return a **4th** sidewalk-width row citing `sf-sidewalk-width`. Non-breaking
  (no §A/§B field name changes; truck example unchanged). **`contract_version` intentionally NOT
  bumped** (clarification, not a breaking change).
- **PING P1 + P3 (`docs/CONTRACTS.md §E` + `kb/SOURCES.md`):** new source id **`sf-sidewalk-width`**
  added to the citation/cite vocabulary. P1 may render it as a citation; P3 must return it.
- **PING P3 (handoff, one line):** in
  `functions/packages/rollaway/check_clearance/constants.js`, set the sidewalk-width row's `cite`
  to `"sf-sidewalk-width"` (was `dpw-182101`). Exact snippet in `agents/RUNBOOK.md → HANDOFF`.
  I did **not** edit that file — it lives on `feat/functions-data`, not this branch.

## D16. §B.4 — get_restaurants window-aware competition (Person-2 slice of Person 3's plan)
- **Context:** Person 3's `get_restaurants` plan adds optional `day`/`time_from`/`time_to` inputs and,
  when a window is given, a `window` output block (open-during-window competition, popularity-
  weighted, with per-cuisine demand gap). It also upgrades top-level `saturation` to Σ venueWeight
  (same field/enum). The plan asked "ping Person 2 to mirror the additive schema into their tool
  registration." User scoped me to **"my Person-2 slice only."**
- **The plan text I received was truncated** at the `window` block. Rather than guess later or risk
  the exact name-drift that caused issues #1/#2, I **pinned the additive §B.4 shape in
  `docs/CONTRACTS.md §B` myself** (I co-own §B) with field names taken straight from the plan's
  stated semantics, and mirrored it into my side:
  - `docs/CONTRACTS.md §B.4`: optional inputs (`day` mon..sun, `time_from`/`time_to` HH:MM, all
    three together or `BAD_INPUT`; overnight wraps); `saturation` noted as now popularity-weighted
    (same field/enum); additive `window` block `{ day, time_from, time_to, open_count,
    open_weighted, saturation, by_cuisine_open }`. **Additive, no existing field/enum changes →
    `contract_version` stays 1.**
  - `fixtures/tool-schemas.json` + `payloads.mjs` (`restaurantsPayload()`, window only when full
    window supplied; partial → `BAD_INPUT`) + `serve.js` (window-aware route).
  - `instructions/spot_scout.md`: pass the window to `get_restaurants` when the vendor names one;
    rank on `window.saturation` + `window.by_cuisine_open` (demand gap); `demand.restaurant_saturation`
    prefers `window.saturation`. Still a competition proxy.
  - `evals/run.mjs`: `get_restaurants` §B inputs now include the three window fields; new check 8d
    (additive window: full→block, partial→BAD_INPUT, none→base 4 keys).
- **Base output unchanged** when no window is passed (behaviour identical to today).

## D17. PING P3 (+ the two riders in Person 3's plan)
- **PING P3 (`docs/CONTRACTS.md §B.4`):** field names for the `get_restaurants` `window` block and
  the three optional inputs are now pinned in §B — **Person 3's Function must return exactly these
  names** (`open_count`, `open_weighted`, `saturation`, `by_cuisine_open`; inputs `day`/`time_from`/
  `time_to`). Additive, non-breaking, no `contract_version` bump. My tool registration + Spot Scout
  already read them; swap the fixture URL for the live Function and re-run evals.
- **Rider 1 (P3, not mine):** copy the now-published `agents/enrichment/cuisine_lookup.json` into
  `get_vendors` (they were joining against an empty `{}`). Already published + handoff in RUNBOOK §10.
- **Rider 2 (coordination):** Person 3's plan says to file a coordination issue so P2 mirrors the
  schema — I did the mirror proactively, so that issue is effectively pre-satisfied. Have NOT filed
  a GitHub issue this turn (not requested); can comment/open one on request.
- **Note:** I did **not** touch `/functions` — the `get_restaurants` implementation is Person 3's,
  on `feat/functions-data`.

## D18. Getting Gradient online — managed Agents blocked; built a working runtime instead (2026-07-11)
- A DO token was provided. Probed it against the live API (never committed; stored outside the
  repo; flagged for rotation). Findings:
  - Token belongs to the team account (**nathansso**), has write scope (created+deleted a tag),
    and **serverless inference works** (Llama 3.3 70B chat completions → 200).
  - **KB creation works** (`POST /v2/gen-ai/knowledge_bases` → created+deleted a test KB).
  - **`POST /v2/gen-ai/agents` is FORBIDDEN** (403 across GPT-4o-mini/GPT-oss; 404 for Llama-3.1-8B).
    So *managed* Gradient **Agent** creation is gated on this account — a console/entitlement toggle
    only the account owner can flip (Gradient → Agents). Everything else (inference, KB, tags) works.
  - Cleaned up every probe resource (test KB + tag deleted; no agents were created).
- **Decision:** since managed Agent creation is blocked but inference is fully available, I built a
  real **agent runtime on Gradient serverless inference** (`agents/runtime/`) — same instructions,
  KB, tool schemas, and guardrails, orchestrated locally and executed via Gradient's model:
  - `POST /chat` (§A contract) → anonymize → jailbreak-refuse → route → agent → validate §A.
  - Spot Scout does real **function calling** over the tool server (fixtures now, P3's Functions
    later); Permit Copilot is **KB-grounded** with citations. Clearance citations are **backfilled
    from the actual `check_clearance` tool output** so the "every clearance answer carries a
    citation" invariant holds even when the model omits it.
  - **Verified live:** permit checklist (valid §A, pushcart_nocook, excludes DMV, includes sidewalk
    clearance, cites sf-sidewalk-width) ~95s; geometry (valid §A, calls check_clearance, cites
    dpw-182101) ~18s; jailbreak refused with no inference call; health route OK.
  - **Known limitation:** Permit latency ~60–100s (full-context RAG on 70B). Managed Agents do
    server-side retrieval and are faster — that's the production path once Agents are enabled.
- **Also wrote** `scripts/provision-genai.mjs`: a real REST provisioner (reverse-engineered +
  partially verified) that creates the two managed agents from the repo instructions the moment
  Agent creation is enabled; it reports the 403 + enable guidance until then.
- **PING (account owner / P1):** to switch from the runtime to managed Agents, enable the Gradient
  **Agents** feature on the team in the DO console (or ask DO support to enable agent creation),
  then run `provision-genai.mjs`. No repo change needed — the runtime and managed paths share all
  artifacts.

## D12. Verification (this session) — all GREEN
- `fixtures`: `npm install` (express) + all 6 routes HTTP 200 with §B keys; `?fail=CODE` returns
  the §B error envelope (RATE_LIMIT→429, UPSTREAM_TIMEOUT→504).
- `enrichment --mock`: 187 unique permits classified from the real 497-record dataset; **every**
  value inside the §C enum; `cuisine_lookup.json` written, keyed by `permit_id`.
- `evals --offline`: **15/15 GREEN** (routing, §A/§D conformance, §B tool-schema match, source-id
  resolution, SOURCES⇄§E sync, seeds #1–#5 behaviors, guardrail jailbreak + PII, honesty rules).
- `evals --live`: correctly **SKIPPED** (no `GRADIENT_ENDPOINT_URL`/`GRADIENT_AGENT_KEY` yet).
- No dollar fees fabricated anywhere in `kb/`; unverifiable fees/§-numbers are `SOURCE-NEEDED`
  stubs with exact fetch URLs.
