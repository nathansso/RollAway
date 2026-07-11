# get_closures

CONTRACTS.md **§B.2** — street closures near a point within a date range,
merged from two sources into one normalized `closures[]`.

## What it queries
| Source | How | `source` value |
|---|---|---|
| SF Temporary Street Closures (Socrata `8x25-yybr`) | date-range filtered server-side on `start_dt`/`end_dt`; geometry from the dataset's `shape` field | `dpw_permit` |
| SFMTA weekly event-closure list | `SFMTA_EVENTS_URL` env var pointing at a JSON mirror (shape below), cached **6 h** | `sfmta_event` |

SFMTA publishes the weekly list as a web page, not an API, so this function
expects a JSON mirror at `SFMTA_EVENTS_URL`:

```json
{ "closures": [ { "id": "...", "reason": "...", "geometry": { GeoJSON }, "active_from": "...", "active_to": "..." } ] }
```

Until that URL is configured, the bundled `data/sfmta_events.json` sample is
used (clearly labeled `_synthetic`, `TODO:replace-with-real-data`).

## Input
`lat`, `lng` (required), `radius_m` (default 800, max 5000),
`date_from`, `date_to` (`YYYY-MM-DD`; default today .. today+7 in SF time).

## Radius filtering
Closure geometries are LineStrings/Polygons; a closure is "near" if **any
vertex** of its geometry is within `radius_m` (haversine). SF block segments
are short (~100 m), so vertex distance is accurate at these radii.

## Caching / degradation
- SFMTA file: 6 h TTL per warm container (source updates weekly).
- If one source fails, the other's closures are still returned (partial data
  beats total failure). Only when both fail does the error envelope surface.

## Errors
`BAD_INPUT` (coords/radius/date format), `UPSTREAM_TIMEOUT`, `RATE_LIMIT`.

## Test locally
```
node functions/scripts/invoke_local.js get_closures '{"lat":37.78,"lng":-122.40,"radius_m":800,"date_from":"2026-07-10","date_to":"2026-07-13"}'
```

> **Demo reliability:** honors `DEMO_DATA_MODE` (reads a frozen snapshot from `demo_data/`); in live mode a transient upstream miss fail-fast-degrades to that snapshot in ~2.5s (`shared.js` `withData`/`demoFetchOpts`).
