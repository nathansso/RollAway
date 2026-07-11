# Rollaway 🌮🚚

### Get your business rolling.

Rollaway is an AI copilot that helps mobile food vendors in San Francisco survive and grow — answering the two questions that decide whether they make it: **where should I set up to find customers**, and **how do I get legal without losing months**.

Built for the DigitalOcean Hackathon on the **Gradient AI Platform**.

**Status:** all three tiers implemented and merged to `main`. Frontend build + lint clean (25/25 end-to-end browser checks); Person 3 clearance geometry 14/14 tests; Person 2 agent eval gate 18/18 GREEN.

---

## The three pillars

1. **Find the best spot** — score a location on hard constraints (closures, claimed spots, clearance rules) + demand signals (foot-traffic proxy, restaurant saturation).
2. **Get permits in order** — a personalized, ordered checklist across all four SF agencies, grounded in city rules with citations.
3. **Work events (growth)** — live event + closure listings so vendors position for crowds.

---

## Current infrastructure

Everything runs on DigitalOcean with the **Gradient AI Platform** as the spine. The browser never calls an external API directly — it only speaks to one routed Gradient endpoint.

```
  ┌──────────────────────────────────────────────────────────────┐
  │  FRONTEND  ·  /frontend                                        │
  │  Vite + React 19 + TypeScript · Tailwind v4 · mapbox-gl        │
  │  Installable PWA (service worker) · fixture-first, one API call│
  │  Deploy: DigitalOcean App Platform (static site, .do/app.yaml) │
  └───────────────────────────────┬──────────────────────────────┘
                                  │  POST /chat   (single routed entry point)
                                  ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  GRADIENT PLATFORM  ·  /agents                                 │
  │  Router ─► Spot Scout      (function calling → DO Functions)   │
  │        └─► Permit Copilot  (RAG over the knowledge base)       │
  │  Guardrails: PII anonymization + jailbreak detection           │
  │  Serverless inference: cuisine-classification enrichment       │
  │  Evaluations: 18-check offline acceptance gate                 │
  └───────────────┬───────────────────────────────┬──────────────┘
                  │ function calling              │ retrieval
                  ▼                               ▼
  ┌──────────────────────────────┐   ┌──────────────────────────────┐
  │ DO FUNCTIONS · /functions    │   │ KNOWLEDGE BASE · /agents/kb   │
  │  get_vendors                 │   │  DPW Order 182,101            │
  │  get_closures                │   │  clearance + sidewalk rules   │
  │  get_foot_traffic            │   │  4 agency docs (PW/DPH/Fire/  │
  │  get_restaurants             │   │  Treasurer) + DMV             │
  │  get_events                  │   │  4 vendor-type checklists     │
  │  check_clearance (geometry)  │   │  (truck/trailer/2× pushcart)  │
  └──────────────┬───────────────┘   └──────────────────────────────┘
                 ▼
   SF Open Data (Socrata) · Bay Wheels GBFS + trip history ·
   Google Places · SFMTA event closures · Ticketmaster
```

**Design invariant:** the legality math never runs inside the LLM. Clearance distances (75 ft from restaurants, 500 ft from schools, 7 ft from hydrants, sidewalk width) are computed as real geodesic geometry in `check_clearance` (turf.js); the agent only decides *when* to call it and *explains* the result.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data flow and [`docs/CONTRACTS.md`](docs/CONTRACTS.md) for the frozen interface between tiers.

---

## Repo layout (as built)

```
/frontend    Person 1 — Vite/React PWA + Mapbox
             src/components/{map,chat,spot,permits,shell}, zustand store,
             fixture-first chatClient, contract types. .do/app.yaml + DEPLOY.md.

/agents      Person 2 — Gradient config as reviewable text
             instructions/  router, spot_scout, permit_copilot, guardrails, output envelope
             kb/            13 grounding docs (DPW 182,101, agency docs, vendor checklists)
             enrichment/    prompt-cached cuisine classifier + cuisine_lookup.json
             evals/         18-check acceptance gate (offline + live replay)
             fixtures/      Express stub server returning §B payloads verbatim
             scripts/       provision.sh, verify.sh

/functions   Person 3 — DigitalOcean serverless (nodejs:18), one dir per tool
             packages/rollaway/{get_vendors,get_closures,get_foot_traffic,
                                get_restaurants,get_events,check_clearance}
             scripts/       aggregate_baywheels, fetch_static_data, invoke_local, sync_shared
             project.yml    deploy spec

/docs        shared contracts + architecture (the frozen inter-tier interface)
```

---

## Data sources

| Source | ID / feed | Used by |
|---|---|---|
| SF Mobile Food Facility Permit | `rqzj-sfat` | get_vendors |
| SF Mobile Food Schedule | `jjew-r69b` | get_vendors |
| SF Temporary Street Closures | `8x25-yybr` | get_closures |
| SFMTA event closure list | bundled/auto-fetched | get_closures |
| Bay Wheels (Lyft) | live GBFS + trip history aggregate | get_foot_traffic |
| Google Places | Places API | get_restaurants, check_clearance |
| Ticketmaster Discovery | Discovery API | get_events |
| SF schools / fire hydrants / sidewalks | bundled GeoJSON snapshots | check_clearance |
| SF Public Works rules, DPW Order 182,101 | KB docs | Permit Copilot |

Secrets (Google Places, Ticketmaster, Socrata token, DigitalOcean model access) live in **git-ignored** `.env` / DO Function config — never in the repo. Each tier's `SETUP-*.md` says exactly where.

---

## Run it locally

**Frontend** (works standalone in fixture mode — no backend or keys except a Mapbox token):
```bash
cd frontend
cp .env.example .env.local          # set VITE_MAPBOX_TOKEN
npm ci && npm run dev               # http://localhost:5173
```

**Functions** (one clearance example; needs doctl serverless or node):
```bash
cd functions/packages/rollaway/check_clearance
npm ci && npm test                  # 14/14 geodesic clearance tests
```

**Agents** (offline acceptance gate — no cloud calls):
```bash
cd agents/evals
npm ci && node run.mjs              # 18/18 checks GREEN
```

To go live end-to-end: deploy the frontend per `frontend/DEPLOY.md`, deploy Functions with `doctl serverless deploy`, provision the Gradient agents with `agents/scripts/provision.sh`, then set `VITE_CHAT_ENDPOINT` + `VITE_USE_FIXTURES=false` in App Platform.

---

## Team split (by layer)

| Owner | Scope | Docs |
|---|---|---|
| **Person 1 — Frontend** | PWA, Mapbox map, chat UI, spot-detail + permit-checklist panels, App Platform deploy | `PERSON1_FRONTEND_TASKS.md`, `SETUP-frontend.md` |
| **Person 2 — Agents & Platform** | Both Gradient agents, routing, knowledge base, guardrails, evals, cuisine enrichment | `PERSON2_AGENTS_TASKS.md`, `SETUP-agents-platform.md` |
| **Person 3 — Functions & Data** | The 5 DO Functions + clearance geometry, all external data integrations | `PERSON3_FUNCTIONS_TASKS.md`, `SETUP-functions-data.md` |

The three tiers integrate through the frozen JSON schemas in [`docs/CONTRACTS.md`](docs/CONTRACTS.md): every Function's I/O, the `/chat` request/response envelope, the cuisine enum, and the permit-checklist shape.
