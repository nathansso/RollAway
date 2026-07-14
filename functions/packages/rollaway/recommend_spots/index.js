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
const { googleMatrix } = require('./google_travel');
const { reverseGeocode } = require('./geocode');
const { menuCompetition } = require('./menu_competition');
const { scoreCandidate, pickEventOpportunity } = require('./score');
const { buildAreaInsights } = require('./area_insights');
const { makeCandidates, makeRangeCandidates, signalArgs } = require('./candidates');

// #17: how many in-range points to fully score (each does a signal fan-out), and
// how many ranked spots to return (frontend caps recommendations at 5).
const SCORE_POOL_MAX = 8;
const K_SPOTS = 5;

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
            event_opportunity: s.event_opportunity,
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
      const actionMap = new Map(actions.map((action) => [action.id, action]));
      for (const s of spots) {
        const action = actionMap.get(s.id);
        s.why_one_line = (action && (Array.isArray(action.reasons)
          ? action.reasons[0] : action.why_one_line)) || templateWhy(s, ctx);
        const draft = action && action.outreach_draft;
        s.outreach_draft = s.event_opportunity && draft
          && typeof draft.subject === 'string' && typeof draft.body === 'string'
          ? { subject: draft.subject, body: draft.body } : null;
      }
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
  // #8: when the caller doesn't specify a mode, short-radius (in-neighborhood)
  // searches default to walking. Driving routing from an anchor that snaps to a
  // freeway on-ramp (e.g. the 37.78,-122.40 demo anchor near the Bay Bridge)
  // can report ~20 min to reach a spot ~120 m away and wrongly eliminate it;
  // for a few-hundred-metre search that travel is really a walk. Wider searches
  // still default to driving. Callers may always pass an explicit travel_mode.
  const travel_mode = up.travel_mode || (radius_m <= 1500 ? 'walking' : 'driving');

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
// #17: effective range + candidate selection
// ---------------------------------------------------------------------------

/** Traffic-aware travel via Google Distance Matrix, falling back to Mapbox. */
async function travelForPool(ctx, points) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (key && !isDemoMode()) {
    try {
      return await googleMatrix(ctx.location, points, ctx.travel_mode, key, ctx.when);
    } catch (err) {
      console.error('Google Distance Matrix degraded to Mapbox:',
        err && err.message ? err.message : err);
    }
  }
  return travelMatrix(ctx.location, points, ctx.travel_mode);
}

/** Evenly-strided subset preserving spatial spread (pool is anchor-first). */
function selectSpread(list, n) {
  if (list.length <= n) return list;
  const out = [];
  const stride = list.length / n;
  for (let i = 0; i < n; i += 1) out.push(list[Math.floor(i * stride)]);
  return out;
}

/** Reverse-geocode each returned spot to a street address (best effort). */
async function attachAddresses(spots) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  await Promise.all(spots.map(async (s) => {
    s.address = key ? await reverseGeocode(s.point, key) : null;
  }));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
exports.main = guard(async (args) => {
  const ctx = buildContext(args);

  // 1. Sample a range pool and keep only points reachable within the travel
  //    budget by traffic-aware time (issue #17: strength within range, not
  //    proximity). Always keep the anchor so we never return empty.
  const pool = makeRangeCandidates(ctx.location);
  const poolTravel = await travelForPool(ctx, pool);
  let inRange = pool
    .map((point, i) => ({ point, travel: poolTravel[i] }))
    .filter((c) => c.travel && c.travel.minutes != null
      && c.travel.minutes <= ctx.max_travel_minutes);
  if (inRange.length === 0) inRange = [{ point: pool[0], travel: poolTravel[0] }];

  // 2. Cap the scoring pool to a spread of candidates and assign stable ids.
  const candidates = selectSpread(inRange, SCORE_POOL_MAX).map((c, i) => ({
    id: `spot-${i + 1}`,
    point: c.point,
    block_label: null,
    travel: c.travel,
  }));

  // 3. Signal fan-out for the selected candidates (in parallel).
  const signalSets = await Promise.all(candidates.map((c) => fetchSignals(c, ctx)));

  // Menu competition per candidate (RAG when MENU_RAG_URL set, else bridge).
  const competitions = await Promise.all(
    signalSets.map((sig) => menuCompetition(
      ctx.menu,
      (sig.vendors && sig.vendors.vendors) || [],
      sig.restaurants
    ))
  );

  // 4. Score every candidate deterministically (travel already computed).
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
    const spot = scoreCandidate({
      candidate,
      signals,
      competition: competitions[i],
      travel: candidate.travel,
      maxTravelMinutes: ctx.max_travel_minutes,
    });
    spot.event_opportunity = pickEventOpportunity(candidate.point, signals.events, ctx.radius_m);
    spot.area_insights = buildAreaInsights({
      point: candidate.point,
      signals,
      competition: competitions[i],
      eliminated: spot.eliminated,
      travel: candidate.travel,
      travelMode: ctx.travel_mode,
    });
    return spot;
  });

  // 5. Rank non-eliminated by score desc and keep the top K (issue #17 k=5).
  //    If nothing survives scoring, fall back to the best eliminated so the
  //    caller still sees why (with violations), capped at K.
  const ranked = scored.filter((s) => !s.eliminated).sort((a, b) => b.score - a.score);
  const eliminated = scored.filter((s) => s.eliminated).sort((a, b) => b.score - a.score);
  const spots = (ranked.length > 0 ? ranked : eliminated).slice(0, K_SPOTS);
  spots.forEach((s, i) => { s.rank = s.eliminated ? null : i + 1; });

  // One Spot Scout call for all spots (or deterministic template) — after math.
  await attachWhyLines(spots, ctx);

  // Reverse-geocode the returned spots to street addresses (issue #17).
  await attachAddresses(spots);

  // Emit the LOCKED §4g shape (strip internals; stable key order).
  const out = spots.map((s) => ({
    rank: s.rank,
    id: s.id,
    point: s.point,
    block_label: s.block_label,
    address: s.address || null,
    verdict: s.verdict,
    score: s.score,
    eliminated: s.eliminated,
    violations: s.violations,
    score_breakdown: s.score_breakdown,
    area_insights: s.area_insights,
    event_opportunity: s.event_opportunity,
    outreach_draft: s.event_opportunity ? (s.outreach_draft || null) : null,
    why_one_line: s.why_one_line,
  }));

  return ok({ spots: out });
});

exports.attachWhyLines = attachWhyLines;
