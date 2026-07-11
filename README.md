# Rollaway

Rollaway is a **map-first location-intelligence and permit-planning PWA for mobile food vendors in San Francisco**. It ranks legal, low-competition places to set up for a chosen time window, explains the reasoning, and turns the city's four-agency permit maze into a single guided checklist.

The core scoring, hard constraints (setbacks, closures), travel time, and legality are computed **deterministically** in DigitalOcean Functions — never inside an LLM. Language models are used only to phrase explanations and to read menus/forms, always grounded in precomputed signals and cited sources.

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

## Tech stack

**Frontend** (`frontend/`)
- React 19 + TypeScript, built with Vite 8 (Rolldown)
- Tailwind CSS v4 (`@theme` design tokens in `src/index.css`)
- Zustand state machine (no router library; path-based routing in `main.tsx`)
- Mapbox GL JS (code-split so it never ships with the landing page)
- shadcn-style UI primitives under `src/components/ui/` with the `@/` path alias and `src/lib/utils.ts` (`cn`); framer-motion for motion
- `vite-plugin-pwa` (Workbox) for the installable app
- Tooling: Vitest + Testing Library (unit), Playwright (e2e + Mapbox), oxlint, Prettier

**Agents runtime** (`agents/`)
- A dependency-free Node `http` server (`agents/runtime/server.mjs`) on **DigitalOcean Gradient** serverless inference
- Routes: `GET /`, `POST /chat`, `POST /spot_scout`, `POST /permit_copilot`, `POST /menu_extract`, `POST /menu_overlap`, `POST /form_fill`, `GET /form_pdf`
- Menu-RAG extraction/overlap and grounded form-fill; a §A response envelope validated by evals

**Serverless data & scoring** (`functions/`)
- Seven DigitalOcean Functions: `recommend_spots`, `get_vendors`, `get_closures`, `get_events`, `get_foot_traffic`, `get_restaurants`, `check_clearance`
- `recommend_spots` is the orchestrator: base signals → deterministic ranking/legality/travel → Spot Scout explanation
- `functions/scripts/local_gateway.mjs` is a CORS proxy for local live testing

**External data sources**
- SF open data (DataSF / Socrata), Bay Wheels (foot-traffic proxy), Google Places & Street View, Ticketmaster (events), Mapbox (tiles + Matrix travel times), DigitalOcean Gradient (inference)

---

## Repository layout

```text
frontend/    React 19 + Vite PWA (the app at /app, marketing landing at /)
functions/   DigitalOcean Functions (recommend_spots + six signal functions) + local gateway
agents/      Gradient runtime (spot scout, permit copilot, menu RAG, form fill) + evals + KB
docs/        ARCHITECTURE.md, CONTRACTS.md, and implementation notes
.do/         DigitalOcean App Platform frontend spec
ISSUE.md     Issue-resolution workflow for collaborators/agents
```

---

## Architecture

```text
React PWA (frontend/)
  |-- POST VITE_RECOMMEND_SPOTS_URL --> recommend_spots Function
  |                                      |-- base signal Functions (vendors, closures, foot traffic, ...)
  |                                      |-- POST MENU_RAG_URL --> agents /menu_overlap
  |                                      `-- POST SPOT_SCOUT_URL --> agents /spot_scout
  |-- GET  VITE_VENDORS_URL ----------> get_vendors Function
  |-- GET  VITE_CLOSURES_URL ---------> get_closures Function
  |-- POST VITE_PERMIT_CHECKLIST_URL -> agents /permit_copilot
  `-- POST VITE_MENU_EXTRACT_URL -----> agents /menu_extract
```

The frontend normalizes every backend envelope in `frontend/src/lib/apiClient.ts`, and re-derives display verdicts by relative quality in `frontend/src/lib/recommendations.ts`. See `docs/ARCHITECTURE.md` and `docs/CONTRACTS.md` for the pinned request/response shapes.

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

### Live mode (full local stack)

Point the frontend at the local gateway, which proxies to the deployed Functions and a local agents runtime. See `RUN-LOCAL-LIVE.md` for the full walkthrough.

```bash
# 1. Agents runtime (Gradient inference) on :8080
GRADIENT_API_KEY=<model key> TOOL_BASE_URL=http://localhost:8787 node agents/runtime/server.mjs

# 2. CORS gateway on :8090 (proxies Functions + runtime)
node functions/scripts/local_gateway.mjs

# 3. frontend/.env.local
#    VITE_USE_FIXTURES=false
#    VITE_RECOMMEND_SPOTS_URL=http://localhost:8090/recommend_spots
#    VITE_VENDORS_URL=http://localhost:8090/get_vendors
#    VITE_CLOSURES_URL=http://localhost:8090/get_closures
#    VITE_PERMIT_CHECKLIST_URL=http://localhost:8090/permit_copilot
#    VITE_MENU_EXTRACT_URL=http://localhost:8090/menu_extract
cd frontend && npm run dev
```

Deploying for real? See `functions/DEPLOY.md`, `agents/RUNBOOK.md`, and `DEPLOY-recommend_spots-handoff.md`. Do not disable fixture mode until the live URLs are populated — missing endpoints surface recoverable configuration errors rather than passing fixtures off as live data.

---

## Environment variables

**Frontend** (`frontend/.env.local`, build-time — Vite embeds these; see `frontend/.env.example`)

| Variable | Purpose |
| --- | --- |
| `VITE_MAPBOX_TOKEN` | Public Mapbox token (`pk.*`). Blank ⇒ schematic map. Restrict to your origins. |
| `VITE_USE_FIXTURES` | `true` = bundled data, no business-API calls. `false` = live endpoints below. |
| `VITE_FIXTURE_DELAY_MS` | Artificial fixture latency (demonstrates the loader). |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | Browser key for Street View + Places (New). HTTP-referrer restricted; never the server key. |
| `VITE_RECOMMEND_SPOTS_URL` / `VITE_VENDORS_URL` / `VITE_CLOSURES_URL` / `VITE_PERMIT_CHECKLIST_URL` / `VITE_MENU_EXTRACT_URL` | Live endpoints used only when fixtures are off. |

**Backend** (agents runtime / Functions — never committed)

| Variable | Purpose |
| --- | --- |
| `GRADIENT_API_KEY` / DO model access keys | Gradient serverless inference. |
| `TOOL_BASE_URL` | Agent runtime tool base (default `http://localhost:8787`). |
| `SOCRATA_APP_TOKEN` | SF open data (DataSF). |
| `GOOGLE_PLACES_KEY` / `GOOGLE_MAPS_SERVER_KEY` | Server-side Places / Routes / Geocoding. |
| `TICKETMASTER_KEY` | Event opportunities. |
| `MAPBOX_TOKEN` | Server-side Matrix API for live travel times. |
| `FUNCTIONS_BASE_URL` / `SPOT_SCOUT_URL` / `MENU_RAG_URL` | Wiring for `recommend_spots`. |

---

## Development & testing

All commands run from `frontend/`:

```bash
npm run dev         # Vite dev server (HMR)
npm run build       # tsc -b && vite build
npm run lint        # oxlint
npm test            # Vitest unit suite (fixture mode pinned via vitest.config.ts)
npm run test:e2e    # Playwright end-to-end (project: mobile-chromium)
npm run test:mapbox # Playwright Mapbox-specific suite
npm run test:pwa    # build + offline PWA test
```

Function suites live beside each function (e.g. `functions/packages/rollaway/recommend_spots && npm test`); agent evals run via `node agents/evals/run.mjs`. Conventions for picking up GitHub issues are in `ISSUE.md`.

---

## UI & design notes

- **Brand tokens** (`frontend/src/index.css`): warm cream background (`#fff7ed`), burnt/vibrant orange primaries (`#c2410c` / `#f97316`), slate foreground, sharp 6px radii, hairline cards, Inter type.
- **Landing page** — a subtle `FallingPattern` (framer-motion) hero backdrop in the brand orange/cream, masked so headline copy stays readable; Mapbox stays code-split off `/`.
- **Map** — the base map uses Mapbox `light-v11` warmed toward the brand palette on load; vendor dots and closure overlays are tuned for contrast on the cream base.
- **Map controls** — a minimized search box (clock-collapsed time with quick presets, a single live-location/address bar) and a spot detail sheet centered in the viewport with its primary content above the fold.

---

## Status

All three layers — frontend, Functions, and agents runtime — are integrated on `main`, with unit, e2e, Mapbox, and offline-PWA coverage plus agent evals. The checked-in default is demo-safe: `VITE_USE_FIXTURES=true`, so the app is code-connected to the backend contracts but calls no deployed service until endpoints are configured and fixtures are disabled.
