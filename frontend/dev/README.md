# Rollaway screen harness (dev-only)

A tool for **reviewing every page of the app in isolation**. Rollaway is a single
stateful SPA, so its "pages" (onboarding, session setup, map, spot detail, permit
checklist, loaders) are normally reached only by clicking through the flow, and the
transient loader screens are hard to catch. This harness seeds the store with
fixture data and puts each screen at its own URL.

It runs in **fixture mode with no credentials** — no Mapbox token, no backend, no
`.env.local` required.

## Launch it

```bash
cd frontend
npm ci          # first time only
npm run screens # starts Vite and opens the gallery
```

Then open (auto-opens with `npm run screens`):

**http://localhost:5173/dev/screens.html** — the gallery of every screen.

> The port is whatever Vite prints (5173 by default; it picks the next free port if
> that's taken). If the browser doesn't open automatically, visit the printed URL and
> append `/dev/screens.html`.

Each screen also has its own URL, e.g.
`http://localhost:5173/dev/screens.html?screen=map`. A floating **"🖥 Screens"** menu
(top-right) switches between them. On the **Permits · Checklist** screen, click
**"Review & submit"** on any step to see the EasyApply modal.

Screens: `profile`, `session`, `loading-recs`, `map`, `spot`, `permits-landing`,
`permits`, `loading-permits`.

To share on your LAN (e.g. to view on a phone), add `--host`:
`npm run screens -- --host`.

## For a coding assistant

To launch this for the user, from the repo root run:

```
cd frontend && npm ci && npm run screens
```

Then tell the user to open **/dev/screens.html** on the printed localhost URL. This is
a read-only, fixture-seeded preview — it needs no environment variables or API keys.

## How it works / safety

- `dev/screens.html` + `dev/screens.tsx` are a **separate Vite HTML entry**. Nothing in
  `src/` imports them.
- The harness renders the real `<App/>` and forces `useAppStore` into a given phase with
  fixture data — it does not fork or reimplement any UI, so what you see is the actual
  component.
- It is **excluded from the production build**: `vite build` only bundles `index.html`,
  and `tsconfig.app.json` typechecks `src` only. Committing `dev/` cannot affect the
  shipped app.
