# Person 3 — Functions & Data Setup Guide (branch `feat/functions-data`)

Everything you need to build the agents' hands: five DigitalOcean Functions over live SF data,
plus the clearance-geometry check (the law as code).
Your task list is `PERSON3_FUNCTIONS_TASKS.md`. Your contract is `docs/CONTRACTS.md` **§B**
(on `main`) — every Function's input/output must match it exactly. Read it first.

---

## 1. Prerequisites (install these)

| Tool | Version | Install (macOS) | Why |
|---|---|---|---|
| doctl | latest | `brew install doctl` | DO CLI |
| doctl serverless | plugin | `doctl serverless install` | deploy/test DO Functions |
| Node.js | ≥ 20 LTS | `brew install node@20` | Functions runtime (nodejs:18/20) |
| jq | any | `brew install jq` | inspect API responses |
| Git | recent | `brew install git` | — |

```bash
doctl auth init                        # paste your DO API token
doctl serverless connect               # connect to the team namespace (create one if none)
doctl serverless status                # verify
```

## 2. Accounts & keys you need

| Account | What to get | Where | Cost |
|---|---|---|---|
| **DigitalOcean** | Team invite + Functions namespace | ask Dat | hackathon credits |
| **Google Cloud** | Places API key (enable "Places API") | console.cloud.google.com | free tier — set a quota cap so a bug can't bill you |
| **Ticketmaster** | Discovery API key | developer.ticketmaster.com | free tier |
| SF Open Data (optional) | Socrata app token | data.sfgov.org → profile → app tokens | free — lifts anonymous rate limits, recommended |
| Bay Wheels | none — GBFS feed is open | gbfs.baywheels.com/gbfs/gbfs.json | free |

**Secrets go in DO Functions env config (`project.yml` env + `doctl serverless deploy`), never
in code or git.** Commit a `.env.example` listing key names only.

## 3. Get the code

```bash
git clone <repo-url> RollAway
cd RollAway
git checkout feat/functions-data
```

Target layout (one packaged function per §B tool):

```
functions/
  project.yml                  # DO serverless project spec (packages, env, limits)
  packages/rollaway/
    get_vendors/       index.js + package.json
    get_closures/      ...
    get_foot_traffic/  ... + data/station_hourly.json   (precomputed aggregate)
    get_restaurants/   ...
    get_events/        ...
    check_clearance/   ... + data/{schools,hydrants}.geojson
  scripts/
    aggregate_baywheels.js     # offline: trip CSVs -> station_hourly.json
    fetch_static_data.js       # offline: schools + hydrants -> geojson
```

## 4. Your data sources (bookmark these)

| Source | Endpoint | Used by |
|---|---|---|
| Mobile Food Permits | `https://data.sfgov.org/resource/rqzj-sfat.json` | get_vendors |
| Mobile Food Schedule | `https://data.sfgov.org/resource/jjew-r69b.json` | get_vendors |
| Temporary Street Closures | `https://data.sfgov.org/resource/8x25-yybr.json` | get_closures |
| SFMTA event closure list | sfmta.com (find the weekly closure page/file; cache it) | get_closures |
| Bay Wheels GBFS | `https://gbfs.baywheels.com/gbfs/gbfs.json` (→ station_status) | get_foot_traffic |
| Bay Wheels trip CSVs | `https://s3.amazonaws.com/baywheels-data/` (grab 1 recent month) | aggregate script |
| Google Places Nearby Search | Places API | get_restaurants, check_clearance |
| Ticketmaster Discovery | `https://app.ticketmaster.com/discovery/v2/events` | get_events |
| SF schools (for 500ft rule) | search data.sfgov.org "schools" dataset | check_clearance |
| SF fire hydrants (7ft rule) | search data.sfgov.org "hydrants" (fallback: skip + document) | check_clearance |

Socrata tip: all SF datasets speak SoQL —
`?$where=within_circle(location, {lat}, {lng}, {radius_m})` does your radius filter server-side.

## 5. Build → test → deploy loop

```bash
# local invoke (no deploy):
doctl serverless functions invoke rollaway/get_vendors \
  -p lat:37.78 -p lng:-122.40 -p radius_m:500 -p day:fri -p time:12:00

# deploy everything in project.yml:
doctl serverless deploy functions

# get public URLs (hand these to Person 2):
doctl serverless functions get rollaway/get_vendors --url
```

Every function: validate input first (`BAD_INPUT`), wrap upstream calls in timeout+retry
(`UPSTREAM_TIMEOUT`), return the §B shape or the common error envelope — never a raw stack trace.

## 6. Offline precompute (do once, early)

1. **Bay Wheels aggregate:** download one recent month of trip CSVs, run
   `scripts/aggregate_baywheels.js` → `station_hourly.json` (station × day-of-week × hour →
   avg trips). Ship it inside `get_foot_traffic`'s package; the live GBFS call layers on top.
2. **Static geo:** `scripts/fetch_static_data.js` → schools + hydrants GeoJSON, shipped inside
   `check_clearance`. These datasets don't change during a hackathon — snapshot, don't fetch live.
3. **Cuisine lookup:** Person 2 hands you `cuisine_lookup.json` (permit_id → cuisine).
   `get_vendors` joins on it; return `"other"` for missing ids until it arrives.

## 7. Clearance geometry — the invariant

This is the feature the whole pitch leans on: **the law is computed, not guessed.**
- Use turf.js (`@turf/distance`, `@turf/nearest-point`) — geodesic, not naive lat/lng deltas.
- Feet, not meters, in the output (`required_ft`, `actual_ft`) — the rules are written in feet.
- `cite` ids must match Person 2's KB source-id list — **get that list from them before hardcoding.**
- Unit-test with fixtures: a point 50ft from a restaurant entrance MUST fail the 75ft check.
  `npm test` inside `check_clearance/` should run without deploying.

## 8. First deliverable (unblocks everyone)

`get_vendors` with `?format=geojson` → send the URL to **Person 1** (map seed layer) and
**Person 2** (their most-used tool). Ship it rough on day 1, polish after.

## 9. Who to talk to

| Need | Person |
|---|---|
| KB source-id list for `cite`, cuisine lookup file, tool registration | **Person 2** |
| GeoJSON shape for the map seed, `status` value list | **Person 1** |
| Contract changes forced by real API shapes | edit `docs/CONTRACTS.md` §B, ping Person 2 **before** deploying |

## 10. Done =

`PERSON3_FUNCTIONS_TASKS.md` Definition of Done. Build order: `get_vendors` →
`get_closures` + `check_clearance` → `get_foot_traffic` + `get_restaurants` → `get_events`.
