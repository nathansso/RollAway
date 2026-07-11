/**
 * get_closures — CONTRACTS.md §B.2
 *
 * Sources, merged into one normalized closures[]:
 *  - SF Temporary Street Closures (Socrata 8x25-yybr)  -> source: "dpw_permit"
 *  - SFMTA weekly event-closure list                   -> source: "sfmta_event"
 *
 * SFMTA feed: SFMTA publishes its weekly closure list as a web page, not a
 * stable API. Set SFMTA_EVENTS_URL to a JSON mirror of it (shape documented in
 * data/sfmta_events.json); the file is cached for 6 h (SFMTA_TTL_MS) and
 * refetched on expiry. When the URL is unset or unreachable we fall back to
 * the bundled data/sfmta_events.json sample (clearly labeled synthetic,
 * TODO:replace-with-real-data) so event coverage degrades instead of vanishing.
 */

'use strict';

const path = require('path');
const {
  guard, ok,
  validatePoint, validateDate,
  fetchJSON, socrataHeaders, TTLCache, haversineMeters,
} = require('./shared');

const CLOSURES_URL = 'https://data.sfgov.org/resource/8x25-yybr.json';
const SFMTA_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — the source file updates weekly
const cache = new TTLCache();

let SFMTA_FALLBACK = { closures: [] };
try {
  SFMTA_FALLBACK = require(path.join(__dirname, 'data', 'sfmta_events.json'));
} catch { /* optional */ }

/** 'YYYY-MM-DD' for today in SF, plus a helper to add days. */
function sfDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** All [lng, lat] positions in a GeoJSON geometry, any nesting depth. */
function flattenCoords(geometry) {
  const out = [];
  (function walk(c) {
    if (!Array.isArray(c)) return;
    if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
      out.push(c);
      return;
    }
    for (const inner of c) walk(inner);
  })(geometry && geometry.coordinates);
  return out;
}

function geometryNear(geometry, lat, lng, radius_m) {
  return flattenCoords(geometry).some(
    ([gLng, gLat]) => haversineMeters(lat, lng, gLat, gLng) <= radius_m
  );
}

/** Socrata rows -> normalized closures. Date filter is done server-side. */
async function fetchSocrataClosures(dateFrom, dateTo) {
  const where =
    `start_dt <= '${dateTo}T23:59:59' AND end_dt >= '${dateFrom}T00:00:00'`;
  const url = `${CLOSURES_URL}?$where=${encodeURIComponent(where)}&$limit=5000`;
  const rows = await fetchJSON(url, { headers: socrataHeaders(), timeoutMs: 8000, retries: 2 });
  return rows
    .filter((r) => r.shape && r.shape.coordinates)
    .map((r) => ({
      id: `dpw-${r.objectid || r.case_num}`,
      reason: r.case_name || r.type || 'Street closure',
      source: 'dpw_permit',
      geometry: r.shape,
      active_from: r.start_dt || r.start_date,
      active_to: r.end_dt || r.end_date,
    }));
}

/**
 * SFMTA weekly event closures. Expected JSON shape (see data/sfmta_events.json):
 *   { "closures": [ { id, reason, geometry, active_from, active_to } ] }
 * Degrades: env URL unset/unreachable -> bundled sample; sample unusable -> [].
 */
async function fetchSfmtaClosures() {
  const raw = await cache.getOrSet('sfmta', SFMTA_TTL_MS, async () => {
    const url = process.env.SFMTA_EVENTS_URL;
    if (url) {
      try {
        return await fetchJSON(url, { timeoutMs: 8000, retries: 2 });
      } catch (err) {
        console.error('SFMTA feed degraded to bundled sample:', err.message);
      }
    }
    return SFMTA_FALLBACK;
  });
  const items = Array.isArray(raw && raw.closures) ? raw.closures : [];
  return items
    .filter((c) => c.geometry && c.geometry.coordinates)
    .map((c) => ({
      id: c.id || `sfmta-${c.reason}`,
      reason: c.reason || 'SFMTA event closure',
      source: 'sfmta_event',
      geometry: c.geometry,
      active_from: c.active_from,
      active_to: c.active_to,
    }));
}

exports.main = guard(async (args) => {
  const { lat, lng, radius_m } = validatePoint(args, { defaultRadius: 800, maxRadius: 5000 });
  const dateFrom = validateDate(args.date_from, 'date_from') || sfDate(0);
  const dateTo = validateDate(args.date_to, 'date_to') || sfDate(7);

  // Fetch both sources in parallel; a single source failing degrades the
  // response to the other source rather than failing the whole call.
  const [socrataRes, sfmtaRes] = await Promise.allSettled([
    fetchSocrataClosures(dateFrom, dateTo),
    fetchSfmtaClosures(),
  ]);
  if (socrataRes.status === 'rejected' && sfmtaRes.status === 'rejected') {
    throw socrataRes.reason; // both dead -> surface the envelope
  }
  if (socrataRes.status === 'rejected') {
    console.error('Socrata closures degraded:', socrataRes.reason.message);
  }

  const sfmtaInRange = (sfmtaRes.status === 'fulfilled' ? sfmtaRes.value : [])
    .filter((c) =>
      (!c.active_from || c.active_from.slice(0, 10) <= dateTo) &&
      (!c.active_to || c.active_to.slice(0, 10) >= dateFrom)
    );

  const closures = [
    ...(socrataRes.status === 'fulfilled' ? socrataRes.value : []),
    ...sfmtaInRange,
  ].filter((c) => geometryNear(c.geometry, lat, lng, radius_m));

  return ok({ closures, count: closures.length });
});
