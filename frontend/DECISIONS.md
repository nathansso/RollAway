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

## Post-review adjustments (multi-agent adversarial review, 25 confirmed findings fixed)

11. **Primary darkened `#EA580C` → `#C2410C`** (orange-700). The brighter orange failed
    WCAG AA (3.55:1) everywhere it carried 14px text (user bubbles, wordmark, badges).
    One token change fixed the whole family; `--color-secondary` keeps the brighter
    orange for large decorative fills. Manifest `theme_color` stays `#EA580C` (browser
    chrome, not text).
12. **Caution amber never carries white text** — dark text (`text-slate-900` /
    `text-amber-800`) on amber surfaces (offline banner, marker scores, status chips,
    deadline pills).
13. **`sendReal` handles streaming** (SSE/NDJSON content-type sniff) AND sanitizes
    out-of-contract responses in the single network layer, so a misbehaving backend
    can't white-screen a marker tap.
14. **All localStorage writes are best-effort** (try/catch, state-first) — quota errors
    can't eat a successful reply or freeze checklist toggles.
15. **Empty `map_actions: []` clears stale spots** (contract: [] = "no spots", null =
    "no map change"); fly-to only fires when spots actually landed.
16. **Dialogs (spot panel, checklist) move focus in, close on Escape, restore focus.**
17. **Safe-area insets on all four edges** for edge-anchored chrome (peek bar, header,
    composer, pill) — notched/home-indicator phones in both orientations.
18. **Vendor dots get an invisible 22px-radius hit layer** (~44px targets). Known gap:
    canvas-drawn vendor dots are still not keyboard-reachable — a vendor list view is
    the right fix and is deferred (documented, not hidden).
19. **`vendorSource` adapts either GeoJSON or the §B.1 `vendors[]` shape**, so Person 3
    can ship either without breaking the map.
20. **Composer is 16px** (`text-base`) — sub-16px inputs trigger iOS auto-zoom.
