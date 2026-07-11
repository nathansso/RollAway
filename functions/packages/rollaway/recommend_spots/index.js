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
const { makeCandidates, signalArgs } = require('./candidates');

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
  const a = signalArgs(candidate.point, ctx); // same args freeze_snapshots uses

  const [vendors, closures, restaurants, foot_traffic, events, clearance] = await Promise.all([
    safeCall('get_vendors', a.get_vendors, { vendors: [], count: 0 }),
    safeCall('get_closures', a.get_closures, { closures: [], count: 0 }),
    safeCall('get_restaurants', a.get_restaurants,
      { total: 0, by_cuisine: {}, by_price: {}, saturation: 'low' }),
    safeCall('get_foot_traffic', a.get_foot_traffic,
      { score: 0, basis: 'bay_wheels', nearby_stations: 0, live_activity: 0, historical_avg: 0 }),
    safeCall('get_events', a.get_events, { events: [], count: 0 }),
    safeCall('check_clearance', a.check_clearance, { allowed: undefined, checks: [] }),
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
      // per-candidate. The direct agent endpoint returns the shared agent envelope.
      const res = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          when: ctx.when,
          user_profile: ctx.user_profile,
          candidates: spots.map((s) => ({
            id: s.id,
            point: s.point,
            block_label: s.block_label,
            score: s.score,
            verdict: s.verdict,
            eliminated: s.eliminated,
            violations: s.violations,
            signals: {
              foot_traffic_score: s.score_breakdown.foot_traffic,
              restaurant_saturation: s.score_breakdown.competition.penalty >= 0.67
                ? 'high' : s.score_breakdown.competition.penalty >= 0.34 ? 'medium' : 'low',
              clearance: {
                allowed: s.score_breakdown.legality.pass,
                checks: s.score_breakdown.legality.checks || [],
              },
              nearby_vendors: s.score_breakdown.competition.overlapping || [],
            },
          })),
        }),
        timeoutMs: 8000,
        retries: 1,
        ...demoFetchOpts(),
      });
      const envelope = res && res.envelope ? res.envelope : res;
      const actions = envelope && Array.isArray(envelope.map_actions) ? envelope.map_actions : [];
      const map = new Map(actions.map((action) => [
        action.id,
        Array.isArray(action.reasons) ? action.reasons[0] : action.why_one_line,
      ]));
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
  const time = when.time || when.time_from || SCENARIO.when.time;
  const hour = when.hour !== undefined ? Number(when.hour)
    : (time ? Number(String(time).split(':')[0]) : SCENARIO.when.hour);
  const date_from = when.date_from || when.date || SCENARIO.when.date_from;
  const date_to = when.date_to || when.date || SCENARIO.when.date_to;

  const location = args.location || {};
  const lat = location.lat !== undefined ? Number(location.lat) : SCENARIO.anchor.lat;
  const lng = location.lng !== undefined ? Number(location.lng) : SCENARIO.anchor.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new UpstreamError('BAD_INPUT', 'location.lat and location.lng must be numbers.');
  }
  const radius_m = location.radius_m !== undefined ? Number(location.radius_m) : SCENARIO.radius_m;

  const nestedTravel = up.max_travel && up.max_travel.unit === 'minutes'
    ? Number(up.max_travel.value) : undefined;
  const max_travel_minutes = up.max_travel_minutes !== undefined
    ? Number(up.max_travel_minutes)
    : Number.isFinite(nestedTravel) ? nestedTravel : SCENARIO.max_travel_minutes;
  const travel_mode = up.travel_mode || 'driving';

  return {
    vendor_type,
    user_profile: { ...up, vendor_type },
    menu: Array.isArray(up.menu)
      ? up.menu
      : (up.menu && Array.isArray(up.menu.items) ? up.menu.items : []),
    when: { day, time, hour, date_from, date_to },
    day, time, hour, date_from, date_to,
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

exports.attachWhyLines = attachWhyLines;
