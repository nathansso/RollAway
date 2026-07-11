# Person 1 — Frontend (branch `feat/frontend`)

**You own everything the vendor sees.** A mobile-first, installable PWA with a full-screen
Mapbox map, a chat copilot, and detail panels for spots and permits. You call **exactly one**
backend endpoint: `POST /chat` (see `docs/CONTRACTS.md` §A). No external API keys ever touch
the browser.

**Your directory:** `/frontend`
**You depend on:** Person 2's `/chat` endpoint. Until it's live, stub it with canned JSON
(fixtures in `/frontend/src/fixtures/`) that match the contract exactly.

---

## Definition of done
- [ ] Installable PWA (manifest + service worker) that loads on a phone.
- [ ] Full-screen Mapbox map showing all currently permitted vendors, color-coded by status.
- [ ] Chat panel that sends `POST /chat` and renders the reply (markdown + citations).
- [ ] Map reacts to `map_actions` (drop/score spots, verdict colors, fly-to).
- [ ] Spot detail panel rendering the `breakdown` (constraints, demand, nearby vendors).
- [ ] Permit checklist view rendering the `checklist` shape (§D).
- [ ] Pin-drop + "am I allowed here?" flow wired to a `pinned_point` in the request.
- [ ] Honest-copy microcopy in place (foot traffic = proxy; checker = guide, not legal).
- [ ] Deployed to DigitalOcean App Platform from GitHub, auto-deploy on push.

---

## Task 1 — Project scaffold
- [ ] Vite + React + TypeScript in `/frontend`. Add Tailwind (or CSS modules) for mobile-first styling.
- [ ] ESLint + Prettier. `.env.example` with `VITE_CHAT_ENDPOINT`, `VITE_MAPBOX_TOKEN`.
- [ ] `npm run dev` works; commit a running skeleton first.

## Task 2 — PWA shell
- [ ] `manifest.webmanifest` (name, icons 192/512, `display: standalone`, theme color).
- [ ] Service worker (Workbox or vite-plugin-pwa): cache the app shell + Mapbox tiles best-effort.
- [ ] "Add to Home Screen" works on iOS Safari + Android Chrome. Test on a real phone.
- [ ] Offline fallback screen (map won't work offline, but the shell shouldn't white-screen).

## Task 3 — Mapbox map (the centerpiece)
- [ ] Full-viewport map, SF-centered, mobile gestures.
- [ ] Load permitted vendors on init (from `get_vendors`-shaped data via the agent, or a
      seed GeoJSON from Person 3 for first render). Color-code markers by `status`.
- [ ] Cluster markers at low zoom for performance.
- [ ] `map_actions` handler: `add_spot` drops a scored marker; verdict → color
      (`good`=green, `caution`=amber, `avoid`=red); fly-to on new spots.
- [ ] Tap a spot marker → opens the detail panel (Task 5).
- [ ] Pin-drop mode: long-press / tap-to-drop sets `pinned_point`; a "Check this spot" button
      sends it to `/chat`.

## Task 4 — Chat copilot UI
- [ ] Bottom-sheet chat that expands over the map (mobile pattern). Persist `session_id`.
- [ ] Send `POST /chat` with `message` + `context` (vendor_type, map_center, pinned_point).
- [ ] Render `reply_markdown` (use a sanitizing markdown renderer).
- [ ] Render `citations` as tappable chips that reveal the quoted source text.
- [ ] Streaming support if Person 2 streams; otherwise a typing indicator + whole response.
- [ ] Quick-prompt chips ("Best spot for lunch?", "What permits do I need?").
- [ ] Vendor-type selector (truck / trailer / pushcart cooking / pushcart no-cook) that sets
      `context.vendor_type` for every request.

## Task 5 — Spot detail panel
- [ ] Renders `breakdown`: constraint checks (pass/fail with the cited rule + detail),
      demand (foot-traffic score as a labeled proxy, restaurant saturation), nearby vendors.
- [ ] Verdict header with score. Clear visual pass/fail for each constraint.
- [ ] "Why avoid?" expander pulling `reasons`.

## Task 6 — Permit checklist view
- [ ] Renders the `checklist` shape: ordered steps grouped by agency, deadlines surfaced as
      badges (e.g. "30-day public notice"), each step with its citation chip.
- [ ] Local step `status` toggling (todo/done) — persist in localStorage.
- [ ] Empty/loading/error states.

## Task 7 — Cross-cutting polish
- [ ] Loading, empty, and error states for every network call (respect the error envelope).
- [ ] Honest-copy microcopy where relevant (proxy / guide-not-legal disclaimers).
- [ ] Accessibility pass: tap targets ≥44px, color-contrast, markers keyboard-reachable.
- [ ] Basic analytics/logging hook (console is fine for the hackathon).

## Task 8 — Deploy
- [ ] DigitalOcean App Platform static-site (or web-service) spec, deploy from GitHub.
- [ ] Env vars set in App Platform (chat endpoint, Mapbox token).
- [ ] Auto-deploy on push to the integration branch. Verify the live URL on a phone.

---

## Interfaces you must not break
- Only call `POST /chat`. Everything you render comes from that envelope (§A).
- Treat `map_actions` and `checklist` as mutually-exclusive render paths.
- If you need a new field from the agent, propose it in `docs/CONTRACTS.md` and ping Person 2.

## Stub-first workflow (unblocks you on Day 1)
1. Copy the §A response example into `/frontend/src/fixtures/chat.spot.json` and `chat.permit.json`.
2. Build a `chatClient` that returns fixtures when `VITE_USE_FIXTURES=true`.
3. Flip to the real endpoint once Person 2 says it's live. Nothing else changes.
