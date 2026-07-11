# get_vendors

CONTRACTS.md **§B.1** — SF mobile food vendors near a point, with schedule join.

## What it queries
| Source | Dataset | Used for |
|---|---|---|
| SF Mobile Food Facility Permits | `rqzj-sfat` (Socrata) | vendor identity, type, status, point — radius filtered server-side via SoQL `within_circle(location, lat, lng, radius_m)` |
| SF Mobile Food Schedule | `jjew-r69b` (Socrata) | `scheduled_here` + `schedule_window` for the requested `day`/`time` (rows joined on `permit` + location within 60 m) |
| `data/cuisine_lookup.json` | Person 2 | `permit_id -> cuisine` (§C enum). Missing/invalid ids return `"other"`. Replace this file when Person 2 delivers it. |

## Input
`lat`, `lng` (required in JSON mode), `radius_m` (default 500, max 5000),
`day` (`mon`..`sun`, defaults to today in SF), `time` (`HH:MM`, optional),
`format` (`json` default | `geojson`).

- With `time`: `scheduled_here` means a schedule window at this location covers that time.
- Without `time`: `scheduled_here` means the vendor has any window at this location that day.

## GeoJSON seed mode (for Person 1)
`?format=geojson` returns a `FeatureCollection` of **APPROVED** vendors.
Omit `lat`/`lng` entirely in geojson mode to get the **citywide seed layer**:

```
GET <fn-url>?format=geojson
```

## Caching
Per-warm-container TTL cache, **10 min**, keyed by rounded point + radius + day + time
(citywide seed cached under its own key). Socrata is open data; set
`SOCRATA_APP_TOKEN` to lift anonymous rate limits.

## Errors
Common envelope: `BAD_INPUT` (bad/out-of-SF coords, bad day/time/format, radius cap),
`UPSTREAM_TIMEOUT` / `RATE_LIMIT` from Socrata. If only the schedule dataset fails,
the response degrades (vendors returned, `scheduled_here: false`) instead of failing.

## Test locally (no deploy)
```
node functions/scripts/invoke_local.js get_vendors '{"lat":37.78,"lng":-122.40,"radius_m":500,"day":"fri","time":"12:00"}'
```

## Deploy
See `functions/DEPLOY.md`. After deploy:
```
doctl serverless functions invoke rollaway/get_vendors -p lat:37.78 -p lng:-122.40 -p radius_m:500 -p day:fri -p time:12:00
doctl serverless functions get rollaway/get_vendors --url
```
