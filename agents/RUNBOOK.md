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
DIGITALOCEAN_ACCESS_TOKEN=... agents/scripts/provision.sh
```

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
