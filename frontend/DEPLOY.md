# Deploying Rollaway to DigitalOcean App Platform

The frontend is a static Vite build. All env vars are **build-time** — changing one
means re-running the build (App Platform does this automatically when you save env
changes). No API keys other than the public Mapbox token ever reach the browser.

## 1. Create the app from GitHub

1. Log in at <https://cloud.digitalocean.com> → **Apps** → **Create App**.
2. Source: **GitHub**. Authorize DigitalOcean for the `nathansso/RollAway` repo
   if it isn't already connected.
3. Pick repo **nathansso/RollAway**, branch **`feat/frontend`**
   (switch to **`main`** after integration — see step 6).
4. Leave **Autodeploy** checked (deploy on push).
5. On the Resources step, DO may guess wrong. Click **Edit** on the detected
   component and set:
   - **Resource type:** Static Site
   - **Source directory:** `frontend`
   - **Build command:** `npm ci && npm run build`
   - **Output directory:** `dist`
6. Under the static site's **Settings → Custom Pages** (or "Catchall document"
   in the spec editor), set **Catchall document:** `index.html` so client-side
   routes don't 404.

Shortcut: instead of clicking through, choose **Edit Spec** during creation and
paste `.do/app.yaml` from the repo root, or run
`doctl apps create --spec .do/app.yaml`.

## 2. Set environment variables

In the app → your `rollaway-frontend` component → **Settings → Environment
Variables** → **Edit**, add (all **Build Time** scope):

| Key | Value | Notes |
| --- | --- | --- |
| `VITE_MAPBOX_TOKEN` | your `pk.…` token | Check **Encrypt**. Get it from <https://account.mapbox.com/access-tokens/>. Paste the *public* (pk) token, never a secret (sk) one. |
| `VITE_USE_FIXTURES` | `true` | Keeps the copilot on canned demo answers until the backend is live. |
| `VITE_CHAT_ENDPOINT` | *(empty for now)* | Person 2's `POST /chat` URL when it's live. |
| `VITE_VENDORS_URL` | *(empty for now)* | Person 3's `get_vendors?format=geojson` URL. Empty = bundled seed vendors. |

Click **Save** — this triggers a rebuild and deploy. The first build takes a few
minutes; watch it under **Activity**.

### Flipping from fixtures to the real backend

When Person 2 says the endpoint is live:

1. Set `VITE_CHAT_ENDPOINT` to the routed `/chat` URL.
2. Set `VITE_USE_FIXTURES` to `false`.
3. Save → auto-rebuild. No code changes needed.
4. If Person 3's vendors endpoint is up, set `VITE_VENDORS_URL` too.

## 3. Verify on a phone

1. Open the app URL (shown at the top of the app page, `*.ondigitalocean.app`)
   on a real phone, not just desktop devtools.
2. Map renders full-screen, SF-centered; vendor markers appear.
3. Send a chat message ("What permits do I need?") and confirm a reply renders.
4. **Add to Home Screen:**
   - iOS Safari: Share → **Add to Home Screen** → launch from the icon; it
     should open standalone (no browser chrome).
   - Android Chrome: menu (⋮) → **Add to Home screen** / install prompt.
5. Turn on Airplane Mode and relaunch: you should get the friendly offline
   card, not a white screen. Turn it off and confirm the "Back online" flash.

## 4. Restrict the Mapbox token

Public tokens are visible in the bundle, so scope it to your URLs:

1. Go to <https://account.mapbox.com/access-tokens/> and open the token you
   used (or create a dedicated "rollaway-prod" token).
2. Under **URL restrictions**, add:
   - your DO URL, e.g. `https://rollaway-xxxxx.ondigitalocean.app`
   - `http://localhost:5173` only on a separate dev token, not this one.
3. Save. Requests from any other origin will now be rejected by Mapbox.

Note: if you later add a custom domain, add it to the token's URL list too, or
the map will silently fail to load tiles.

## 5. Troubleshooting

- **Blank map, everything else works:** token missing/typo'd, or the URL
  restriction doesn't match the deployed origin. Check the browser console for
  401s from `api.mapbox.com`.
- **404 on refresh of a deep link:** catchall document isn't set to
  `index.html`.
- **Chat says "No chat endpoint configured":** `VITE_USE_FIXTURES` was set to
  `false` without a `VITE_CHAT_ENDPOINT`. Set the endpoint or flip back to
  `true`.
- **Env change didn't take effect:** env vars are baked in at build time —
  confirm a new deploy actually ran under **Activity**.

## 6. After integration

Once `feat/frontend` merges, point the app at `main`: app → **Settings** →
component → **Edit** source branch → `main` (or update `branch:` in
`.do/app.yaml` and re-import the spec). Autodeploy then follows `main`.
