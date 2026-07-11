# `/agents` — Rollaway's brain (Person 2)

Both Gradient agents, the router in front of them, the knowledge base, guardrails, evaluations,
and the serverless-inference enrichment. This is the bridge between Person 1's `/chat` calls
(the §A envelope) and Person 3's Functions (the §B tool schemas). **The repo is the source of
truth; the Gradient console is only the deployment** — everything configurable in the console
also lives here as reviewable text.

## Layout

```
agents/
  DECISIONS.md              # every assumption made while building this layer
  RUNBOOK.md                # click-by-click Gradient deploy (human/credential step)
  README.md                 # this file
  instructions/             # versioned system prompts + guardrail config
    router.md               # classify inbound message -> spot_scout | permit_copilot (keyword lists)
    output_envelope.md      # the shared §A envelope BOTH agents import (map_actions | checklist)
    spot_scout.md           # location agent: 5 tools + clearance check (§B verbatim), no-math rule
    permit_copilot.md       # permit agent: grounded in KB, cites SOURCES ids, §D checklist
    guardrails.md           # anonymization + jailbreak spec (attach to BOTH agents)
    guardrails.config.json  # machine-readable PII types, jailbreak patterns, refusal copy
  kb/                       # knowledge base (attach to permit_copilot only)
    SOURCES.md              # authoritative citation id list (in sync with docs/CONTRACTS.md §E)
    dpw-182101.md           # core law: 75/7/500 ft clearance rules (contract-pinned)
    clearance-rules.md      # clearance + fee quick-reference
    sfpw-mff-permit.md      # Public Works permit process + fees + the 30/90/15-day clocks
    sfdph-mff.md            # Public Health permit (cooking vs no-cook tiers)
    sffd-permit.md          # Fire permit (cooking/LPG only)
    ttx-cert.md             # Treasurer business registration (all vendors)
    ca-dmv.md               # DMV registration (trucks/trailers only)
    truck.md trailer.md pushcart_cooking.md pushcart_nocook.md   # authored §D checklists (md + json)
  enrichment/               # cuisine classifier (serverless inference, prompt-cached)
    classify.mjs            # live (GRADIENT_API_KEY) or deterministic --mock
    cuisine_lookup.json     # { permit_id: cuisine } -> Person 3's get_vendors joins on it
    permits.json            # pulled SF dataset (rqzj-sfat)
    README.md
  fixtures/                 # local tool server returning §B examples verbatim (stub-first)
    serve.js payloads.mjs tool-schemas.json package.json README.md
  evals/                    # the acceptance gate
    seeds.json              # fixed prompt suite (5 required + 3 coverage)
    run.mjs                 # node run.mjs --offline (gate) | --live (deployed endpoint)
    lib/                    # route.mjs, guardrails.mjs, schema.mjs, util.mjs
    README.md
  scripts/
    provision.sh            # best-effort doctl provisioning (guarded) + console pointers
    verify.sh               # runs all of §5 in one shot (fixtures + enrichment + evals + greps)
```

## Fast path

```bash
# 1. fixtures up (stub tools)
cd agents/fixtures && npm install && node serve.js        # :8787

# 2. enrichment sample (no creds needed)
cd agents/enrichment && node classify.mjs --mock          # -> cuisine_lookup.json

# 3. the gate
cd agents/evals && node run.mjs --offline                 # must be GREEN

# or all of the above at once:
bash agents/scripts/verify.sh
```

## Contracts this layer meets

- **§A** `/chat` envelope → `instructions/output_envelope.md` (Person 1 renders it).
- **§B** Function tool schemas → `fixtures/tool-schemas.json` + `spot_scout.md` (Person 3 implements).
- **§C** cuisine enum → `enrichment/` (Person 2 owns it).
- **§D** checklist → the four `kb/*.md` vendor-type docs + `permit_copilot.md`.
- **§E** source ids → `kb/SOURCES.md` (Person 3 returns these as `cite`).

Deploy = `RUNBOOK.md`. Assumptions = `DECISIONS.md`.
