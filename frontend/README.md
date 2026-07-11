# RollAway frontend

Map-first React 19 PWA for San Francisco mobile food vendors.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

`VITE_USE_FIXTURES=true` is the default and needs no backend or Mapbox token. It provides
the complete SoMa recommendation scenario, city vendor layer, active closures, permit
checklist, and EasyApply review flow with zero API network requests.

Commands:

```bash
npm test
npm run lint
npm run build
```

The app stores the versioned vendor profile and permit progress in localStorage only.
See `DECISIONS.md` for contract choices and `DEPLOY.md` for DigitalOcean App Platform.
