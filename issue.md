# Issue resolution log & conventions

Read this before resolving any GitHub issue in this repo.

## Conventions

- **Branch:** do all issue work on the active feature branch (currently `feat/landing-page`); never commit to `main`.
- **Authoring:** commit under the local git identity (`Dat Nguyen <datq.nguyen06@gmail.com>`). No AI-attribution trailers (`Co-authored-by`, `Generated with`, etc.).
- **Verification before "done":** `npm run build`, `npm run lint`, `npm test`, and the relevant Playwright suite (`npm run test:e2e`). Reproduce bugs before fixing; verify fixes end-to-end.
- **Respect blockers:** if an issue (or its comments) says it depends on / is sequenced after another issue, do not do the blocked part. Note it here instead.
- **Honesty:** don't fake functionality that needs a backend that doesn't exist yet; build the UI and flag the missing piece.
- **Known pre-existing failures:** `src/lib/apiClient.test.ts` has 5 failing tests unrelated to any of these issues (reproduce with all changes stashed). Do not attribute them to issue work.

## Resolution log

### #18 — Create home/Landing page — ✅ done (`2e15b6b`)
Marketing landing at `/`; app moved to `/app`; single "Find your spot" CTA into onboarding. Reuses app tokens/components. Mapbox code-split so it never loads on `/` (verified 0 requests).

### #16 — Home Button Routing — ✅ done (`6610c12`)
Top-left "Rollaway" lockup on the map page is now an `<a href="/">` to the landing page, with hover/focus states.

### #13 — Phone Entry Format — ✅ done (`6610c12`)
Fixed `+1` prefix + live formatting to `+1 (415) 555-0132` in the profile phone field. `formatUsPhone`/`formatUsPhoneLocal` in `lib/profile` (tested); caret pinned to end; stores full value for permit autofill.

### #10 — UI Navigation (permit checklist off the trip page) — ✅ done (`8ca556f`)
Removed the bottom nav; permit checklist now reached via profile → "Permit checklist"; added "Back to map" on the permit screen. e2e updated (`openPermits`). Permit generation stays explicit.

### #12 — Valid Email Bug — 🔧 in progress
Current app-level regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` already accepts `.edu`/`.museum`/`+tag`/subdomains (reproduced: they pass). Hardening: validate only email *shape*, drop the browser's native `type="email"` strong-rejection layer, lock in permissive behavior with tests.

### #11 — Sign Up Improvements — 🔧 mostly done (one part blocked)
- ✅ Renamed "EasyApply details" → "User info".
- ✅ Removed the home-base/neighborhood field and the operating-windows editor; relaxed `validateProfile` (empty home_base.label allowed; operating windows keep a model default). Remapped the EasyApply permit "location" to address + city.
- ✅ Enforced complete US phone (`isValidUsPhone`); email via #12.
- ✅ **Menu rework via Gradient AI serverless inference:** menu is now upload-first (image / PDF / text file / website link), extracted to JSON, with a success/failure notice and an expandable extracted-menu view; sample-menu and paste fields removed. New agents-runtime route `POST /menu_extract` (`agents/menu_rag/extract.mjs`) reuses the Gradient pipeline (`parseMenuText` for text/url with price verification; the multimodal model for images) with the deterministic mock as fallback. Frontend calls it via `VITE_MENU_EXTRACT_URL`; without the live service, pasted/text sources parse locally and images/PDFs/links show a "connect the extractor" notice. Live Gradient vision path is implemented but needs a `GRADIENT_API_KEY` + running runtime to verify.
- 🚫 **still blocked:** "Remove Permit Status field" — blocked on **#15** (status must be derived from checklist uploads). Left in place until #15 lands.
