# Rollaway

Rollaway is a map-first location intelligence and permit-planning PWA for mobile food vendors in San Francisco. It combines deterministic location scoring, DigitalOcean Functions, and Gradient AI explanations without putting legal or scoring calculations inside an LLM.

## Status

All three feature layers are integrated on `main`:

- `frontend/`: React 19, TypeScript, Mapbox, Zustand, installable PWA
- `functions/`: seven DigitalOcean Functions, including `recommend_spots`
- `agents/`: direct Spot Scout, Permit Copilot, and Menu RAG endpoints

The merged contracts are covered by frontend adapter tests, Functions integration tests, 24 agent evaluations, browser flows, Mapbox tests, and an offline PWA test.

The checked-in deployment remains demo-safe by default: `VITE_USE_FIXTURES=true` and the live endpoint values in `.do/app.yaml` are empty. This means the frontend is code-connected to the backend contracts but will not call deployed backend services until the URLs are configured and fixture mode is disabled.

## Architecture

```text
React PWA
  |-- POST VITE_RECOMMEND_SPOTS_URL --> recommend_spots Function
  |                                      |-- base signal Functions
  |                                      |-- POST MENU_RAG_URL --> /menu_overlap
  |                                      `-- POST SPOT_SCOUT_URL --> /spot_scout
  |-- GET  VITE_VENDORS_URL ----------> get_vendors Function
  |-- GET  VITE_CLOSURES_URL ---------> get_closures Function
  `-- POST VITE_PERMIT_CHECKLIST_URL -> /permit_copilot
```

`recommend_spots` computes ranking, hard constraints, travel, and legality deterministically. Spot Scout writes one-line explanations from precomputed signals. Permit Copilot returns a cited checklist. The frontend normalizes these backend envelopes at `frontend/src/lib/apiClient.ts`.

## Run locally in fixture mode

Fixture mode exercises the complete UI without backend credentials or Rollaway API calls.

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

`VITE_MAPBOX_TOKEN` is optional. Without it, the app uses the schematic SF map.

## Connect the live backend

1. Deploy the Functions using `functions/DEPLOY.md`.
2. Run the agent runtime or deploy its direct endpoints using `agents/RUNBOOK.md`.
3. Configure the `recommend_spots` Function:
   - `FUNCTIONS_BASE_URL`: deployed Functions namespace base URL
   - `SPOT_SCOUT_URL`: agent runtime `/spot_scout` URL
   - `MENU_RAG_URL`: agent runtime `/menu_overlap` URL
   - `MAPBOX_TOKEN`: Matrix API token for live travel times
4. Configure the frontend build-time variables:
   - `VITE_RECOMMEND_SPOTS_URL`: deployed `recommend_spots` URL
   - `VITE_VENDORS_URL`: deployed `get_vendors` URL
   - `VITE_CLOSURES_URL`: deployed `get_closures` URL
   - `VITE_PERMIT_CHECKLIST_URL`: agent runtime `/permit_copilot` URL
   - `VITE_USE_FIXTURES=false`
5. Rebuild/redeploy the frontend. Vite embeds these values at build time.

Do not disable fixture mode until all four frontend URLs are populated. Missing live endpoints produce recoverable configuration errors rather than silently presenting fixtures as live data.

## Verification

```bash
# Frontend
cd frontend
npm ci
npm test
npm run lint
npm run build
npm run test:e2e
npm run test:mapbox
npm run test:pwa

# Functions
cd ../functions/packages/rollaway/check_clearance && npm test
cd ../get_restaurants && npm test
cd ../recommend_spots && npm test
cd ../../../..
node functions/scripts/prewarm.mjs

# Agents
node agents/evals/run.mjs
```

Current verified totals:

- Frontend unit tests: 63 passed
- Frontend browser tests: 7 map flows, 1 Mapbox flow, 1 PWA flow passed
- `recommend_spots`: 13 passed
- Clearance geometry: 15 passed
- Restaurant signals: 18 passed
- Agent evaluation gate: 24/24 passed
- Functions prewarm: 7/7 passed

## Repository layout

```text
frontend/   Map-first PWA, fixtures, API adapters, and browser tests
functions/  Data Functions, deterministic scoring, snapshots, and prewarm scripts
agents/     Gradient runtime, Menu RAG, permit knowledge base, and evaluations
docs/       Shared architecture and contract documentation
.do/        DigitalOcean App Platform frontend specification
```

See `frontend/DEPLOY.md`, `functions/DEPLOY.md`, and `agents/RUNBOOK.md` for deployment details. Secrets belong only in ignored local environment files or DigitalOcean environment settings.
