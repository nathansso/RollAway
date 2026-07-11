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
