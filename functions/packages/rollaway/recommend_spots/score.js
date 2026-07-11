/**
 * score.js — the DETERMINISTIC scoring core for recommend_spots (AGENT-BRIEF
 * §4e). Code does the math and the law; the agent only explains. No LLM, no
 * network here — pure functions over the pre-gathered signals.
 */

'use strict';

const { haversineMeters } = require('./shared');

// ---- Weights & thresholds (named so scoring is explainable) ----------------
const WEIGHTS = {
  FOOT_TRAFFIC: 0.60,     // demand: bike-activity proxy for this hour
  RESTAURANT_DENSITY: 0.25, // demand: food-destination pull nearby
  EVENT_BONUS_MAX: 0.15,  // demand: max additive bump from a nearby event
  COMPETITION: 0.50,      // penalty: scales the menu-overlap score
};

const HARD = {
  CLOSURE_BLOCK_M: 60,    // a closure within this radius blocks the spot
  SPOT_OCCUPIED_M: 30,    // a scheduled vendor this close occupies the spot
  EVENT_SCALE_M: 1500,    // event proximity falls off over this distance
  EVENT_ATTENDANCE_REF: 40000, // attendance that saturates the attendance factor
};

// Restaurant saturation enum -> demand contribution (higher density = more pull).
const SATURATION_DEMAND = { low: 0.3, medium: 0.6, high: 0.9 };

const VERDICT = { GOOD: 0.66, CAUTION: 0.33 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (n) => Math.round(n * 100) / 100;

/** Every [lng,lat] position in a GeoJSON geometry, any nesting depth. */
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

/** Min meters from a point to any vertex of a closure geometry (Infinity if none). */
function minDistanceToGeometry(lat, lng, geometry) {
  let min = Infinity;
  for (const [gLng, gLat] of flattenCoords(geometry)) {
    const d = haversineMeters(lat, lng, gLat, gLng);
    if (d < min) min = d;
  }
  return min;
}

/** Demand sub-score from foot traffic + restaurant density + event proximity. */
function demandScore(point, signals) {
  const foot = clamp(Number(signals.foot_traffic && signals.foot_traffic.score) || 0, 0, 1);

  const restaurants = signals.restaurants || {};
  const sat = (restaurants.window && restaurants.window.saturation_open) || restaurants.saturation || 'low';
  const restDensity = SATURATION_DEMAND[sat] !== undefined ? SATURATION_DEMAND[sat] : 0.3;

  const { bonus, nearest } = eventProximity(point, signals.events);

  const demand = clamp(
    WEIGHTS.FOOT_TRAFFIC * foot +
    WEIGHTS.RESTAURANT_DENSITY * restDensity +
    bonus,
    0, 1
  );
  return { demand, foot, restDensity, sat, eventBonus: bonus, eventNearest: nearest };
}

/** Event-proximity bonus (0..EVENT_BONUS_MAX) and the driving event's name. */
function eventProximity(point, eventsBody) {
  const events = (eventsBody && eventsBody.events) || [];
  let best = 0;
  let nearest = null;
  for (const e of events) {
    if (!e.point || !Number.isFinite(e.point.lat) || !Number.isFinite(e.point.lng)) continue;
    const dist = haversineMeters(point.lat, point.lng, e.point.lat, e.point.lng);
    const distanceFactor = clamp(1 - dist / HARD.EVENT_SCALE_M, 0, 1);
    if (distanceFactor <= 0) continue;
    const attendance = Number(e.expected_attendance) || 5000;
    const attendanceFactor = clamp(attendance / HARD.EVENT_ATTENDANCE_REF, 0.1, 1);
    const contribution = distanceFactor * attendanceFactor;
    if (contribution > best) { best = contribution; nearest = e.name || e.venue || null; }
  }
  return { bonus: round2(WEIGHTS.EVENT_BONUS_MAX * best), nearest };
}

/** Hard-constraint evaluation -> { eliminated, violations, closureBlocked }. */
function hardConstraints(point, signals, travelMinutes, maxTravelMinutes) {
  const violations = [];

  // 1. Inside / immediately adjacent to an active closure.
  let closureBlocked = false;
  const closures = (signals.closures && signals.closures.closures) || [];
  for (const c of closures) {
    if (minDistanceToGeometry(point.lat, point.lng, c.geometry) <= HARD.CLOSURE_BLOCK_M) {
      closureBlocked = true;
      violations.push({ rule: 'inside active closure', detail: c.reason || 'street closure', cite: null });
      break;
    }
  }

  // 2. Clearance failure (legality) — collect the failing rows.
  const clearance = signals.clearance || {};
  if (clearance.allowed === false) {
    for (const chk of clearance.checks || []) {
      if (chk.pass === false) {
        violations.push({
          rule: chk.rule,
          detail: `${chk.actual_ft}ft < required ${chk.required_ft}ft`,
          cite: chk.cite || null,
        });
      }
    }
  }

  // 3. Spot occupied by a vendor scheduled here in the window.
  const vendors = (signals.vendors && signals.vendors.vendors) || [];
  const occupier = vendors.find((v) =>
    v.scheduled_here && v.point &&
    haversineMeters(point.lat, point.lng, v.point.lat, v.point.lng) <= HARD.SPOT_OCCUPIED_M
  );
  if (occupier) {
    violations.push({
      rule: 'spot occupied',
      detail: `${occupier.name || 'a vendor'} scheduled here${occupier.schedule_window ? ` (${occupier.schedule_window})` : ''}`,
      cite: null,
    });
  }

  // 4. Beyond the travel budget.
  if (Number.isFinite(travelMinutes) && Number.isFinite(maxTravelMinutes) && travelMinutes > maxTravelMinutes) {
    violations.push({
      rule: 'exceeds max travel time',
      detail: `${travelMinutes} min > ${maxTravelMinutes} min budget`,
      cite: null,
    });
  }

  return { eliminated: violations.length > 0, violations, closureBlocked };
}

function legalityBreakdown(signals) {
  const clearance = signals.clearance || {};
  const checks = clearance.checks || [];
  if (clearance.allowed === undefined) {
    return { pass: true, rule: 'clearance data unavailable', checks };
  }
  const pass = clearance.allowed !== false;
  const failing = checks.find((c) => c.pass === false);
  return {
    pass,
    rule: pass ? 'all setbacks clear' : failing ? failing.rule : 'clearance violation',
    checks,
  };
}

function verdictFor(score, eliminated) {
  if (eliminated) return 'avoid';
  if (score >= VERDICT.GOOD) return 'good';
  if (score >= VERDICT.CAUTION) return 'caution';
  return 'avoid';
}

/**
 * Score one candidate. `signals` = { vendors, closures, restaurants,
 * foot_traffic, events, clearance } (each the Function's OUTPUT BODY).
 * `competition` = { overlap_score, overlapping }. `travel` = { minutes, estimated }.
 * Returns the fully-scored spot object minus rank/why_one_line.
 */
function scoreCandidate({ candidate, signals, competition, travel, maxTravelMinutes }) {
  const point = candidate.point;
  const travelMinutes = travel && Number.isFinite(travel.minutes) ? travel.minutes : null;

  const { eliminated, violations, closureBlocked } =
    hardConstraints(point, signals, travelMinutes, maxTravelMinutes);

  const { demand, foot, eventBonus, eventNearest } = demandScore(point, signals);
  const overlapScore = clamp(Number(competition && competition.overlap_score) || 0, 0, 1);
  const penalty = round2(clamp(WEIGHTS.COMPETITION * overlapScore, 0, 1));
  const score = round2(clamp(demand - penalty, 0, 1));
  const legality = legalityBreakdown(signals);

  return {
    id: candidate.id,
    point,
    block_label: candidate.block_label,
    verdict: verdictFor(score, eliminated),
    score,
    eliminated,
    violations,
    score_breakdown: {
      foot_traffic: round2(foot),
      competition: { penalty, overlapping: (competition && competition.overlapping) || [] },
      legality,
      closures: { blocked: closureBlocked },
      events: { bonus: eventBonus, nearest: eventNearest },
      travel_minutes: travelMinutes,
    },
    _demand: round2(demand), // internal, stripped before output
  };
}

module.exports = { scoreCandidate, WEIGHTS, HARD, SATURATION_DEMAND, VERDICT, verdictFor };
