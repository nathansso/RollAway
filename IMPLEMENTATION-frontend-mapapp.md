# Person 1 — Frontend / Map App (branch `feat/frontend-mapapp`)

**Layer: the entire web app (`/frontend`).** You build the Uber/Google-Maps-style experience. AI runs backstage — **you never render a chat window.** All AI output arrives as structured JSON and you render it as UI: highlighted spots, ranked cards, "Good to Know" detail rows, permit checklists.

> ⚠️ This is a re-scope of the existing `/frontend` (which had a chat). **Rip out the chat**, keep and repurpose what's reusable: the Mapbox map, the PWA setup, the spot detail panel (→ becomes the "Good to Know" card), the permit checklist (→ becomes the Permits tab), the design tokens, and the rolling-truck loader work.

You depend on Person 2's Function responses (esp. `recommend_spots`) and Person 3's agent output (which reaches you *through* Person 2's Functions). You are unblocked from day 1 via **FIXTURES mode** (below).

---

## Demo-reliability stance (shared, but you own two pieces of it)
- **localStorage only.** The vendor profile + permit progress live in localStorage and survive reloads. There is NO backend user store — do not build one.
- **`FIXTURES=true` kill switch (YOU OWN THIS).** A mode that renders the *entire* UI from local canned JSON with zero network. This is the parachute if venue wifi dies. Every screen must render fully from fixtures.
- **Instant base map.** Render the map, user dot, muted competitor markers, and closure shading IMMEDIATELY from cached/base layers. Only the ranked recommendations sit behind the truck loader. **The map is never blank.**

---

## Features you own (in build order)

### 1. Deploy skeleton + truck loading animation (do FIRST)
- Vite + React + TS + Tailwind PWA, deployed to **DO App Platform from GitHub** early, so integration is continuous.
- **Rolling-truck loader** — the orange truck runs with **wheels spinning and dust/dirt kicking up behind it**. Shown for every multi-second wait (recommendations computing, checklist generating). Inline SVG + CSS animation, `prefers-reduced-motion` fallback. Build this early — it covers every async wait in the demo.
- Full-screen Mapbox GL map as the hero. Bottom nav with two tabs: **Map** and **Permits**.

### 2. Onboarding form (first launch only) → persisted profile
Collect the full vendor profile (see Data schema) and save to localStorage:
- vendor type (truck / trailer / pushcart_cooking / pushcart_no_cook)
- **menu upload or paste** (items + prices) — this is primary; hand the raw menu to Person 3's ingestion (via Person 2). Derive a coarse `price_tier` ($/$$/$$$) client-side for display, but keep item-level detail.
- home base location/neighborhood, max travel (min/mi), operating windows, permit status
- **autofill_profile** personal/business details (name, business name, contact) for the EasyApply permit flow
- Runs only on first launch; editable later from a profile screen.

### 3. Session start
- Grant live location (user dot). A **"when" picker**: today lunch / tomorrow dinner / Saturday / date+time-of-day slots. This `when` feeds `recommend_spots`.

### 4. Map view (main screen)
- User live-location dot; **3–5 recommended spots** as highlighted markers/zones with rank badges (1,2,3); existing permitted vendors as small **muted** competitor markers; **active closures shaded**.
- **"Good to Know" detail card on click** (Apple Maps style) — NOT prose, NOT a chat list. A set of **icon-led rows**, each a glanceable fact:
  - 🚶 foot traffic (estimated, small time-of-day indicator; label "estimated")
  - 🍽 competition (how many nearby vendors/restaurants overlap THIS truck's menu items + price points — from the menu-RAG overlap Person 3 computes)
  - ✅ legality (green pass / red fail + the specific rule cited)
  - 🚧 active closures nearby
  - 🕒 travel time from current location
- Optional **bottom card carousel** summarizing ranked spots (rank + block + one-line why + travel time); the rich detail lives in the on-click card.

### 5. Permits tab (EasyApply style)
- Personalized checklist from Permit Copilot (arrives as JSON): four SF agencies (Public Works, Public Health, Fire, Treasurer) as ordered sections, each document a **checkable item**, with the **hidden deadlines surfaced** (30-day notice, 90-day tentative approval, 15-day appeal). Progress persists per user (localStorage).
- **EasyApply autofill:** each permit item has a "review & submit" state with fields **pre-filled from `autofill_profile`** (name, business, contact, vendor type, menu, location). The vendor only fills genuinely missing fields. **Clearly mark auto-filled vs. must-verify fields; never auto-submit anything binding without an explicit confirm.**

### 6. Polish (cut from the end if needed)
Travel-time display, foot-traffic time-of-day indicator, PWA manifest + service worker (installable, offline shell), honest-labeling microcopy ("estimated", "guide — verify with the SF Permit Center").

---

## Contracts you consume (define shapes with Persons 2 & 3 day 1)
- **`recommend_spots` response** (from Person 2) → your map markers + "Good to Know" rows. Expect per-spot: `{rank, point, block_label, score_breakdown:{foot_traffic, competition, legality:{pass, rule}, closures, travel_minutes}, why_one_line}`.
- **Base layers** (from Person 2): `get_vendors` (muted markers), `get_closures` (shading).
- **Permit checklist** (Permit Copilot, via Person 2/3): agencies → documents → {label, deadline, cite, autofill_field?}.
- **You produce:** the `user_profile` (Data schema) + `when` + `location` that Person 2's `recommend_spots` consumes; and the raw `menu` handed off for RAG ingestion.

## Fixtures-first workflow (unblocks you today)
Create `frontend/src/fixtures/` canned JSON for: `recommend_spots`, `get_vendors`, `get_closures`, the permit checklist. A single `apiClient` returns fixtures when `FIXTURES=true`, else calls the real Function URLs. Build every screen against fixtures; flip the flag when Persons 2/3 ship. **Keep the demo scenario's exact spots/closures in these fixtures** (see shared decision).

## Verification (DoD)
- [ ] `npm run build` + lint clean; deployed to App Platform, auto-deploy on push.
- [ ] First-launch onboarding saves full profile to localStorage; survives reload; no backend.
- [ ] Map renders base layers instantly; recommendations appear behind the truck loader; never blank.
- [ ] Clicking a spot opens the icon-row "Good to Know" card (no chat, no prose paragraphs).
- [ ] Permits tab renders the checklist with surfaced deadlines + EasyApply autofill; auto-filled vs verify fields clearly marked; explicit confirm before any submit.
- [ ] `FIXTURES=true` renders every screen with zero network.
- [ ] Truck loader (spinning wheels + dust) on every multi-second wait; reduced-motion fallback.
- [ ] Drive it in a browser; attach screenshots of map + Good-to-Know card + Permits tab.

## Branch etiquette
Own `/frontend`. Lock the three consumed contract shapes with Persons 2 & 3 on day 1. Keep the demo-scenario fixtures in sync with Person 2's snapshot.
