# Person 1 — Frontend Setup Guide (branch `feat/frontend`)

Everything you need to go from a blank machine to shipping the Rollaway frontend.
Your task list lives in `PERSON1_FRONTEND_TASKS.md`. The API contract you build against is
`docs/CONTRACTS.md` (on `main`) — **read §A before writing any code.**

---

## 1. Prerequisites (install these)

| Tool | Version | Install (macOS) | Why |
|---|---|---|---|
| Node.js | ≥ 20 LTS | `brew install node@20` (or nvm) | Vite/React toolchain |
| npm | ships with Node | — | package manager |
| Git | any recent | `brew install git` | you know why |
| doctl (optional) | latest | `brew install doctl` | DO CLI, for App Platform debugging |

Windows/Linux: use nvm-windows / your package manager — nothing here is macOS-specific.

## 2. Accounts & keys you need

| Account | What to get | Where | Cost |
|---|---|---|---|
| **Mapbox** | Access token (public, `pk.*`) | account.mapbox.com → Tokens | Free tier is plenty |
| **DigitalOcean** | Team invite + App Platform access | ask Dat for a team invite | Hackathon credits |
| **GitHub** | Push access to this repo | ask Dat | free |

⚠️ Restrict your Mapbox token to our deployed URL + localhost before the demo (Mapbox
dashboard → token → URL restrictions). Public tokens in a frontend are expected, but scope them.

## 3. Get the code

```bash
git clone <repo-url> RollAway
cd RollAway
git checkout feat/frontend
```

Work on this branch. Small commits, push often — App Platform will auto-deploy from it later.

## 4. Scaffold the app (first task, do this once)

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install mapbox-gl react-map-gl
npm install -D vite-plugin-pwa tailwindcss @tailwindcss/vite
```

Recommended libs (pick when you need them):
- `react-markdown` + `rehype-sanitize` — render `reply_markdown` safely
- `zustand` (or plain context) — map/chat state
- `clsx` — class toggling

## 5. Environment variables

Create `frontend/.env.local` (git-ignored — never commit it):

```bash
VITE_MAPBOX_TOKEN=pk.your_token_here
VITE_CHAT_ENDPOINT=http://localhost:0000/placeholder   # Person 2 gives you the real URL
VITE_USE_FIXTURES=true                                 # start in fixture mode
```

Commit a `frontend/.env.example` with the same keys and no values.

## 6. Fixture mode — you are NOT blocked on Person 2

1. Copy the example responses from `docs/CONTRACTS.md` §A into:
   - `frontend/src/fixtures/chat.spot.json` (Spot Scout reply with `map_actions`)
   - `frontend/src/fixtures/chat.permit.json` (Permit Copilot reply with `checklist`)
2. Write one `chatClient.ts`:
   - `VITE_USE_FIXTURES=true` → return a fixture (pick by keyword: "permit" → permit fixture).
   - otherwise → `fetch(VITE_CHAT_ENDPOINT, { method: 'POST', body })`.
3. Build the entire UI against fixtures. When Person 2's endpoint is live, flip the flag.
   **Nothing else changes** — that's the whole point of the contract.

Ask Person 3 for the seed vendor GeoJSON (`get_vendors?format=geojson`) for the initial map
layer; until then, hand-make 5 fake vendor points in SF and keep going.

## 7. Daily dev workflow

```bash
cd frontend
npm run dev          # http://localhost:5173
```

Test on your phone (same Wi-Fi): `npm run dev -- --host`, then open `http://<your-ip>:5173`.
PWA install prompts require HTTPS — test install behavior on the deployed URL, not localhost.

## 8. Deploy — DigitalOcean App Platform

1. DO dashboard → Apps → Create App → connect this GitHub repo.
2. Branch: `feat/frontend` (switch to `main` after integration).
3. Type: **Static Site**. Source dir `frontend`, build `npm run build`, output dir `dist`.
4. Set env vars in App Platform (same keys as `.env.local`, `VITE_USE_FIXTURES=false`).
5. Every push auto-deploys. Verify the live URL **on a real phone** including Add-to-Home-Screen.

SPA routing: add a catch-all so deep links serve `index.html` (App Platform static site →
Custom Pages → catchall `index.html`).

## 9. Who to talk to

| Need | Person |
|---|---|
| `/chat` endpoint URL, response questions, streaming or not | **Person 2** |
| Seed vendor GeoJSON, what `status` values exist | **Person 3** |
| Contract changes | propose edit to `docs/CONTRACTS.md`, ping both |

## 10. Done = 

Work through `PERSON1_FRONTEND_TASKS.md` top to bottom — Tasks 1→3 (scaffold, PWA, map) are
the critical path; the Definition of Done checklist at the top is the demo bar.
