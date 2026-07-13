# Rollaway

Rollaway is a **map-first location-intelligence and permit-planning PWA for mobile food vendors — built exclusively for San Francisco**. It ranks legal, low-competition places to set up for a chosen time window, explains the reasoning, and turns the city's four-agency permit maze into a single guided checklist.

The core scoring, hard constraints (setbacks, closures), travel time, and legality are computed **deterministically in code — never inside an LLM**. Language models are used only to phrase explanations and to read menus/forms, always grounded in precomputed signals and cited sources.

---

## Bound to San Francisco, on purpose

Rollaway is not a multi-city platform with an SF skin — the city is baked into every layer, and that locality is where the correctness comes from:

- **The law is SF law.** Setback rules (75 ft from restaurant entrances, 500 ft from schools, hydrant clearance, sidewalk width) are encoded from **SF Public Works Order 182101** and related city rules, and every legality check cites its source document (`agents/kb/dpw-182101.md` and friends).
- **The permit maze is SF's, agency by agency.** The Permit Copilot walks the real four-agency flow — **SF Public Works** (Mobile Food Facility permit), **SF Dept. of Public Health**, **SF Fire Department**, and the **SF Treasurer & Tax Collector** (business registration) — with the actual agency forms, fees, and ordering constraints.
- **The data feeds are city feeds.** Vendor permits and competition come from **DataSF** (Socrata), street/event closures from **SFMTA**, foot traffic from a full year of **Bay Wheels** trip history aggregated per station/day-of-week/hour, and events from venue listings inside city limits.
- **The geography is assumed.** Candidate spots, travel estimates, the schematic fallback map, even the demo fixtures — all San Francisco. There is no city switch.

Porting Rollaway elsewhere would mean re-encoding another city's vending ordinances, permit agencies, and open-data feeds — by design, the app would rather be exactly right about one city than vaguely right about many.

---

## What it does

- **Map-first recommendations** — pick a time window and starting point; get ranked "good / check / avoid" setup blocks with the foot-traffic, competition, legality, and closure reasons behind each score.
- **A populated map, focused results** — a wider candidate pool renders as pins while only the top 3 get tray tiles; every pin opens a full detail sheet.
- **Compact search box** — the time defaults to *now* behind a clock icon, a single location bar defaults to live location (or search an address), and the whole box minimizes to a summary pill after a search.
- **Spot detail sheet** — a centered card with the verdict, a one-line why, a Navigate CTA, Street View, and grounded facts (foot traffic, competition, parking, permit placement, legality, closures, travel).
- **Permit Copilot** — a cited, ordered checklist across the four SF agencies, with fillable/verified agency PDFs and a simulated EasyApply packet.
- **Sign-up & menu ingestion** — profile capture plus Gradient-backed menu extraction from text, links, images, or PDFs.
- **Installable PWA** — offline shell, schematic-map fallback when Mapbox is unavailable, and a marketing landing page (`/`) that never loads Mapbox.

---

## Production stack

Four managed pieces, each doing the one thing it's good at:

| Layer | Runs on | What it does |
| --- | --- | --- |
| **Frontend** | **Railway** (Caddy container) | Vite/React PWA. Endpoint URLs come from a runtime `/config.json` written from env vars at container start — repointing the backend is a restart, not a rebuild. |
| **Agents backend** | **Railway** (FastAPI) | Spot Scout, Permit Copilot, menu extract/overlap, grounded form-fill, verified PDF proxy, plus an `/api/*` gateway in front of the Functions. Python port of the original Node runtime; same §A envelope, guardrails, and citation rules, pinned by the eval suite. |
| **Data** | **Supabase** (Postgres) | pgvector knowledge base (rule docs, HNSW cosine index) for semantic retrieval; `station_hourly` — one year of Bay Wheels trips folded to per-station/day-of-week/hour averages — read live by `get_foot_traffic`; user profiles/menus with row-level security. |
| **Signals & scoring** | **DigitalOcean Functions** | Seven functions: `recommend_spots` (the deterministic orchestrator: base signals → ranking/legality/travel → one Spot Scout call for prose) plus `get_vendors`, `get_closures`, `get_events`, `get_foot_traffic`, `get_restaurants`, `check_clearance`. |
| **Inference** | **DigitalOcean Gradient** | `anthropic-claude-haiku-4.5` for chat, `bge-m3` (1024-dim) for embeddings. The only place an LLM runs — and it never does math or law. |

```text
React PWA (Railway / Caddy)          reads /config.json at boot (runtime env)
  |-- POST /api/recommend_spots --> FastAPI backend (Railway)
  |-- GET  /api/vendors            |-- gateway --> DO Function recommend_spots
  |-- GET  /api/closures           |                 |-- six signal Functions
  |-- POST /permit_copilot         |                 |-- get_foot_traffic --> Supabase station_hourly
  |-- POST /menu_extract           |                 `-- POST back to FastAPI /spot_scout (why-lines)
  `-- GET  /form_pdf               |-- pgvector KB retrieval --> Supabase
                                   `-- chat + embeddings --> DO Gradient inference
```

The frontend normalizes every backend envelope in `frontend/src/lib/apiClient.ts` and re-derives display verdicts by relative quality in `frontend/src/lib/recommendations.ts`. Pinned request/response shapes live in `docs/ARCHITECTURE.md` and `docs/CONTRACTS.md`; the migration itself is documented in `docs/MIGRATION-PLAN.md` and the cutover runbook `docs/DEPLOY-RAILWAY-SUPABASE.md`.

---

## Repository layout

```text
frontend/    React 19 + Vite PWA (app at /app, landing at /) + Dockerfile.railway/Caddyfile
backend/     FastAPI agents backend (Railway) — app code, tests, KB ingest script
supabase/    SQL migrations (pgvector KB, Bay Wheels, users/RLS) + Bay Wheels import script
functions/   DigitalOcean Functions (recommend_spots + six signal functions) + local gateway
agents/      Instructions, knowledge base, menu-RAG corpora, and the eval suite
docs/        ARCHITECTURE.md, CONTRACTS.md, MIGRATION-PLAN.md, deploy runbook
ISSUE.md     Issue-resolution workflow for collaborators/agents
```

---

## Getting started

### Fixture mode (no credentials)

Fixture mode exercises the entire UI with bundled deterministic data and makes no business-API calls.

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev            # http://localhost:5173  (landing at /, app at /app)
```

`VITE_MAPBOX_TOKEN` is optional — without it the app falls back to the schematic SF map.

### Live mode (local frontend, real backend)

```bash
# 1. FastAPI backend on :8000 (see backend/README.md)
cd backend && pip install -r requirements.txt
GRADIENT_API_KEY=<model key> uvicorn app.main:app --port 8000

# 2. frontend/.env.local
#    VITE_USE_FIXTURES=false
#    VITE_RECOMMEND_SPOTS_URL=http://localhost:8000/api/recommend_spots
#    VITE_VENDORS_URL=http://localhost:8000/api/vendors
#    VITE_CLOSURES_URL=http://localhost:8000/api/closures
#    VITE_PERMIT_CHECKLIST_URL=http://localhost:8000/permit_copilot
#    VITE_MENU_EXTRACT_URL=http://localhost:8000/menu_extract
cd frontend && npm run dev
```

Deploying for real? `docs/DEPLOY-RAILWAY-SUPABASE.md` is the runbook (Railway services, Supabase migrations, data loads, DO Functions redeploy). Do not disable fixture mode until live URLs are populated — missing endpoints surface recoverable configuration errors rather than passing fixtures off as live data.

---

## Environment variables

**Frontend — runtime** (Railway service vars, written to `/config.json` at container start; change = restart, no rebuild)

| Variable | Purpose |
| --- | --- |
| `RECOMMEND_SPOTS_URL` / `VENDORS_URL` / `CLOSURES_URL` | Recommendation + map seed endpoints. |
| `PERMIT_CHECKLIST_URL` / `MENU_EXTRACT_URL` / `FORM_PDF_URL` | Permit Copilot, menu ingestion, verified PDF proxy. |

**Frontend — build-time** (Vite embeds these; local `.env.local` or Railway build args)

| Variable | Purpose |
| --- | --- |
| `VITE_MAPBOX_TOKEN` | Public Mapbox token (`pk.*`). Blank ⇒ schematic map. Restrict to your origins. |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | Browser key for Street View + Places (New). HTTP-referrer restricted; never the server key. |
| `VITE_USE_FIXTURES` / `VITE_FIXTURE_DELAY_MS` | Fixture mode toggle + artificial latency. |
| `VITE_*_URL` fallbacks | Used only when `/config.json` is absent (local dev). |

**Backend (FastAPI on Railway)**

| Variable | Purpose |
| --- | --- |
| `GRADIENT_API_KEY` | DO Gradient inference (chat + embeddings). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | pgvector KB retrieval + menu persistence. |
| `FUNCTIONS_BASE_URL` | DO Functions namespace base for the `/api/*` gateway. |
| `CORS_ORIGIN` | The Railway frontend origin. |

**Functions (`functions/.env`, substituted into `project.yml` at deploy)**

| Variable | Purpose |
| --- | --- |
| `SOCRATA_APP_TOKEN` | DataSF open data. |
| `GOOGLE_PLACES_KEY` / `GOOGLE_MAPS_SERVER_KEY` | Server-side Places / Distance Matrix / Geocoding. |
| `TICKETMASTER_KEY` | Event opportunities. |
| `MAPBOX_TOKEN` | Server-side Matrix API for live travel times. |
| `SPOT_SCOUT_URL` / `MENU_RAG_URL` / `FUNCTIONS_BASE_URL` | Wiring from `recommend_spots` to the FastAPI backend. |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | `get_foot_traffic` reads `station_hourly` live (empty ⇒ bundled snapshot). |

---

## Development & testing

```bash
# frontend/
npm run dev         # Vite dev server (HMR)
npm run build       # tsc -b && vite build
npm run lint        # oxlint
npm test            # Vitest unit suite
npm run test:e2e    # Playwright end-to-end (mobile-chromium)
npm run test:mapbox # Playwright Mapbox-specific suite
npm run test:pwa    # build + offline PWA test

# backend/
python -m pytest    # FastAPI agents backend suite

# agents evals — the release gate
node agents/evals/run.mjs           # offline, fixture-grounded
node agents/evals/run.mjs --live    # replays every seed against a live backend
```

The `--live` eval gate pins the §A response envelope, guardrails (jailbreak refusal, PII handling), and §E citation behavior against real Gradient inference — it must be GREEN before any cutover. Function suites live beside each function (e.g. `functions/packages/rollaway/recommend_spots && npm test`). Conventions for picking up GitHub issues are in `ISSUE.md`.

---

## UI & design notes

- **Brand tokens** (`frontend/src/index.css`): warm cream background (`#fff7ed`), burnt/vibrant orange primaries (`#c2410c` / `#f97316`), slate foreground, sharp 6px radii, hairline cards, Inter type.
- **Landing page** — a subtle `FallingPattern` (framer-motion) hero backdrop in the brand orange/cream, masked so headline copy stays readable; Mapbox stays code-split off `/`.
- **Map** — the base map uses Mapbox `light-v11` warmed toward the brand palette on load; vendor dots and closure overlays are tuned for contrast on the cream base.
- **Map controls** — a minimized search box (clock-collapsed time with quick presets, a single live-location/address bar) and a spot detail sheet centered in the viewport with its primary content above the fold.

---

## Status

Deployed and verified in production: frontend and FastAPI backend on Railway, Supabase carrying the pgvector KB and a full year of Bay Wheels foot-traffic aggregates (2025-07 → 2026-06), all seven DO Functions repointed at the new backend. The live eval gate is GREEN against production, and the full user flow — landing → onboarding (real Gradient menu extraction) → map with ranked spots and LLM why-lines — passes a browser smoke test with zero console errors. The checked-in default remains demo-safe (`VITE_USE_FIXTURES=true`), so a fresh clone calls no deployed service until endpoints are configured.
