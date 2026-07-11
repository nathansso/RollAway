# Deploy handoff: `recommend_spots` (issues #17 / #14 backend)

**For:** Dat (owns the shared DO Functions namespace)
**From:** Nate — branch `feat/live-recommendations-17-14` (PR #23 → base `feat/landing-page`)
**Why you and not me:** the deploy pushes the whole `project.yml` into the shared
namespace and substitutes env from `functions/.env`. My local `.env` is missing the
production keys you have, so a deploy from my machine would **blank out your live keys**
and overwrite all 7 functions. Running it from your machine (where `functions/.env` is
fully populated) avoids that. See "Why this is the safe path" below.

---

## TL;DR — what changed
- `recommend_spots` was rewritten: **range sampler → Google Distance Matrix (traffic-aware)
  filter ≤ max_travel_minutes → strength-ranked top 5 → reverse-geocoded address.**
  Google Distance Matrix is now primary for travel time; Mapbox remains the fallback.
- **One new env var** the namespace needs: `GOOGLE_MAPS_SERVER_KEY` (server-side Google key
  with **Distance Matrix API** + **Geocoding API** enabled, **no** HTTP-referrer restriction).
- No other function's runtime behavior changed. `project.yml` gained the one new var line.

## Files changed (all committed on the branch)
```
functions/packages/rollaway/recommend_spots/index.js         (rewired orchestrator)
functions/packages/rollaway/recommend_spots/google_travel.js (NEW — Distance Matrix)
functions/packages/rollaway/recommend_spots/geocode.js       (NEW — reverse geocode)
functions/packages/rollaway/recommend_spots/candidates.js    (added makeRangeCandidates)
functions/project.yml                                        (+ GOOGLE_MAPS_SERVER_KEY)
functions/.env.example                                       (documents the new var)
```

## The one env var to add
`recommend_spots` reads `process.env.GOOGLE_MAPS_SERVER_KEY` in `index.js` (Distance Matrix
+ Geocoding). `project.yml` already substitutes it:
```yaml
GOOGLE_MAPS_SERVER_KEY: "${GOOGLE_MAPS_SERVER_KEY}"
```
So your **`functions/.env` must contain** a real value:
```
GOOGLE_MAPS_SERVER_KEY=<server key: Distance Matrix API + Geocoding API enabled, NO referrer restriction>
```
Nate has the key value — ping him for it (39 chars). If unset, the function still runs but
skips traffic filtering and returns `null` addresses (graceful degrade, not a crash).

> **Do not reuse the referrer-restricted browser key here.** That key is locked to a web
> origin and Distance Matrix/Geocoding calls from the server will 403. This must be a
> separate server-only key.

---

## Deploy steps (run from your machine)
```bash
# 1. Get the branch
git fetch origin
git checkout feat/live-recommendations-17-14

# 2. Make sure functions/.env is complete on YOUR machine:
#    - all your existing keys (SOCRATA_APP_TOKEN, GOOGLE_PLACES_KEY, MAPBOX_TOKEN, etc.)
#    - PLUS the new line:  GOOGLE_MAPS_SERVER_KEY=<value from Nate>
#    Verify none of your production keys are blank:
grep -E '^(SOCRATA_APP_TOKEN|GOOGLE_PLACES_KEY|MAPBOX_TOKEN|GOOGLE_MAPS_SERVER_KEY)=' functions/.env

# 3. Connect to the shared namespace (skip if already connected)
doctl serverless connect <your-namespace>

# 4. Deploy the project
cd functions
doctl serverless deploy .

# 5. Grab the recommend_spots URL
doctl serverless functions get rollaway/recommend_spots --url
```

Then send Nate that URL — it becomes `VITE_RECOMMEND_SPOTS_URL` in the frontend so the app
runs live instead of on fixtures.

## Smoke test after deploy
```bash
URL=$(doctl serverless functions get rollaway/recommend_spots --url)
curl -s -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -d '{"user_profile":{"vendor_type":"truck","menu":{"items":[{"name":"Tacos","keywords":["tacos"],"price":5}]},"max_travel":{"value":15,"unit":"minutes"}},"when":{"day":"fri","time":"12:00","date_from":"2026-07-17","date_to":"2026-07-17"},"location":{"lat":37.7793,"lng":-122.4013,"radius_m":500}}' \
  | python -m json.tool | head -40
```
**Expect:** 5 spots, each with a real `address` string and `score_breakdown.travel_minutes ≤ 15`.
- If addresses are `null` → `GOOGLE_MAPS_SERVER_KEY` isn't set or Geocoding API isn't enabled.
- If travel minutes look like straight-line estimates → Distance Matrix key/API issue; it fell
  back to the Mapbox/haversine path.

## Why this is the safe path (context, not a warning to ignore)
`doctl serverless deploy .` deploys **every** function in `project.yml` and injects env from
`functions/.env` at deploy time. Two consequences on a shared namespace:
1. All 7 functions get replaced with this branch's code — fine, since this branch is current
   for the whole `rollaway` package, but worth knowing.
2. Any env var that's **empty** in the deploying machine's `functions/.env` is pushed as empty,
   overwriting whatever the namespace had. That's exactly why this runs from your machine (keys
   populated) rather than mine (keys blank). Confirm step 2 above before deploying.

---

*Verification already done locally against the real Google APIs: 5 spots, all ≤15 min
traffic-aware, real geocoded addresses, strength-ranked (a 7.7-min spot outranked a 0.2-min
spot — proving strength-over-proximity). This handoff is only the namespace deploy.*
