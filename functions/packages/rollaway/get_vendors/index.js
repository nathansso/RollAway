/**
 * get_vendors — CONTRACTS.md §B.1
 *
 * Sources:
 *  - SF Mobile Food Facility Permits  https://data.sfgov.org/resource/rqzj-sfat.json
 *  - SF Mobile Food Schedule          https://data.sfgov.org/resource/jjew-r69b.json
 *  - data/cuisine_lookup.json         (Person 2's permit_id -> §C cuisine map; "other" if missing)
 *
 * Modes:
 *  - default (JSON tool mode): §B.1 shape { vendors: [...], count }
 *  - ?format=geojson: FeatureCollection seed layer for Person 1's map.
 *    In geojson mode lat/lng are OPTIONAL — omitting them returns the citywide
 *    layer of all APPROVED vendors (the "first map render" seed).
 */

'use strict';

const path = require('path');
const {
  guard, ok, UpstreamError,
  validatePoint, validateDay, validateTime,
  fetchJSON, socrataHeaders, TTLCache, haversineMeters, DAY_FULL,
} = require('./shared');

const PERMITS_URL = 'https://data.sfgov.org/resource/rqzj-sfat.json';
const SCHEDULE_URL = 'https://data.sfgov.org/resource/jjew-r69b.json';

// §C enum — Person 2 owns this list; anything else degrades to 'other'.
const CUISINES = new Set([
  'tacos', 'burritos', 'burgers', 'hot_dogs', 'sandwiches', 'coffee',
  'ice_cream', 'bbq', 'asian', 'halal', 'pizza', 'seafood', 'desserts',
  'drinks', 'other',
]);

// permit_id -> cuisine, provided by Person 2. Missing/invalid ids -> 'other'.
let CUISINE_LOOKUP = {};
try {
  CUISINE_LOOKUP = require(path.join(__dirname, 'data', 'cuisine_lookup.json'));
} catch { /* file optional until Person 2 delivers it */ }

// Same-permit schedule rows are matched to a permit location within this
// distance (a permit can have several approved locations).
const LOCATION_MATCH_M = 60;

// Cache TTLs (per warm container): the citywide seed layer changes rarely.
const SEED_TTL_MS = 10 * 60 * 1000; // 10 min
const cache = new TTLCache();

function cuisineFor(permitId) {
  const c = CUISINE_LOOKUP[permitId];
  return CUISINES.has(c) ? c : 'other';
}

/** Current day-of-week key ('mon'..'sun') in San Francisco. */
function sfToday() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', timeZone: 'America/Los_Angeles',
  }).format(new Date()).toLowerCase();
}

function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

async function fetchPermits({ lat, lng, radius_m }) {
  let where;
  if (lat === null) {
    where = `status='APPROVED'`; // citywide seed layer
  } else {
    where = `within_circle(location, ${lat}, ${lng}, ${radius_m})`;
  }
  const url = `${PERMITS_URL}?$where=${encodeURIComponent(where)}&$limit=2000`;
  const rows = await fetchJSON(url, { headers: socrataHeaders(), timeoutMs: 8000, retries: 2 });
  return rows.filter((r) => r.latitude && r.longitude && r.permit);
}

/**
 * Fetch schedule rows for the given permits on the given day.
 * Degrades to an empty schedule (scheduled_here=false everywhere) if the
 * schedule dataset is unreachable — partial data beats a failed response.
 */
async function fetchSchedules(permitIds, dayKey) {
  if (permitIds.length === 0) return [];
  const all = [];
  const CHUNK = 40; // keep the SoQL IN(...) clause a sane length
  for (let i = 0; i < permitIds.length; i += CHUNK) {
    const chunk = permitIds.slice(i, i + CHUNK);
    const list = chunk.map((p) => `'${p.replace(/'/g, "''")}'`).join(',');
    const where = `permit in(${list}) AND dayofweekstr='${DAY_FULL[dayKey]}'`;
    const url = `${SCHEDULE_URL}?$where=${encodeURIComponent(where)}&$limit=2000`;
    try {
      all.push(...await fetchJSON(url, { headers: socrataHeaders(), timeoutMs: 8000, retries: 1 }));
    } catch (err) {
      console.error('schedule fetch degraded:', err.message);
      return all; // partial (possibly empty) schedule info
    }
  }
  return all;
}

function buildVendor(row, schedules, timeMin) {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  // schedule rows for this permit at (approximately) this location
  const here = schedules.filter((s) =>
    s.permit === row.permit &&
    s.latitude && s.longitude &&
    haversineMeters(lat, lng, Number(s.latitude), Number(s.longitude)) <= LOCATION_MATCH_M
  );
  let scheduled_here = false;
  let schedule_window = null;
  if (here.length > 0) {
    // prefer the window containing the requested time, else the first one
    let win = here[0];
    if (timeMin !== null) {
      const containing = here.find((s) => {
        const start = parseHHMM(s.start24);
        const end = parseHHMM(s.end24);
        return start !== null && end !== null && start <= timeMin && timeMin < end;
      });
      scheduled_here = Boolean(containing);
      if (containing) win = containing;
    } else {
      scheduled_here = true; // scheduled at this spot on the requested day
    }
    if (win.start24 && win.end24) schedule_window = `${win.start24}-${win.end24}`;
  }
  return {
    permit_id: row.permit,
    name: row.applicant || 'Unknown vendor',
    type: row.facilitytype || 'Unknown',
    cuisine: cuisineFor(row.permit),
    status: row.status || 'UNKNOWN',
    point: { lat, lng },
    scheduled_here,
    schedule_window,
  };
}

function toGeoJSON(vendors) {
  return {
    type: 'FeatureCollection',
    features: vendors.map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [v.point.lng, v.point.lat] },
      properties: {
        permit_id: v.permit_id,
        name: v.name,
        type: v.type,
        cuisine: v.cuisine,
        status: v.status,
        scheduled_here: v.scheduled_here,
        schedule_window: v.schedule_window,
      },
    })),
  };
}

exports.main = guard(async (args) => {
  const format = String(args.format || 'json').toLowerCase();
  if (format !== 'json' && format !== 'geojson') {
    throw new UpstreamError('BAD_INPUT', "format must be 'json' or 'geojson'.");
  }

  const citywide = format === 'geojson' && args.lat === undefined && args.lng === undefined;
  let point = { lat: null, lng: null, radius_m: null };
  if (!citywide) {
    point = validatePoint(args, { defaultRadius: 500, maxRadius: 5000 });
  }
  const day = validateDay(args.day) || sfToday();
  const timeMin = validateTime(args.time);

  const cacheKey = citywide
    ? `seed:${day}:${timeMin}`
    : `v:${point.lat.toFixed(4)}:${point.lng.toFixed(4)}:${point.radius_m}:${day}:${timeMin}`;

  const vendors = await cache.getOrSet(cacheKey, SEED_TTL_MS, async () => {
    const permits = await fetchPermits(point);
    const schedules = await fetchSchedules(
      [...new Set(permits.map((r) => r.permit))],
      day
    );
    return permits.map((row) => buildVendor(row, schedules, timeMin));
  });

  if (format === 'geojson') {
    // Seed layer for the map: permitted (APPROVED) vendors only.
    return ok(toGeoJSON(vendors.filter((v) => v.status === 'APPROVED')));
  }
  return ok({ vendors, count: vendors.length });
});
