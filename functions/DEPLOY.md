# Deploying the Rollaway Functions

Everything is deploy-ready; only steps that need **your** accounts remain.
No deploy was attempted from CI/agents (no doctl credentials present).

## 0. One-time setup
```bash
doctl auth init                 # paste your DO API token
doctl serverless install        # if not already installed
doctl serverless connect        # connect to the team namespace
doctl serverless status         # verify
```

## 1. Secrets
```bash
cp functions/.env.example functions/.env
# fill in: SOCRATA_APP_TOKEN (recommended), GOOGLE_PLACES_KEY,
# TICKETMASTER_KEY, SFMTA_EVENTS_URL (optional — leave empty for bundled sample),
# MAPBOX_TOKEN (recommend_spots travel — live routing), and the orchestrator
# vars DEMO_DATA_MODE / FUNCTIONS_BASE_URL / SPOT_SCOUT_URL / MENU_RAG_URL.
```
Every variable listed in `.env.example` must EXIST in `functions/.env` (empty is
fine) because `project.yml` references them. Missing keys don't break functions —
they fall back to the documented fixtures (`TODO(real-key)` markers) or estimates.

## 1b. Demo-reliability build (DEMO_DATA_MODE + snapshots)
Every Function honors `DEMO_DATA_MODE`: **on** (`1`/`true`/`on`) it reads a frozen
snapshot from `demo_data/` (deterministic, fully offline); **off** it hits live
APIs and a transient miss fail-fast-degrades to the same snapshot in ~2.5s.

```bash
# 1. Freeze the demo snapshots off functions/demo_data/scenario.json
#    (calls each Function's live path for the 3 candidate points + Mapbox matrix,
#     writes demo_data/<fn>.<snapshotKey>.json, then syncs per-function copies).
node functions/scripts/freeze_snapshots.mjs

# 2. REQUIRED predeploy step: propagate shared.js + demo_data/ into each function
#    dir (DO bundles each dir independently; the per-function copies are gitignored).
node functions/scripts/sync_shared.js

# 3. Deploy with the demo build ON so stage runs offline+deterministic:
#    set DEMO_DATA_MODE=1 in functions/.env before deploying.
```
Snapshots contain only public data (no tokens). Re-run the freeze to refresh the
scenario; it is idempotent modulo live-data drift (canonical/sorted JSON).

## 2. Deploy
```bash
cd functions
doctl serverless deploy .
```
The remote build runs `npm install` per function (only `check_clearance` has
dependencies — the four turf packages).

## 3. Smoke test each function
```bash
doctl serverless functions invoke rollaway/get_vendors      -p lat:37.78 -p lng:-122.40 -p radius_m:500 -p day:fri -p time:12:00
doctl serverless functions invoke rollaway/get_closures     -p lat:37.78 -p lng:-122.40 -p radius_m:800
doctl serverless functions invoke rollaway/get_foot_traffic -p lat:37.78 -p lng:-122.40 -p radius_m:400 -p day:fri -p hour:12
doctl serverless functions invoke rollaway/get_restaurants  -p lat:37.78 -p lng:-122.40 -p radius_m:300
doctl serverless functions invoke rollaway/get_events       -p lat:37.78 -p lng:-122.40 -p radius_m:3000
doctl serverless functions invoke rollaway/check_clearance  -p lat:37.78 -p lng:-122.40 -p vendor_type:truck
# recommend_spots takes a JSON body (user_profile/when/location) — invoke via the
# web URL (curl) or locally with invoke_local; see below.
```

### Prewarm before presenting (no cold starts on stage)
```bash
# Deployed: set FUNCTIONS_BASE_URL to the rollaway namespace base, then:
FUNCTIONS_BASE_URL=<base> node functions/scripts/prewarm.mjs
# Local (pre-deploy): just run it — pings all 7 Functions on the demo scenario,
# reports agent/KB readiness, exits non-zero if any Function errors.
node functions/scripts/prewarm.mjs
```

## 4. Collect URLs and hand them off
```bash
for f in get_vendors get_closures get_foot_traffic get_restaurants get_events check_clearance recommend_spots; do
  echo "$f: $(doctl serverless functions get rollaway/$f --url)"
done
```
- **Frontend** gets the `recommend_spots`, `get_vendors`, and `get_closures` URLs through the matching `VITE_*` build-time variables.
- **recommend_spots** gets the Functions namespace in `FUNCTIONS_BASE_URL`, plus the direct agent `/spot_scout` and `/menu_overlap` URLs in `SPOT_SCOUT_URL` and `MENU_RAG_URL`.
- The frontend permit URL points directly to the agent runtime `/permit_copilot` endpoint.

## Local testing without deploying
```bash
node functions/scripts/invoke_local.js <function> '<json args>'
node functions/scripts/invoke_local.js recommend_spots \
  '{"user_profile":{"vendor_type":"truck","menu":[{"item":"al pastor taco","price":4.5}]},"location":{"lat":37.78,"lng":-122.40,"radius_m":500}}'
DEMO_DATA_MODE=1 node functions/scripts/invoke_local.js recommend_spots '{"user_profile":{"vendor_type":"truck"}}'  # offline demo build
cd functions/packages/rollaway/check_clearance && npm install && npm test
cd functions/packages/rollaway/recommend_spots && npm test    # demo + fail-fast suites
```

## Env vars added for recommend_spots + demo reliability
| Var | Purpose | Unset fallback |
|---|---|---|
| `DEMO_DATA_MODE` | read frozen snapshots (offline demo build) | live APIs (miss → snapshot) |
| `MAPBOX_TOKEN` | live Directions/Matrix travel times | haversine estimate |
| `FUNCTIONS_BASE_URL` | recommend_spots HTTP fan-out to deployed siblings | in-process require |
| `SPOT_SCOUT_URL` | one Spot Scout call → why-lines | deterministic templated why-lines |
| `MENU_RAG_URL` | menu-RAG competition overlap | deterministic cuisine+price bridge |

## Regenerating shipped data
```bash
node functions/scripts/fetch_static_data.js        # schools/hydrants/sidewalks snapshots
node functions/scripts/aggregate_baywheels.js <month>.csv   # station_hourly.json
node functions/scripts/sync_shared.js              # after editing lib/shared.js OR demo_data/
node functions/scripts/freeze_snapshots.mjs        # refreeze demo snapshots off scenario.json
```
