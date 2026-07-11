# get_foot_traffic

CONTRACTS.md **§B.3** — Bay Wheels bike activity around a point as a
**pedestrian-traffic proxy**. `basis` is always `"bay_wheels"`; this is never
a literal head count (Person 1 must label it as a proxy in the UI).

## What it queries
| Source | TTL | Used for |
|---|---|---|
| GBFS `station_information` (gbfs.lyft.com/gbfs/1.1/bay) | 24 h | station locations/capacity, `nearby_stations` |
| GBFS `station_status` | 60 s | `live_activity` + live churn-balance signal |
| `data/station_hourly.json` | shipped in package | `historical_avg` — precomputed by `scripts/aggregate_baywheels.js` from **June 2026 real trip data (560,299 trips, 640 stations)** |

## Output semantics (documented honesty)
- `historical_avg` — sum over nearby stations of average trip **events**
  (starts + ends) per hour for the requested `day` + `hour`.
- `live_activity` — bikes currently available at nearby renting stations
  (GBFS publishes stock, not live trip counts).
- `score` (0–1) — `0.7 × historical percentile` (vs the citywide p95 of
  per-station-hour activity) `+ 0.3 × live balance` (stations near half-full
  indicate churn; empty/full stations don't). If `station_status` is down the
  score degrades to historical-only rather than failing.

## Input
`lat`, `lng` (required), `radius_m` (default 400, max 2000),
`day` (`mon`..`sun`, default: now in SF), `hour` (0–23, default: now in SF).

## Regenerating the aggregate
```
# real data (preferred): grab a recent month from s3.amazonaws.com/baywheels-data
node functions/scripts/aggregate_baywheels.js 202606-baywheels-tripdata.csv
# emergency fallback only: fabricated pattern, marked meta.synthetic=true
node functions/scripts/aggregate_baywheels.js --synthetic
```

## Errors
`BAD_INPUT` (coords/radius/day/hour), `UPSTREAM_TIMEOUT`/`RATE_LIMIT` only if
`station_information` itself is unreachable (status degrades gracefully).

## Test locally
```
node functions/scripts/invoke_local.js get_foot_traffic '{"lat":37.78,"lng":-122.40,"radius_m":400,"day":"fri","hour":12}'
```

> **Demo reliability:** honors `DEMO_DATA_MODE` (reads a frozen snapshot from `demo_data/`); in live mode a transient upstream miss fail-fast-degrades to that snapshot in ~2.5s (`shared.js` `withData`/`demoFetchOpts`).
