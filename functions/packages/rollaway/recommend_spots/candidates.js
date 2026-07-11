/**
 * candidates.js — candidate-point generation and the EXACT per-signal argument
 * objects recommend_spots passes to each sibling Function.
 *
 * This is the single source of truth so `index.js` (reads snapshots) and
 * `scripts/freeze_snapshots.mjs` (writes snapshots) can NEVER drift on the
 * snapshotKey — the same class of bug that bit the team on tool names
 * (DECISIONS.md D13/D14). Both import `makeCandidates` + `signalArgs` from here.
 */

'use strict';

const MAX_CANDIDATES = 3;
const EVENTS_RADIUS_M = 3000;   // events search is deliberately wider than the spot radius
const SETUP_WINDOW_HOURS = 2;   // planned setup-window length passed to get_restaurants

// Deterministic candidate ring: anchor + two offsets (~120 m, ~250 m).
const CANDIDATE_OFFSETS = [
  { bearing: 0, dist: 0 },
  { bearing: 60, dist: 120 },
  { bearing: 210, dist: 250 },
];

const round5 = (n) => Math.round(n * 1e5) / 1e5;

/** Great-circle destination point `distM` along `bearingDeg` from (lat,lng). */
function offsetPoint(lat, lng, bearingDeg, distM) {
  if (distM === 0) return { lat: round5(lat), lng: round5(lng) };
  const R = 6371008.8;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const dr = distM / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(br) * Math.sin(dr) * Math.cos(lat1),
    Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: round5((lat2 * 180) / Math.PI), lng: round5((lng2 * 180) / Math.PI) };
}

/** Up to 3 deterministic candidates around a location. */
function makeCandidates(location) {
  return CANDIDATE_OFFSETS.slice(0, MAX_CANDIDATES).map((o, i) => ({
    id: `spot-${i + 1}`,
    point: offsetPoint(location.lat, location.lng, o.bearing, o.dist),
    block_label: null, // filled after signals
  }));
}

function addHoursHHMM(hhmm, h) {
  const [H, M] = String(hhmm).split(':').map(Number);
  const t = (((H + h) % 24) + 24) % 24;
  return `${String(t).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}

/**
 * The exact args passed to each sibling Function for a candidate `point`.
 * ctx = { day, time, hour, date_from, date_to, radius_m, vendor_type }.
 * IMPORTANT: the fields here define the snapshotKey — keep them identical on the
 * read side (index.js) and the write side (freeze_snapshots.mjs).
 */
function signalArgs(point, ctx) {
  const { lat, lng } = point;
  const time_to = addHoursHHMM(ctx.time, SETUP_WINDOW_HOURS);
  return {
    get_vendors: { lat, lng, radius_m: ctx.radius_m, day: ctx.day, time: ctx.time },
    get_closures: { lat, lng, radius_m: ctx.radius_m, date_from: ctx.date_from, date_to: ctx.date_to },
    get_restaurants: { lat, lng, radius_m: ctx.radius_m, day: ctx.day, time_from: ctx.time, time_to },
    get_foot_traffic: { lat, lng, radius_m: ctx.radius_m, day: ctx.day, hour: ctx.hour },
    get_events: { lat, lng, radius_m: EVENTS_RADIUS_M, date_from: ctx.date_from, date_to: ctx.date_to },
    check_clearance: { lat, lng, vendor_type: ctx.vendor_type },
  };
}

module.exports = {
  MAX_CANDIDATES, EVENTS_RADIUS_M, SETUP_WINDOW_HOURS,
  offsetPoint, makeCandidates, signalArgs, addHoursHHMM,
};
