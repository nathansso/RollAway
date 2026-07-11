# Deploying the Rollaway map app

Rollaway is a Vite static site deployed by DigitalOcean App Platform. The checked-in
`.do/app.yaml` tracks `main`, builds from `frontend`, and publishes
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
Autodeploy is enabled for pushes to `main`.

## Build-time environment

All variables are compiled into the browser bundle. Saving a value requires a rebuild.
Never put server credentials or a Mapbox `sk.*` token in the frontend.

- `VITE_USE_FIXTURES=true`: deterministic recommendation, vendor, closure, and permit
  data. No Rollaway business endpoint is called. If `VITE_MAPBOX_TOKEN` exists, the
  browser may still request Mapbox styles, tiles, fonts, sprites, and telemetry.
- `VITE_FIXTURE_DELAY_MS=1100`: optional demo latency for the rolling-truck loader.
- `VITE_MAPBOX_TOKEN`: optional public `pk.*` token, enabled in both fixture and live
  modes. Without it—or when Mapbox cannot load—the schematic map remains fully usable.
- `VITE_RECOMMEND_SPOTS_URL`: native structured recommendation endpoint.
- `VITE_VENDORS_URL`: `get_vendors` endpoint, accepting GeoJSON or the frozen
  `{vendors: [...]}` contract.
- `VITE_CLOSURES_URL`: `get_closures` endpoint.
- `VITE_PERMIT_CHECKLIST_URL`: structured permit-checklist endpoint.

The recommendation boundary accepts the native contract first and adapts a legacy
`map_actions` response only at that boundary. `VITE_CHAT_ENDPOINT` is obsolete and is
not read.

Rollaway is scoped to the City and County of San Francisco. The app constrains Mapbox
to SF bounds and replaces an outside-SF live location with the SoMa demo origin. A new
user completes a business profile, configures each session, and explicitly starts
recommendation generation. Opening **Permits** does not make a request; the user must
select **Build my permit checklist** to generate the personalized checklist.

## Live mode

1. Configure all four live endpoint URLs as build-time variables.
2. Set `VITE_USE_FIXTURES=false`.
3. Save the App Platform settings and wait for the new deployment.
4. Smoke-test profile → session → recommendation loading, outside-SF location fallback,
   map details, explicit permit generation, permit progress, and EasyApply review.

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
npm run test:mapbox
npm run test:pwa
```

The standard E2E and PWA commands force a blank Mapbox token and fixture-only
Rollaway endpoints, independent of `.env.local`. `test:mapbox` runs on a separate
server with a non-secret fake public token and fulfills all Mapbox style, vector-tile,
and telemetry requests inside Playwright. It verifies the real Mapbox browser path
without using a project token or external network.

On the deployed URL:

1. Complete the first-launch profile and session setup, then reload.
2. Confirm the map is absent until **Find places to roll** is selected.
3. Verify Mapbox in fixture mode with a token, plus schematic fallback without a token
   or when Mapbox is unavailable.
4. Open all ranked spots and confirm proxy/citation labels.
5. Open **Permits**, confirm no checklist is generated automatically, select
   **Build my permit checklist**, then complete and reload checklist items.
6. Review an EasyApply item and confirm the end state says **Simulated packet ready**.
7. Install the PWA, relaunch it, and verify fixture mode while offline.

In the Mapbox dashboard, restrict the public token to the exact production origin and
any intentional preview/local origins. Grant only the public scopes required to load
the configured style; never expose a secret `sk.*` token. The checked-in spec already deploys from `main`; confirm App Platform uses the same source branch after importing it.
