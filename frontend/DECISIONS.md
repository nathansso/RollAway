# Frontend map-app decisions

1. **The native UI contract is `recommend_spots` v2.** Components render a strict
   `RecommendationSpot` with rank, block label, verdict, foot-traffic proxy, menu/price
   overlap, legality citation, closure context, and travel time.
2. **Compatibility lives only in `lib/apiClient.ts`.** The boundary accepts the planned
   `{spots, score_breakdown}` orchestrator response, the normalized frontend v2 response,
   or the frozen `/chat` `map_actions` envelope. Components never branch on these shapes;
   markdown and chat prose are discarded.
3. **The native backend contract is not frozen in shared `docs/CONTRACTS.md` yet.**
   Frontend v2 is therefore documented and defended locally until Persons 2/3 publish
   the final orchestrator shape. Requests send `{user_profile, when, location}`, matching
   the implementation outline; the live endpoint is configured by
   `VITE_RECOMMEND_SPOTS_URL`.
4. **Fixture mode is the demo authority.** With `VITE_USE_FIXTURES=true`, recommendations,
   vendors, closures, and permit guidance are imported locally and no API `fetch` occurs.
   Selected date, time label, location, and price tier are applied deterministically to
   the canned scenario. Optional artificial latency demonstrates the truck loader.
5. **The shared SoMa scenario remains stable:** 2nd & Howard, Folsom & 1st, Mission &
   5th, Friday lunch. Bay Wheels is explicitly described as an estimate/proxy.
6. **Profile schema version 1 is local-only.** Corrupt, incomplete, future, and
   misspelled vendor-type data is rejected safely. State updates precede best-effort
   localStorage writes, so quota/security failures do not discard current work.
7. **`pushcart_nocook` is canonical.** The obsolete outline spelling
   `pushcart_no_cook` is never persisted or sent.
8. **Mapbox is progressive enhancement in live mode.** Fixture mode always uses the
   polished SoMa schematic so its zero-network guarantee includes map tiles. In live
   mode, a public token enables Mapbox and failures fall back to the same schematic.
9. **Permit order is product-defined:** Public Works, Public Health, Fire, Treasurer.
   This differs from the old prose fixture and follows the current mission requirement.
10. **EasyApply is a review workflow, not submission.** It pre-fills local profile data,
    labels field provenance, requires edits and explicit confirmation, and ends at
    “Simulated packet ready.” No binding endpoint is implied.
11. **No remote fonts are loaded.** System UI and Georgia fallbacks preserve the warm
    visual hierarchy while keeping fixture/PWA startup independent of font CDNs.
12. **Warm RollAway tokens stay in use.** Orange remains the brand action color, blue is
    location/data emphasis, and status labels always combine text/icon with color.
