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

### #11 — Sign Up Improvements — 🔧 partial (blockers noted)
- ✅ doable now: rename "EasyApply details" → "User info"; enforce phone validity; email handled via #12.
- ⚠️ contract-touching (removing home-base + operating-windows requires relaxing `validateProfile` and defaulting them in the model + updating e2e).
- 🚫 **blocked:** "Remove Permit Status field" is blocked on **#15** (status is meant to be derived from checklist uploads built in #15). Per nathansso, sequence #15 first — not removing it yet.
- 🚫 **needs backend:** "Menu = file upload (image/PDF/URL) → extract → JSON" needs a menu-extraction service that does not exist in this repo (only `menu_overlap` exists, for competition). Text can be parsed locally; image/PDF/URL cannot. Menu rework held until the extraction backend exists.
