# get_events

CONTRACTS.md **§B.5** (growth pillar) — ticketed events near a point within a
date range.

## What it queries
**Ticketmaster Discovery v2** `/events.json` (`latlong` + `radius` in miles +
`startDateTime`/`endDateTime`, sorted by date). Reads the key from
**`TICKETMASTER_KEY`**.

- Filtered to venues whose city is **San Francisco**, then radius-filtered by
  the venue point, capped at **20** results.
- **Dates are strictly San Francisco-local** (`America/Los_Angeles`): an event
  is in range when its Pacific calendar date is within `[date_from, date_to]`.
  The upstream query is widened ±1 UTC day and results are then filtered on the
  venue's `localDate`, so a late-evening Pacific event near a boundary is
  neither dropped nor allowed to leak in from the adjacent day (Pacific is
  UTC−7/−8). Events without a date are excluded.
- `expected_attendance`: Ticketmaster publishes no attendance figures, so
  known SF venues are mapped to capacity (Oracle Park 40,000, Chase Center
  18,064, Bill Graham 8,500, …see `VENUE_CAPACITY` in index.js); unknown
  venues return `null` — never a guessed number.
- `start` is venue-local ISO (`localDate` + `localTime`).

**Without the key** the bundled `data/sample_events.json` fixture is served
(`_synthetic`, `TODO(real-key)`) with dates projected into the requested range.
Upstream failures also degrade to the fixture — never a 500.

## Caching (documented TTL)
**30 min** per warm container, keyed by rounded point + radius + date range.

## Input
`lat`, `lng` (required), `radius_m` (default 3000, max 10000),
`date_from`, `date_to` (`YYYY-MM-DD`, default today .. today+7 SF time).

## Test locally
```
node functions/scripts/invoke_local.js get_events '{"lat":37.78,"lng":-122.40,"radius_m":3000,"date_from":"2026-07-11","date_to":"2026-07-13"}'
```

> **Demo reliability:** honors `DEMO_DATA_MODE` (reads a frozen snapshot from `demo_data/`); in live mode a transient upstream miss fail-fast-degrades to that snapshot in ~2.5s (`shared.js` `withData`/`demoFetchOpts`).

## Public event contact fields

Each event includes `event_url` and `promoter_name`. `event_url` is copied only from the
Ticketmaster event record. `promoter_name` is copied only from Ticketmaster promoter data and is
`null` when absent. The Function never invents email or phone contact fields.
