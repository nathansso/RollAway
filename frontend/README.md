# Rollaway frontend

Guided React 19 PWA for mobile food vendors operating within the City and County
of San Francisco.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

`VITE_USE_FIXTURES=true` is the default and needs no Rollaway backend. It provides the
complete SoMa recommendation scenario, city vendor layer, active closures, permit
checklist, and EasyApply review flow without calling any Rollaway business API.

Mapbox is independent of fixture mode. Add a public `pk.*` token as
`VITE_MAPBOX_TOKEN` to use Mapbox streets; styles, tiles, fonts, sprites, and telemetry
may then contact Mapbox. Leave it blank to use the fully functional schematic map.
Restrict the public token to the exact local and deployed site URLs in the Mapbox
dashboard. Never use a secret `sk.*` token in this browser app.

The guided flow is:

1. Complete the first-launch business profile.
2. Choose a session time and an SF origin (locations outside SF use the SoMa demo
   origin).
3. Select **Find places to roll** to generate recommendations.
4. Open **Permits** and explicitly select **Build my permit checklist** when ready.

Commands:

```bash
npm test
npm run lint
npm run build
npm run test:e2e
npm run test:mapbox
npm run test:pwa
```

`test:e2e` and `test:pwa` force tokenless fixture mode and do not consume
`.env.local`. `test:mapbox` uses a separate dev server with a checked-in fake public
token; its browser test intercepts and fulfills the Mapbox style, vector-tile, and
telemetry requests, so no real token or Mapbox network access is used.

The app stores the versioned vendor profile and permit progress in localStorage only.
See `DECISIONS.md` for contract choices and `DEPLOY.md` for DigitalOcean App Platform.
