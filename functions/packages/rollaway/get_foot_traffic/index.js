/**
 * get_foot_traffic — CONTRACTS.md §B.3
 *
 * Bay Wheels bike activity as a pedestrian-traffic PROXY (basis is always
 * "bay_wheels"; this is NOT a literal head count and Person 1 labels it as a
 * proxy in the UI).
 *
 * Sources:
 *  - live GBFS station_information (24 h TTL) + station_status (60 s TTL)
 *  - data/station_hourly.json — precomputed offline by
 *    scripts/aggregate_baywheels.js from a real month of trip CSVs
 *    (currently June 2026, 560k trips): station x day-of-week x hour ->
 *    avg trip starts+ends per hour ("events").
 *
 * Output semantics:
 *  - historical_avg : sum of avg events/hour at nearby stations for day+hour
 *  - live_activity  : bikes currently available at nearby stations (liveness
 *                     signal from station_status — live trip counts are not
 *                     published)
 *  - score (0-1)    : 0.7 * historical percentile (vs citywide p95 per
 *                     station-hour) + 0.3 * live dock churn balance (stations
 *                     that are neither empty nor full indicate turnover)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  guard, ok, UpstreamError,
  validatePoint, validateDay,
  fetchJSON, TTLCache, haversineMeters,
  withData, demoFetchOpts,
} = require('./shared');

const INFO_URL = 'https://gbfs.lyft.com/gbfs/1.1/bay/en/station_information.json';
const STATUS_URL = 'https://gbfs.lyft.com/gbfs/1.1/bay/en/station_status.json';
const INFO_TTL_MS = 24 * 60 * 60 * 1000; // stations don't move
const STATUS_TTL_MS = 60 * 1000;         // GBFS refreshes about once a minute
const cache = new TTLCache();

const HOURLY = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'station_hourly.json'), 'utf8')
);

// Phase 2 (docs/MIGRATION-PLAN.md §2a.3): station_hourly lives in Supabase so
// loading a new Bay Wheels month is a data operation, not a redeploy. The
// bundled station_hourly.json stays as the offline fallback; the §B.3 output
// contract is unchanged either way.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const SB_META_TTL_MS = 60 * 60 * 1000;

/**
 * Sum of avg events/hour at the nearby stations for day+hour, read from
 * Supabase station_hourly. Returns { historical_avg, p95 } or null so the
 * caller falls back to the bundled JSON (no Supabase env, table empty, or a
 * transient error).
 */
async function supabaseHourly(shortIds, day, hour) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || shortIds.length === 0) return null;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  const meta = await cache.getOrSet('sb_meta', SB_META_TTL_MS, () =>
    fetchJSON(`${SUPABASE_URL}/rest/v1/station_hourly_meta?select=*`, {
      timeoutMs: 4000, retries: 1, headers,
    })
  );
  if (!Array.isArray(meta) || meta.length === 0) return null; // not loaded yet
  const inList = shortIds.map((id) => `"${id}"`).join(',');
  const rows = await fetchJSON(
    `${SUPABASE_URL}/rest/v1/station_hourly` +
      `?station_short_id=in.(${encodeURIComponent(inList)})` +
      `&day_of_week=eq.${DAY_INDEX[day]}&hour=eq.${hour}` +
      '&select=station_short_id,avg_events',
    { timeoutMs: 4000, retries: 1, headers }
  );
  let sum = 0;
  for (const row of rows) sum += row.avg_events || 0;
  return {
    historical_avg: Math.round(sum * 10) / 10,
    p95: meta[0].p95_events_per_station_hour || 1,
  };
}

function sfNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return { day: get('weekday').toLowerCase(), hour: Number(get('hour')) % 24 };
}

exports.main = guard(async (args) => {
  const { lat, lng, radius_m } = validatePoint(args, { defaultRadius: 400, maxRadius: 2000 });
  const now = sfNow();
  const day = validateDay(args.day) || now.day;
  let hour = args.hour === undefined ? now.hour : Number(args.hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new UpstreamError('BAD_INPUT', `hour must be an integer 0-23 (got '${args.hour}').`);
  }

  // Honors DEMO_DATA_MODE; a live miss degrades to snapshot in ~2.5s.
  const body = await withData('get_foot_traffic', { lat, lng, radius_m, day, hour }, async () => {
    const info = await cache.getOrSet('info', INFO_TTL_MS, () =>
      fetchJSON(INFO_URL, { timeoutMs: 6000, retries: 2, ...demoFetchOpts() })
    );
    const nearby = info.data.stations.filter(
      (s) => haversineMeters(lat, lng, s.lat, s.lon) <= radius_m
    );

    // historical: precomputed avg events/hour for the requested day+hour —
    // Supabase station_hourly first, bundled JSON as the offline fallback.
    let historical_avg = 0;
    let p95Override = null;
    let fromSupabase = null;
    try {
      fromSupabase = await supabaseHourly(
        nearby.map((s) => s.short_name || s.station_id), day, hour
      );
    } catch (err) {
      console.error('supabase station_hourly degraded (bundled JSON):', err.message);
    }
    if (fromSupabase) {
      historical_avg = fromSupabase.historical_avg;
      p95Override = fromSupabase.p95;
    } else {
      for (const s of nearby) {
        const rec = HOURLY.stations[s.short_name] || HOURLY.stations[s.station_id];
        if (rec && rec[day]) historical_avg += rec[day][hour] || 0;
      }
      historical_avg = Math.round(historical_avg * 10) / 10;
    }

    // live: degrade to historical-only scoring if station_status is down
    let live_activity = 0;
    let liveBalance = null;
    try {
      const status = await cache.getOrSet('status', STATUS_TTL_MS, () =>
        fetchJSON(STATUS_URL, { timeoutMs: 6000, retries: 1, ...demoFetchOpts() })
      );
      const nearbyIds = new Set(nearby.map((s) => s.station_id));
      const capById = new Map(nearby.map((s) => [s.station_id, s.capacity || 0]));
      let balSum = 0;
      let balN = 0;
      for (const st of status.data.stations) {
        if (!nearbyIds.has(st.station_id) || !st.is_renting) continue;
        live_activity += st.num_bikes_available || 0;
        const cap = capById.get(st.station_id);
        if (cap > 0) {
          const fill = (st.num_bikes_available || 0) / cap;
          balSum += 1 - Math.abs(2 * fill - 1); // 1 at half-full, 0 at empty/full
          balN++;
        }
      }
      if (balN > 0) liveBalance = balSum / balN;
    } catch (err) {
      console.error('station_status degraded (historical-only score):', err.message);
    }

    // score: historical percentile vs citywide p95 activity for this many stations
    const p95 = p95Override || HOURLY.meta.p95_events_per_station_hour || 1;
    const histScore = nearby.length === 0
      ? 0
      : Math.min(1, historical_avg / (p95 * nearby.length));
    const score = liveBalance === null
      ? Math.round(histScore * 100) / 100
      : Math.round((0.7 * histScore + 0.3 * liveBalance) * 100) / 100;

    return {
      score,
      basis: 'bay_wheels',
      nearby_stations: nearby.length,
      live_activity,
      historical_avg,
    };
  });

  return ok(body);
});
