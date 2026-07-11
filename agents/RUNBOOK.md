# RUNBOOK — deploy Person 2's layer to Gradient

Everything in this repo is built and verified against fixtures. What remains needs **real
DigitalOcean / Gradient credentials** (a human step). This runbook is the click-by-click; it
mirrors `SETUP.md §4` and maps **which repo artifact goes into which console field**. Where a
step can be scripted, `scripts/provision.sh` does it.

> Golden rule: the repo is the source of truth, the console is the deployment. If you change a
> prompt/schema/KB doc in the console, change it here too and re-run `evals/run.mjs --offline`.

## 0. Prereqs (once)

- `doctl` installed and `doctl auth init` done (paste DO API token), or set
  `DIGITALOCEAN_ACCESS_TOKEN`.
- Access to the **Gradient AI Platform** on the team's DO account (ask Dat; hackathon credits).
- `node -v` ≥ 20.

Optional scripted pass:
```bash
DIGITALOCEAN_ACCESS_TOKEN=... agents/scripts/provision.sh          # doctl/console pointers
DIGITALOCEAN_ACCESS_TOKEN=... node agents/scripts/provision-genai.mjs   # real REST provisioner
```

## 0b. Managed Agents vs the runtime (current status — read this first)

Probed the DO token on 2026-07-11: **serverless inference works** and **KB creation works**, but
**managed Agent creation is currently forbidden** on this account (`POST /v2/gen-ai/agents` → 403).
So there are two ways to be "online", and we run the second today:

- **Managed Gradient Agents** (steps §1–§8 below) — the production target. **Blocked** until the
  account enables the Gradient **Agents** feature (DO console → Gradient → Agents, or ask DO
  support to enable agent creation for the team). Then `node agents/scripts/provision-genai.mjs`
  creates both agents from the repo instructions and you finish §3–§8.
- **The runtime** (`agents/runtime/`, `runtime/README.md`) — a working implementation on Gradient
  **serverless inference** that runs **now**, using the same instructions/KB/tools/guardrails.
  Start it and hand Person 1 its `POST /chat` URL:
  ```bash
  cd agents/fixtures && npm install && PORT=8787 node serve.js &
  cd agents/runtime && GRADIENT_API_KEY=<key> TOOL_BASE_URL=http://localhost:8787 node server.mjs
  ```
  Both paths emit the same §A envelope, so Person 1's integration doesn't change when you flip from
  the runtime to managed Agents.

> **Map-first, single-turn flow (this build).** The runtime now exposes **direct** endpoints with
> **no router turn**: `POST /spot_scout` (single-turn — `recommend_spots` pre-gathers every signal +
> deterministic score and calls once), `POST /permit_copilot` (the Permits tab calls directly), and
> `POST /menu_overlap` (Menu-RAG competition overlap over items + prices). This is the live path we
> run today (managed Agents remain the production target once enabled). `GRADIENT_API_KEY` powers the
> `why_one_line` / prose generation; with no key the endpoints still return valid §A via deterministic
> templates. Start it with `GRADIENT_API_KEY=<key> node agents/runtime/server.mjs`.

## 0c. Provision BOTH knowledge bases by script (permit KB + demo menu KB)

KBs are provisioned by **script, not at runtime** (invariant §3). One command does both, idempotently:

```bash
DIGITALOCEAN_ACCESS_TOKEN=<rw token> node agents/scripts/provision-kbs.mjs
#   -> permit KB  (agents/kb/*.md)          attach to permit_copilot
#   -> demo menu KB (menu_rag/menu.demo.json) returns a REAL menu_kb_id for recommend_spots
node agents/scripts/provision-kbs.mjs --mock       # offline dry-run (local menu manifest)
```

The token is read from env only, never printed or written to a file. Re-running reuses existing
KBs (matched by name) instead of duplicating them.

### 0d. Menu KB ingest + query (Person 3's Menu RAG)

```bash
# Raw text -> guarded structured menu (every retained price must occur in the source)
node agents/menu_rag/parse.mjs --text menu.txt --vendor-id el-sabor --vendor-type truck --mock
node agents/menu_rag/parse.mjs --text menu.txt --vendor-id el-sabor --mock | node agents/menu_rag/ingest.mjs --mock
node agents/menu_rag/parse_and_ingest.mjs --text menu.txt --vendor-id el-sabor --vendor-type truck --mock

node agents/menu_rag/ingest.mjs --mock                        # offline: local KB manifest
DIGITALOCEAN_ACCESS_TOKEN=... node agents/menu_rag/ingest.mjs  # live: real Gradient KB -> menu_kb_id
node agents/menu_rag/query.mjs --demo                         # competition overlap (items+prices)
```

`parse.mjs` uses the Gradient-backed `instructions/menu_parser.md` extractor in live mode. Code then
verifies each parsed numeric price occurs in the untrusted source text; an untraceable item is
logged and dropped before `ingestMenu()` receives the menu.

`recommend_spots` imports `competitionOverlap({ menu_kb_id, competitors })` from
`menu_rag/query.mjs`. Menu ingestion into the KB may require a Spaces bucket on some account tiers;
when it isn't available the script still creates the real KB (real `menu_kb_id`) and mirrors the
menu locally so the overlap query stays live and item/price-based (see DECISIONS D19, §4b below).

## 1. Project

Gradient console → create/join the **`rollaway`** project.

## 2. Create the two agents

| Console agent | Model choice | Paste as instructions |
|---|---|---|
| `spot-scout` | strong **function-calling** model | `instructions/spot_scout.md` **+** append `instructions/output_envelope.md` |
| `permit-copilot` | strong **RAG + citations** model | `instructions/permit_copilot.md` **+** append `instructions/output_envelope.md` |

> Both agents must import the **same** `output_envelope.md` so Person 1 gets one shape. Append it
> to each agent's system instructions (or use the platform's shared-instruction feature if present).

## 3. Routed entry point (what Person 1 calls)

Create the routed endpoint in front of both agents. Configure the router with
`instructions/router.md`:
- location / where / park / traffic / events / closures → **`spot-scout`**
- permit / license / fire / legal / checklist / fee → **`permit-copilot`**
- ambiguous → one-line clarifier or default `spot-scout`.

**Mint the agent access key** and hand Person 1 **(a) the routed endpoint URL** and **(b) the
key** — early, even while the agents are still dumb. Person 1 puts the key in App Platform env
(not client code); if Gradient forces the key client-side, front it with a thin DO Function proxy
(decide with P1).

## 4. Knowledge base → attach to `permit-copilot` ONLY

1. Create a KB in the project.
2. Ingest **all** of `agents/kb/*.md` (the four checklists + the agency/law/reference docs).
3. Attach the KB to **`permit-copilot`** (never to Spot Scout).
4. Citation ids: the KB's `source` ids MUST equal `kb/SOURCES.md`. These are the same ids that
   appear in §A `citations[].source` and that **Person 3** returns as `cite` from the clearance
   check. Do not rename any id in the console.

## 4b. Menu KB (per-user) — attach to the Menu-RAG query path

The **demo menu KB** (`menu_rag/menu.demo.json` → `menu_kb_id`) is separate from the permit KB. On
this account KB creation + inference work, but the standalone KB retrieval surface / Spaces-backed
ingestion can vary by tier, so `menu_rag/query.mjs`:
1. verifies the real KB exists (`GET /v2/gen-ai/knowledge_bases/{id}`),
2. probes its semantic retrieval, and
3. computes the item/price overlap — falling back to the deterministic core over the mirrored menu
   when retrieval isn't exposed. Either way the overlap is item + price based, never a cuisine label.

To fully ingest the menu into the KB for server-side retrieval, upload the rendered doc
(`menu_rag/kb_docs/<vendor_id>-menu.md`) as a Spaces/file data source (needs Spaces keys), then
re-run `ingest.mjs`. The `menu_kb_id` handed to `recommend_spots` does not change.

## 5. Function tools → register on `spot-scout` (schemas verbatim from §B)

Register **6** tools from `fixtures/tool-schemas.json` (names + input params are verbatim §B):
`get_vendors`, `get_closures`, `get_foot_traffic`, `get_restaurants`, `get_events`,
`check_clearance`.

- **Now (stub):** point each tool's endpoint at the fixture server. Expose it to Gradient with a
  tunnel (`ngrok http 8787`) or deploy `fixtures/serve.js` as a throwaway DO Function. Set
  `tool_base_url` accordingly.
- **Go-live:** replace `tool_base_url` (and each console endpoint) with **Person 3's real
  Function URLs** — one line per tool. Tool names now match Person 3's Function names exactly
  (including `check_clearance`), so this is a clean same-named swap for every tool — e.g.
  `check_clearance` maps directly to `.../rollaway/check_clearance`. Then re-run the eval suite.

## 6. Guardrails → attach to BOTH agents

Attach **sensitive-data anonymization** + **jailbreak detection** to `spot-scout` AND
`permit-copilot`, configured to match `instructions/guardrails.config.json`:
- PII types: EMAIL, PHONE, SSN, CREDIT_CARD, STREET_ADDRESS, IP_ADDRESS (+ platform NER for
  names). Redact **before logging**.
- Jailbreak: refuse with the refusal copy in the config; never reveal the system prompt/tools/KB.

## 7. Serverless-inference enrichment

```bash
cd agents/enrichment
curl "https://data.sfgov.org/resource/rqzj-sfat.json?\$limit=5000" > permits.json
GRADIENT_API_KEY=<key> node classify.mjs        # or: node classify.mjs --mock
```
Set `GRADIENT_INFERENCE_URL` / `GRADIENT_MODEL` from the console if they differ from the
defaults. Hand `cuisine_lookup.json` to **Person 3** (their `get_vendors` joins on `permit_id`).

## 8. Verify the deploy

```bash
export GRADIENT_ENDPOINT_URL=<routed endpoint URL>
export GRADIENT_AGENT_KEY=<agent access key>
cd agents/evals && node run.mjs --live      # replays all seeds against the live endpoint
```
Also keep `node run.mjs --offline` GREEN after every instruction edit.

## 9. Artifact → console cheat sheet

| Repo artifact | Goes into |
|---|---|
| `instructions/spot_scout.md` (+ `output_envelope.md`) | `spot-scout` agent instructions |
| `instructions/permit_copilot.md` (+ `output_envelope.md`) | `permit-copilot` agent instructions |
| `instructions/router.md` | routed entry point config |
| `fixtures/tool-schemas.json` | `spot-scout` Function tools (6) |
| `kb/*.md` | knowledge base (attached to `permit-copilot`) |
| `kb/SOURCES.md` ids | citation ids + Person 3's `cite` values |
| `instructions/guardrails.config.json` | guardrails on BOTH agents |
| `enrichment/cuisine_lookup.json` | handed to Person 3 for `get_vendors` |

## 10. Hand-offs

- **Person 1:** routed endpoint URL + agent key (put in App Platform env).
- **Person 3:** `cuisine_lookup.json` + the `kb/SOURCES.md` id list; return `cite: "dpw-182101"`
  for the three clearance **distance** rows and `cite: "sf-sidewalk-width"` for the **4th**
  sidewalk-width row (pushcart types only) — see HANDOFF below. When their Functions are live,
  send their URLs so we swap `tool_base_url`.
- **Contract changes** (cuisine enum §C, tool schema §B, envelope §A): edit `docs/CONTRACTS.md`
  and ping both.

---

## HANDOFF → Person 3 (`feat/functions-data`, not editable from here)

**1. Sidewalk-width row cite (Issue 1).** In
`functions/packages/rollaway/check_clearance/constants.js`, the 4th clearance row (minimum
sidewalk width, returned for `pushcart_cooking` / `pushcart_nocook`) must set its `cite` to the
newly-registered source id — a one-line change, no §B field names change:

```js
// the sidewalk-width row (pushcart types) — set cite to the registered source id:
cite: "sf-sidewalk-width"   // was "dpw-182101"; 10 ft min = 6 ft path + 4 ft cart
```

The three distance rows (75 / 7 / 500 ft) keep `cite: "dpw-182101"`. `sf-sidewalk-width` is
registered in `agents/kb/SOURCES.md` and `docs/CONTRACTS.md §E`, and its source doc is
`agents/kb/sf-sidewalk-width.md`. (The dataset `4g86-grxu` is the compute input, not the cite.)

**2. Function name (Issue 2).** The clearance Function is `check_clearance` (now pinned in
`docs/CONTRACTS.md §B`). Our tool/fixtures/prompt were renamed `clearance_check → check_clearance`
to match, so the go-live `tool_base_url` swap needs no per-tool aliasing.
