/**
 * recommend_spots — the orchestrator (AGENT-BRIEF §4). Gathers every signal for
 * up to 3 candidate spots IN PARALLEL, computes the DETERMINISTIC score (code
 * does math + law), calls Spot Scout at most ONCE for the "why" prose (no router
 * turn), and returns all 3 candidates shaped for the frontend (§4g).
 *
 * Input  (§4a): { user_profile:{ vendor_type, menu?, max_travel_minutes, travel_mode },
 *                 when:{ day, time, hour, date_from, date_to },
 *                 location:{ lat, lng, radius_m } }
 * Output (§4g): { spots: [ { rank, id, point, block_label, verdict, score,
 *                 eliminated, violations, score_breakdown, why_one_line } ] }
 *
 * Missing when/location/limits default from demo_data/scenario.json so the
 * function is runnable with a bare vendor_type.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  guard, ok, UpstreamError, VENDOR_TYPES, DAY_FULL,
  isDemoMode, loadSnapshot, snapshotKey, fetchJSON, demoFetchOpts, haversineMeters,
} = require('./shared');
const { travelMatrix } = require('./travel');
const { menuCompetition } = require('./menu_competition');
const { scoreCandidate } = require('./score');

// ---- Scenario defaults -----------------------------------------------------
let SCENARIO = {
  anchor: { lat: 37.78, lng: -122.40 },
  when: { day: 'fri', time: '12:00', hour: 12, date_from: '2026-07-17', date_to: '2026-07-17' },
  default_vendor_type: 'truck',
  max_travel_minutes: 15,
  radius_m: 500,
};
try {
  SCENARIO = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo_data', 'scenario.json'), 'utf8'));
} catch { /* fall back to the baked-in defaults above */ }

const MAX_CANDIDATES = 3;
const EVENTS_RADIUS_M = 3000; // events search is deliberately wider than the spot radius
const SETUP_WINDOW_HOURS = 2;  // planned setup window length used for get_restaurants

// Deterministic candidate ring: anchor + two offsets (~120 m, ~250 m).
const CANDIDATE_OFFSETS = [
  { bearing: 0, dist: 0 },
  { bearing: 60, dist: 120 },
  { bearing: 210, dist: 250 },
];

// ---------------------------------------------------------------------------
// callFunction — 3-tier transport (§4c). All tiers return the OUTPUT BODY.
// ---------------------------------------------------------------------------
async function callFunction(name, args) {
  // Tier 1: DEMO_DATA_MODE -> sibling snapshot (fully offline).
  if (isDemoMode()) {
    const snap = loadSnapshot(name, snapshotKey(args));
    if (snap) return snap;
    // Freeze gap: fall through to the in-process sibling (still offline — the
    // sibling honors DEMO_DATA_MODE itself), rather than 404 the demo.
    return requireSibling(name, args);
  }
  // Tier 2: deployed fan-out over HTTP.
  const base = process.env.FUNCTIONS_BASE_URL;
  if (base) {
    return fetchJSON(`${base.replace(/\/$/, '')}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      timeoutMs: 8000,
      retries: 1,
      ...demoFetchOpts(),
    });
  }
  // Tier 3: local dev (invoke_local) — require the sibling and read .body.
  return requireSibling(name, args);
}

async function requireSibling(name, args) {
  const mod = require(path.join('..', name, 'index.js'));
  const out = await mod.main(args);
  return out && out.body;
}

/** Wrap a signal call so one failing signal degrades to a neutral body. */
async function safeCall(name, args, neutral) {
  try {
    const body = await callFunction(name, args);
    if (body && body.error) {
      console.error(`${name} returned error envelope:`, body.error.code, body.error.message);
      return neutral;
    }
    return body || neutral;
  } catch (err) {
    console.error(`${name} call failed, using neutral body:`, err && err.message ? err.message : err);
    return neutral;
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers for candidate generation
// ---------------------------------------------------------------------------
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

const round5 = (n) => Math.round(n * 1e5) / 1e5;

function makeCandidates(location) {
  return CANDIDATE_OFFSETS.slice(0, MAX_CANDIDATES).map((o, i) => ({
    id: `spot-${i + 1}`,
    point: offsetPoint(location.lat, location.lng, o.bearing, o.dist),
    block_label: null, // filled after signals (nearest vendor) or coords fallback
  }));
}

/** block_label from the nearest vendor if cheaply available, else coords. */
function blockLabel(point, vendorsBody) {
  const vendors = (vendorsBody && vendorsBody.vendors) || [];
  let nearest = null;
  let min = Infinity;
  for (const v of vendors) {
    if (!v.point) continue;
    const d = haversineMeters(point.lat, point.lng, v.point.lat, v.point.lng);
    if (d < min) { min = d; nearest = v; }
  }
  if (nearest && min <= 150) return `Near ${nearest.name}`;
  return `Near ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Per-candidate signal fetch — IN PARALLEL (§4c)
// ---------------------------------------------------------------------------
async function fetchSignals(candidate, ctx) {
  const { lat, lng } = candidate.point;
  const { day, hour, time_from, time_to, date_from, date_to, radius_m, vendor_type } = ctx;

  const [vendors, closures, restaurants, foot_traffic, events, clearance] = await Promise.all([
    safeCall('get_vendors', { lat, lng, radius_m, day, time: ctx.time }, { vendors: [], count: 0 }),
    safeCall('get_closures', { lat, lng, radius_m, date_from, date_to }, { closures: [], count: 0 }),
    safeCall('get_restaurants', { lat, lng, radius_m, day, time_from, time_to },
      { total: 0, by_cuisine: {}, by_price: {}, saturation: 'low' }),
    safeCall('get_foot_traffic', { lat, lng, radius_m, day, hour },
      { score: 0, basis: 'bay_wheels', nearby_stations: 0, live_activity: 0, historical_avg: 0 }),
    safeCall('get_events', { lat, lng, radius_m: EVENTS_RADIUS_M, date_from, date_to },
      { events: [], count: 0 }),
    safeCall('check_clearance', { lat, lng, vendor_type }, { allowed: undefined, checks: [] }),
  ]);

  return { vendors, closures, restaurants, foot_traffic, events, clearance };
}

// ---------------------------------------------------------------------------
// Spot Scout — a SINGLE call for all spots, or deterministic templated why-lines
// ---------------------------------------------------------------------------
async function attachWhyLines(spots, ctx) {
  const url = process.env.SPOT_SCOUT_URL;
  if (url) {
    try {
      // ONE POST with ALL pre-gathered signals for all spots. No router, never
      // per-candidate. Expect [{ id, why_one_line }].
      const res = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          when: ctx.when,
          user_profile: ctx.user_profile,
          spots: spots.map((s) => ({
            id: s.id, point: s.point, block_label: s.block_label,
            score: s.score, eliminated: s.eliminated, violations: s.violations,
            score_breakdown: s.score_breakdown,
          })),
        }),
        timeoutMs: 8000,
        retries: 1,
        ...demoFetchOpts(),
      });
      const map = new Map((Array.isArray(res) ? res : []).map((r) => [r.id, r.why_one_line]));
      for (const s of spots) s.why_one_line = map.get(s.id) || templateWhy(s, ctx);
      return;
    } catch (err) {
      console.error('SPOT_SCOUT_URL degraded to templated why-lines:', err && err.message ? err.message : err);
    }
  }
  for (const s of spots) s.why_one_line = templateWhy(s, ctx);
}

function templateWhy(spot, ctx) {
  if (spot.eliminated) {
    const v = spot.violations[0];
    return `Not recommended — ${v ? v.rule : 'fails a hard constraint'}${v && v.detail ? ` (${v.detail})` : ''}.`;
  }
  const b = spot.score_breakdown;
  const parts = [];
  const foot = b.foot_traffic;
  parts.push(
    foot >= 0.66 ? `High ${ctx.dayFull} ${ctx.mealLabel} foot traffic`
      : foot >= 0.33 ? `Moderate ${ctx.dayFull} ${ctx.mealLabel} foot traffic`
        : `Quieter ${ctx.dayFull} foot traffic`
  );
  const nComp = b.competition.overlapping.length;
  parts.push(
    b.competition.penalty <= 0.05 ? 'little direct menu competition'
      : `${nComp} nearby competitor${nComp !== 1 ? 's' : ''}`
  );
  parts.push(b.legality.pass ? 'clears all setbacks' : `legality caution (${b.legality.rule})`);
  if (b.events.nearest) parts.push(`near ${b.events.nearest}`);
  const s = parts.join('; ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------
function addHoursHHMM(hhmm, h) {
  const [H, M] = String(hhmm).split(':').map(Number);
  const t = (((H + h) % 24) + 24) % 24;
  return `${String(t).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}

function mealLabelFor(hour) {
  if (hour >= 6 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'late-night';
}

function buildContext(args) {
  const up = args.user_profile || {};
  const vendor_type = String(up.vendor_type || SCENARIO.default_vendor_type).toLowerCase();
  if (!VENDOR_TYPES.includes(vendor_type)) {
    throw new UpstreamError('BAD_INPUT',
      `user_profile.vendor_type must be one of ${VENDOR_TYPES.join(', ')} (got '${up.vendor_type}').`);
  }

  const when = args.when || {};
  const day = when.day || SCENARIO.when.day;
  const time = when.time || SCENARIO.when.time;
  const hour = when.hour !== undefined ? Number(when.hour)
    : (time ? Number(String(time).split(':')[0]) : SCENARIO.when.hour);
  const date_from = when.date_from || SCENARIO.when.date_from;
  const date_to = when.date_to || SCENARIO.when.date_to;

  const location = args.location || {};
  const lat = location.lat !== undefined ? Number(location.lat) : SCENARIO.anchor.lat;
  const lng = location.lng !== undefined ? Number(location.lng) : SCENARIO.anchor.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new UpstreamError('BAD_INPUT', 'location.lat and location.lng must be numbers.');
  }
  const radius_m = location.radius_m !== undefined ? Number(location.radius_m) : SCENARIO.radius_m;

  const max_travel_minutes = up.max_travel_minutes !== undefined
    ? Number(up.max_travel_minutes) : SCENARIO.max_travel_minutes;
  const travel_mode = up.travel_mode || 'driving';

  return {
    vendor_type,
    user_profile: { ...up, vendor_type },
    menu: Array.isArray(up.menu) ? up.menu : [],
    when: { day, time, hour, date_from, date_to },
    day, time, hour, date_from, date_to,
    time_from: time,
    time_to: addHoursHHMM(time, SETUP_WINDOW_HOURS),
    location: { lat, lng, radius_m },
    radius_m,
    max_travel_minutes,
    travel_mode,
    dayFull: DAY_FULL[day] || day,
    mealLabel: mealLabelFor(hour),
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
exports.main = guard(async (args) => {
  const ctx = buildContext(args);
  const candidates = makeCandidates(ctx.location);

  // Travel matrix (one Mapbox call for origin -> all candidates) in parallel
  // with the per-candidate signal fan-out.
  const [travelRows, ...signalSets] = await Promise.all([
    travelMatrix(ctx.location, candidates.map((c) => c.point), ctx.travel_mode),
    ...candidates.map((c) => fetchSignals(c, ctx)),
  ]);

  // Menu competition per candidate (RAG when MENU_RAG_URL set, else bridge).
  const competitions = await Promise.all(
    signalSets.map((sig) => menuCompetition(
      ctx.menu,
      (sig.vendors && sig.vendors.vendors) || [],
      sig.restaurants
    ))
  );

  // Score every candidate deterministically.
  const scored = candidates.map((candidate, i) => {
    const signals = {
      vendors: signalSets[i].vendors,
      closures: signalSets[i].closures,
      restaurants: signalSets[i].restaurants,
      foot_traffic: signalSets[i].foot_traffic,
      events: signalSets[i].events,
      clearance: signalSets[i].clearance,
    };
    candidate.block_label = blockLabel(candidate.point, signalSets[i].vendors);
    return scoreCandidate({
      candidate,
      signals,
      competition: competitions[i],
      travel: travelRows[i],
      maxTravelMinutes: ctx.max_travel_minutes,
    });
  });

  // Rank non-eliminated by score desc; eliminated go last, unranked.
  const ranked = scored.filter((s) => !s.eliminated).sort((a, b) => b.score - a.score);
  const eliminated = scored.filter((s) => s.eliminated);
  ranked.forEach((s, i) => { s.rank = i + 1; });
  eliminated.forEach((s) => { s.rank = null; });

  const spots = [...ranked, ...eliminated];

  // One Spot Scout call for all spots (or deterministic template) — after math.
  await attachWhyLines(spots, ctx);

  // Emit the LOCKED §4g shape (strip internals; stable key order).
  const out = spots.map((s) => ({
    rank: s.rank,
    id: s.id,
    point: s.point,
    block_label: s.block_label,
    verdict: s.verdict,
    score: s.score,
    eliminated: s.eliminated,
    violations: s.violations,
    score_breakdown: s.score_breakdown,
    why_one_line: s.why_one_line,
  }));

  return ok({ spots: out });
});
