# Run Rollaway locally on the REAL backend (no fixtures)

This runs all three tiers on your machine against the live DigitalOcean Gradient agent + live
SF/Google/Ticketmaster/Mapbox APIs — so the map, "Good to Know" cards, and permit checklist show
real data, not fixtures.

Three processes. Put your keys in the environment (never commit them).

## 1. Agent runtime (Gradient) — port 8080
```bash
cd agents/runtime
GRADIENT_API_KEY=<doo_v1_… model access key> node server.mjs
# -> /spot_scout, /permit_copilot, /menu_overlap  (model defaults to anthropic-claude-haiku-4.5)
```

## 2. Functions gateway (live APIs) — port 8090
```bash
DEMO_DATA_MODE=off \
SOCRATA_APP_TOKEN=<token> \
GOOGLE_PLACES_KEY=<key> \
TICKETMASTER_KEY=<key> \
MAPBOX_TOKEN=<pk.…> \
SPOT_SCOUT_URL=http://localhost:8080/spot_scout \
MENU_RAG_URL=http://localhost:8080/menu_overlap \
FUNCTIONS_BASE_URL=http://localhost:8090 \
node functions/scripts/local_gateway.mjs
```
`DEMO_DATA_MODE=off` = hit the live APIs (dynamic, any location). Set it to `on` to read the
frozen demo snapshots instead (identical every run — use for a stage demo).

## 3. Frontend — port 5199
In `frontend/.env.local` (git-ignored):
```
VITE_MAPBOX_TOKEN=pk.…
VITE_USE_FIXTURES=false
VITE_RECOMMEND_SPOTS_URL=http://localhost:8090/recommend_spots
VITE_VENDORS_URL=http://localhost:8090/get_vendors
VITE_CLOSURES_URL=http://localhost:8090/get_closures
VITE_PERMIT_CHECKLIST_URL=http://localhost:8090/permit_copilot
VITE_MENU_EXTRACT_URL=http://localhost:8090/menu_extract
```

`VITE_MENU_EXTRACT_URL` powers sign-up menu extraction (photo / PDF / link → items)
via Gradient. Leave it empty to fall back to in-browser text-only parsing.
```bash
cd frontend && npm run dev -- --port 5199
```

## Verify it's actually live (not fixtures)
- Gateway log prints each real call: `[gw] POST /recommend_spots -> 200 (3400ms)`.
- Onboard, hit **Find spots** — competition names ("El Tonayense #60") and clearance distances
  ("63.5ft < required 75ft") come from live Socrata + Google Places.
- A raw agent check: `curl -s localhost:8080/permit_copilot -d '{"vendor_type":"truck"}' -H content-type:application/json`.

## Notes
- **Latency:** the runtime defaults to `anthropic-claude-haiku-4.5` (~2s) — override with
  `GRADIENT_MODEL=<id>`. `llama3.3-70b-instruct` works but is ~15–28s per call.
- **Tests** assume fixture mode. Run them with `VITE_USE_FIXTURES=true npm test` (or unset the
  live `.env.local`), otherwise the "without fetch" fixture tests try to hit the network.
- **Production:** deploy the Functions to DO (`functions/DEPLOY.md`) and the runtime / managed
  agents (`agents/RUNBOOK.md`); point the four `VITE_*_URL` at the deployed URLs. The gateway is
  a local-dev convenience only.
