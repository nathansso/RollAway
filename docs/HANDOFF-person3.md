# Person 3 handoff — get_restaurants popularity weighting + setup-window (2026-07-11)

> For Person 1 and Person 2 (and their Claude Code sessions): everything you need to
> ingest the additive `get_restaurants` change and the cuisine-lookup adoption.
> Branch: `feat/functions-data`. Contract text: `docs/CONTRACTS.md` §B.4 (updated in
> the same commit).

## What changed (TL;DR)

1. **`get_restaurants` `saturation` is now popularity-weighted.** Same field, same
   `low|medium|high` enum, same §B shape — no action needed to keep consuming it.
   Each venue counts by Google review mass × rating instead of 1
   (`functions/packages/rollaway/get_restaurants/popularity.js`; a typical ~300-review
   4.0★ venue ≈ weight 1.0). Rationale: Google exposes **no** Popular Times/busyness
   API, so review mass is the busyness proxy.
2. **New optional setup-window inputs → new optional `window` output block (additive §B.4).**
   A vendor planning "fri 18:00–22:00 within 500 m" gets competition-that-is-actually-open:

   ```jsonc
   // input (all three together, or none; time_to <= time_from wraps overnight)
   { "lat": 37.78, "lng": -122.40, "radius_m": 500,
     "day": "fri", "time_from": "18:00", "time_to": "22:00" }
   // output gains (ONLY when a window was requested):
   "window": {
     "day": "fri", "time_from": "18:00", "time_to": "22:00",
     "open_total": 14,                       // venues open ≥50% of the window
     "open_by_cuisine": { "tacos": 1 },      // raw counts among open venues
     "saturation_open": "medium"             // popularity × fraction-open, same enum
   }
   ```

   Open/closed comes from Places `regularOpeningHours` computed locally (works for
   future windows; venues with no hours data are assumed open — conservative).
   Partial window args (e.g. `time_from` without `time_to`) → the standard
   `BAD_INPUT` envelope.
3. **`get_vendors` now joins Person 2's real `cuisine_lookup.json`** (187 permits,
   copied verbatim from `feat/agents-platform` `agents/enrichment/cuisine_lookup.json`).
   Live check: 29 vendors near 37.78,-122.40 → only 4 fall back to `"other"`.

## Action items

### Person 2 (Agents) — tracked in the GitHub issue "get_restaurants: mirror additive window params"
- `agents/fixtures/tool-schemas.json` → add optional `day`, `time_from`, `time_to` to
  the `get_restaurants` input schema and the `window` block to its `output_shape`.
- `agents/instructions/spot_scout.md` §4 → same, plus a line telling the agent to pass
  the user's stated setup window so it can use `open_by_cuisine` for demand-gap
  reasoning ("only 1 taco place open tonight").
- Optional: `agents/fixtures/payloads.mjs` → add a `window` example so the fixture
  server can demo it.
- **Non-breaking until you do this** — omitting the new params returns the §B.4 body
  byte-identical to before. Your evals (§A envelope) are unaffected; verified all six
  §B shapes + error envelopes locally after the change.

### Person 1 (Frontend) — optional, no breakage
- If the UI collects "when do you want to set up?", pass it through and render
  `window.open_by_cuisine` / `saturation_open`; otherwise ignore — base fields are
  unchanged.

## Verifying locally (no keys needed — fixture path)

```bash
cd functions/packages/rollaway/get_restaurants && npm test          # 18/18
node functions/scripts/invoke_local.js get_restaurants \
  '{"lat":37.78,"lng":-122.40,"radius_m":500,"day":"fri","time_from":"18:00","time_to":"22:00"}'
```

## Still open (pre-existing)

- Issue #1 — confirm `cite` id for the pushcart sidewalk-width rule.
- Issue #2 — `clearance_check` (agents) vs `check_clearance` (function) naming.
- Deploy steps unchanged: `functions/DEPLOY.md` (keys → `functions/.env` → doctl).
