# Deploying the RollAway map app

RollAway is a Vite static site deployed by DigitalOcean App Platform. The checked-in
`.do/app.yaml` tracks `feat/frontend-mapapp`, builds from `frontend`, and publishes
`frontend/dist`.

## Create or update the app

```bash
doctl auth init
doctl apps create --spec .do/app.yaml
```

For an existing app:

```bash
doctl apps update <APP_ID> --spec .do/app.yaml
```

The same spec can be imported in DigitalOcean Cloud → Apps → Create App → Edit Spec.
Autodeploy is enabled for pushes to `feat/frontend-mapapp`.

## Build-time environment

All variables are compiled into the browser bundle. Saving a value requires a rebuild.
Never put server credentials or a Mapbox `sk.*` token in the frontend.

- `VITE_USE_FIXTURES=true`: deterministic recommendation, vendor, closure, and permit
  data. The app uses the schematic map and performs zero network requests in this mode,
  even when a Mapbox token is configured.
- `VITE_FIXTURE_DELAY_MS=1100`: optional demo latency for the rolling-truck loader.
- `VITE_MAPBOX_TOKEN`: optional public `pk.*` token. Without it, the schematic map
  fallback remains fully usable.
- `VITE_RECOMMEND_SPOTS_URL`: native structured recommendation endpoint.
- `VITE_VENDORS_URL`: `get_vendors` endpoint, accepting GeoJSON or the frozen
  `{vendors: [...]}` contract.
- `VITE_CLOSURES_URL`: `get_closures` endpoint.
- `VITE_PERMIT_CHECKLIST_URL`: structured permit-checklist endpoint.

The recommendation boundary accepts the native contract first and adapts a legacy
`map_actions` response only at that boundary. `VITE_CHAT_ENDPOINT` is obsolete and is
not read.

## Live mode

1. Configure all four live endpoint URLs as build-time variables.
2. Set `VITE_USE_FIXTURES=false`.
3. Save the App Platform settings and wait for the new deployment.
4. Smoke-test onboarding, location fallback, recommendations, Good to Know details,
   permit progress, and EasyApply review.

If one endpoint is missing, live mode shows a recoverable UI error; it does not silently
claim fixture data is live.

## Verification

```bash
cd frontend
npm ci
npm test
npm run lint
npm run build
npm run test:e2e
npm run test:pwa
```

On the deployed URL:

1. Complete first-launch onboarding and reload.
2. Confirm the full base experience appears before recommendations.
3. Verify map fallback behavior without a token or network.
4. Open all ranked spots and confirm proxy/citation labels.
5. Complete and reload permit checklist items.
6. Review an EasyApply item and confirm the end state says **Simulated packet ready**.
7. Install the PWA, relaunch it, and verify fixture mode while offline.

Restrict the public Mapbox token to the deployed origin. After merge, update the source
branch in `.do/app.yaml` and App Platform from `feat/frontend-mapapp` to `main`.
