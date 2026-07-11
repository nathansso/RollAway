# Frontend build decisions (Person 1 agent run)

Decisions made autonomously during the end-to-end build, per the mission's
"don't stop to ask" rule. Raise anything here you disagree with.

1. **Plain `mapbox-gl` instead of `react-map-gl`.** Fewer version-coupling risks with
   Mapbox GL v3; the map is one component, so a wrapper library buys little.
2. **Zustand for state.** One store is the integration spine; `sendMessage` is the single
   pathway that fans a `/chat` reply out to map, chat, and checklist. Not in the original
   dependency list, but tiny (~1kB) and removes prop-drilling across 5 modules.
3. **`react-markdown` without `rehype-raw` is the sanitizer.** react-markdown escapes raw
   HTML by default, so script injection through `reply_markdown` is inert. We deliberately
   do NOT enable rehype-raw.
4. **Fixture routing by keyword** (`permit|license|fire|health|dmv|...` → permit fixture,
   else spot fixture) mirrors Person 2's planned router so demo behavior matches prod paths.
5. **Checklist persistence**: full checklist JSON + a separate set of done-step orders in
   localStorage. A new checklist from the agent resets done-state (new vendor type = new
   path), matching the contract's `status` field semantics.
6. **One sheet at a time.** `sheetView: peek | chat | spot | permits` in the store decides
   which bottom sheet renders; spot selection switches the view rather than stacking modals.
7. **Vendor fixture is `vendors.geojson.json`** (not `.geojson`) so Vite's JSON import
   handles it without a plugin. Person 3's live URL replaces it via `VITE_VENDORS_URL`.
8. **Design system**: warm orange primary `#EA580C` (street food), blue accent `#2563EB`
   (map/CTA), cream background, Calistoga display + Inter body — from the ui-ux-pro-max
   design-system pass for "street food vendor, warm, trustworthy".
9. **Maskable PWA icon reuses the 512 icon.** Good enough for the hackathon; a padded
   dedicated maskable variant is a nice-to-have.
10. **Deploy is prep-only**: `.do/app.yaml` + `DEPLOY.md` runbook, since dashboard access
    can't be scripted from here.
