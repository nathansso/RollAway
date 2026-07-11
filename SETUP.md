# Person 2 — Agents & Gradient Platform Setup Guide (branch `feat/agents-platform`)

Everything you need to build Rollaway's brain: both Gradient agents, routing, the knowledge
base, guardrails, evaluations, and the cuisine-enrichment pipeline.
Your task list is `PERSON2_AGENTS_TASKS.md`. You sit between two contracts in
`docs/CONTRACTS.md` (on `main`): **§A** (what you return to the frontend) and **§B** (the
Function tools you call). Read both first.

---

## 1. Prerequisites (install these)

| Tool | Version | Install (macOS) | Why |
|---|---|---|---|
| doctl | latest | `brew install doctl` | DO CLI — Gradient + Functions access |
| Node.js | ≥ 20 LTS | `brew install node@20` | fixture tool server + enrichment scripts |
| Python (optional) | ≥ 3.11 | `brew install python` | if you prefer Python for enrichment |
| jq | any | `brew install jq` | sanity-checking JSON everywhere |
| Git | recent | `brew install git` | — |

```bash
doctl auth init          # paste your DO API token
doctl account get        # verify
```

## 2. Accounts & keys you need

| Account | What to get | Where | Notes |
|---|---|---|---|
| **DigitalOcean** | Team invite + **Gradient AI Platform** access | ask Dat | hackathon credits |
| DO API token | Personal access token (write) | DO dashboard → API | for doctl + Gradient API |
| Gradient | Project + model access keys | Gradient console → your project | agent endpoint keys are minted per-agent |

You do NOT need Mapbox, Google Places, or Ticketmaster keys — those are Person 1 / Person 3.

## 3. Get the code

```bash
git clone <repo-url> RollAway
cd RollAway
git checkout feat/agents-platform
mkdir -p agents/{instructions,kb,evals,enrichment,fixtures}
```

`/agents` layout you're building toward:

```
agents/
  instructions/   # system prompts for router, spot_scout, permit_copilot (versioned!)
  kb/             # source docs for the knowledge base (PDFs + your authored checklists)
  evals/          # eval prompt suite + expected behaviors + README
  enrichment/     # cuisine classifier script + output lookup table
  fixtures/       # fixture tool responses (§B examples) for pre-integration dev
```

**Everything you configure in the Gradient console must also live in this repo as text** —
instructions, tool schemas, eval prompts. Console state isn't reviewable or recoverable; the
repo is the source of truth, the console is the deployment.

## 4. Gradient platform setup (console walkthrough)

1. **Project:** Gradient console → create/join the `rollaway` project.
2. **Agents:** create `spot-scout` and `permit-copilot`. Pick a strong function-calling model
   for Spot Scout; Permit Copilot prioritizes grounded RAG + citations.
3. **Routing:** create the routed entry point in front of both agents. Routing rule of thumb:
   location/where/park/traffic/events → `spot-scout`; permit/license/fire/legal/checklist →
   `permit-copilot`. This routed endpoint's URL is what Person 1 calls — **hand it over early,
   even while the agents are dumb.**
4. **Endpoint access key:** mint the agent access key; give Person 1 the endpoint URL + key
   (they'll put it in App Platform env, not in client code — if Gradient requires the key
   client-side, front it with a thin DO Function proxy instead; decide with P1).
5. **Knowledge base:** create the KB, attach it to `permit-copilot` only (see §6).
6. **Function tools:** register the 5 tools + clearance check on `spot-scout`, schemas
   verbatim from `docs/CONTRACTS.md` §B.
7. **Guardrails:** attach sensitive-data anonymization + jailbreak detection to **both** agents.

## 5. Fixture-tool mode — you are NOT blocked on Person 3

Until Person 3's Functions are live, point each registered tool at a stub:

```bash
cd agents/fixtures && node serve.js   # tiny express server, one route per tool,
                                      # each returning its §B example verbatim
```

Deploy the stub as a throwaway DO Function (or ngrok your local server) so Gradient can reach
it. Build and eval both agents fully against fixtures; swap URLs to Person 3's real Functions
when they ship, then rerun the eval suite.

## 6. Knowledge base content (Task 4 — start day 1, ingestion is quick but authoring isn't)

Collect into `agents/kb/`:
- **DPW Order 182,101** — sfpublicworks.org (search "mobile food facilities order"). The core law.
- SF Public Works **Mobile Food Facility permit pages** (process, fees) — save as PDF/markdown.
- Clearance requirements + fee schedules (usually inside/alongside the Order).
- **You author:** four vendor-type checklists (`truck`, `trailer`, `pushcart_cooking`,
  `pushcart_nocook`) as markdown — one ordered step list each, across all four agencies
  (Public Works, Public Health, Fire, Treasurer), with the hidden clocks (30-day notice,
  90-day document window, 15-day appeal) called out per step.

Give every document a stable `source` id (e.g. `dpw-182101`) — these are the citation ids in
§A responses AND the `cite` values Person 3 returns from the clearance check. **Publish the
id list to Person 3 before they hardcode anything.**

## 7. Serverless-inference enrichment (Task 5)

```bash
cd agents/enrichment
# 1. Pull all permits once:
curl "https://data.sfgov.org/resource/rqzj-sfat.json?\$limit=5000" > permits.json
# 2. Batch-classify `fooditems` free text → the §C cuisine enum via Gradient
#    serverless inference. Same instruction prefix every call → enable prompt caching.
# 3. Emit cuisine_lookup.json  { "<permit_id>": "tacos", ... }
```

Hand `cuisine_lookup.json` to Person 3 — their `get_vendors` joins on it. Re-run is manual
and rare (permit data churns slowly); document the command in `agents/enrichment/README.md`.

## 8. Evaluations (Task 7 — your merge gate)

- Author the suite in `agents/evals/` (seed prompts are in `PERSON2_AGENTS_TASKS.md` Task 7).
- Configure it as a Gradient agent evaluation; rerun after **every** instruction change.
- Write `agents/evals/README.md` — one command/click for P1 or P3 to verify nothing regressed
  before an integration merge.

## 9. Who to talk to

| Need | Person |
|---|---|
| When Functions go live, URL per Function, schema pain | **Person 3** |
| Frontend rendering issues with your envelope, streaming decision | **Person 1** |
| Contract changes | edit `docs/CONTRACTS.md`, ping both |

## 10. Done =

`PERSON2_AGENTS_TASKS.md` Definition of Done. Critical path: routed endpoint URL to Person 1
ASAP (even dumb) → Permit Copilot + KB (self-contained, demos alone) → Spot Scout tool wiring
as Person 3's Functions land → evals green.
