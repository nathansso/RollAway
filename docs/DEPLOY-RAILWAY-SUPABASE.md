# Deploy runbook — Railway + Supabase cutover

Companion to `docs/MIGRATION-PLAN.md`. Everything code-side is implemented on
the branch; the steps below are the account-access operations (Railway,
Supabase, DO dashboards) plus the verification gates to run at each cutover.

## 0. Provision

1. **Supabase**: create a project (region: us-west). SQL editor → run
   `supabase/migrations/0001..0003` in order. Note the project URL, anon key,
   service key, and DB connection string.
2. **Railway**: create a project with two services from this GitHub repo:
   - `rollaway-frontend` — Root Directory `frontend`, Dockerfile
     `Dockerfile.railway`.
   - `rollaway-backend` — Root Directory `/` (repo root), Dockerfile
     `backend/Dockerfile`.

## 1. Phase 1 — frontend cutover (zero contract changes)

Frontend service variables (RUNTIME — restart applies them, no rebuild):

| Var | Value |
|---|---|
| `RECOMMEND_SPOTS_URL` | existing DO Function `recommend_spots` web URL |
| `VENDORS_URL` / `CLOSURES_URL` | existing DO Function web URLs |
| `PERMIT_CHECKLIST_URL` | existing DO agents runtime `/permit_copilot` |
| `MENU_EXTRACT_URL` | existing DO agents runtime `/menu_extract` |
| `FORM_PDF_URL` | existing DO agents runtime `/form_pdf` |

Build-time args (rebuild to change): `VITE_USE_FIXTURES=false`,
`VITE_FIXTURE_DELAY_MS`, `VITE_MAPBOX_TOKEN`, `VITE_GOOGLE_MAPS_BROWSER_KEY`.

Then:
- Update `CORS_ORIGIN` on the DO agents runtime app to the Railway domain;
  confirm the DO Functions' CORS headers allow the new origin.
- Gate: `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:pwa`
  locally; live smoke test on the Railway domain (map seed layer, recommend
  flow, permits tab, menu upload) with DevTools confirming calls hit DO.
- PWA note: the new domain is a new SW scope — old-origin installs keep
  pointing at the old domain and die with it; nothing to migrate.
- **Decommission** the DO static site (`.do/app.yaml`) after 48h of
  stability. Rollback until then = flip DNS/links back.

## 2. Phase 2 — backend cutover

Backend service variables: `GRADIENT_API_KEY` (model access key),
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FUNCTIONS_BASE_URL` (DO namespace
web base), `CORS_ORIGIN` (Railway frontend origin).

Data loads:
```sh
python backend/scripts/ingest_kb.py                     # KB -> pgvector
python supabase/scripts/import_baywheels.py <month.csv> # trips -> station_hourly
```

Repoint DO-side wiring:
- `functions/.env`: set `SUPABASE_URL` + `SUPABASE_ANON_KEY` (get_foot_traffic
  reads station_hourly live), and move `SPOT_SCOUT_URL` / `MENU_RAG_URL` from
  the DO agents runtime to the FastAPI `/spot_scout` and `/menu_overlap`;
  redeploy the Functions (`doctl serverless deploy functions`).

**Verification gate (blocking) before each cutover:**
```sh
GRADIENT_ENDPOINT_URL=https://<railway-backend> node agents/evals/run.mjs --live
```
must be GREEN (the runner auto-detects the FastAPI backend and replays every
seed against the direct endpoints; it pins the §A envelope, guardrails, and
§E citation behavior).

Frontend env flips (runtime config — restart, no rebuild):
1. `PERMIT_CHECKLIST_URL`, `MENU_EXTRACT_URL`, `FORM_PDF_URL` → FastAPI.
2. `RECOMMEND_SPOTS_URL` → FastAPI `/api/recommend_spots`, `VENDORS_URL` →
   `/api/vendors`, `CLOSURES_URL` → `/api/closures`.

**Decommission** the DO agents runtime app after the eval gate passes against
production and a 48h soak. Rollback at any point = restart the frontend with
the old URLs.

## 3. What stays on DigitalOcean

- Gradient serverless inference (`https://inference.do-ai.run/v1`) — chat
  (`anthropic-claude-haiku-4.5`) + embeddings (`bge-m3`).
- The seven Functions, until Phase 3 (issue #36).
