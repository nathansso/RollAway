/**
 * rules.js — the clearance invariant as PURE CODE. No LLM anywhere near this:
 * every number here is a turf.js geodesic distance in feet.
 *
 * All functions take their datasets as arguments (dependency-injected) so the
 * unit tests exercise exactly the code the deployed Function runs.
 */

'use strict';

const distance = require('@turf/distance').default;
const nearestPoint = require('@turf/nearest-point').default;
const pointToLineDistance = require('@turf/point-to-line-distance').default;
const { point: turfPoint, featureCollection } = require('@turf/helpers');

const {
  CITES, RULES, RULE_LABELS, SCHOOL_HOURS, MIDDLE_GRADES, RESTAURANT_SEARCH_RADIUS_M,
} = require('./constants');

const FEET_PER_MILE = 5280;

/** Geodesic distance in feet between a [lng,lat] point and a Point feature. */
function distanceFt(from, to) {
  return distance(from, to, { units: 'miles' }) * FEET_PER_MILE;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Nearest feature of a Point FeatureCollection, or null when empty. */
function nearestFt(pt, fc) {
  if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) return null;
  const nearest = nearestPoint(pt, fc);
  return { feature: nearest, ft: distanceFt(pt, nearest) };
}

/**
 * 75 ft from restaurant entrances. `restaurantsFC` holds the entrance points
 * found within RESTAURANT_SEARCH_RADIUS_M of the spot; when none were found
 * we can only assert "farther than the search radius", so actual_ft reports
 * that floor and the check passes.
 */
function checkRestaurantEntrances(pt, restaurantsFC) {
  const hit = nearestFt(pt, restaurantsFC);
  const searchFloorFt = RESTAURANT_SEARCH_RADIUS_M / 0.3048;
  const actual_ft = hit ? round1(hit.ft) : round1(searchFloorFt);
  return {
    rule: RULE_LABELS.RESTAURANT_ENTRANCE,
    required_ft: RULES.RESTAURANT_ENTRANCE_FT,
    actual_ft,
    pass: actual_ft >= RULES.RESTAURANT_ENTRANCE_FT,
    cite: CITES.RESTAURANT_ENTRANCE,
  };
}

/** Grade string -> number (K/PK/TK -> 0); null when unparseable. */
function gradeNum(g) {
  if (g === null || g === undefined) return null;
  const s = String(g).trim().toUpperCase();
  if (['K', 'PK', 'TK'].includes(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isMiddleSchool(props) {
  const low = gradeNum(props.low_grade);
  const high = gradeNum(props.high_grade);
  if (low === null || high === null) return false;
  return low <= MIDDLE_GRADES.high && high >= MIDDLE_GRADES.low;
}

/** Is `now` within school hours in San Francisco? */
function isSchoolHours(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const min = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  return SCHOOL_HOURS.days.includes(dow) &&
    min >= SCHOOL_HOURS.startMin && min < SCHOOL_HOURS.endMin;
}

/**
 * 500 ft from middle schools during school hours. Outside school hours the
 * rule doesn't bind, so the check passes — but actual_ft still reports the
 * real distance so the agent can warn about the school day.
 */
function checkMiddleSchools(pt, schoolsFC, now = new Date()) {
  const middles = featureCollection(
    (schoolsFC && schoolsFC.features ? schoolsFC.features : []).filter((f) => isMiddleSchool(f.properties || {}))
  );
  const hit = nearestFt(pt, middles);
  if (!hit) return null; // no middle schools in the snapshot -> nothing to check
  const actual_ft = round1(hit.ft);
  const farEnough = actual_ft >= RULES.MIDDLE_SCHOOL_FT;
  return {
    rule: RULE_LABELS.MIDDLE_SCHOOL,
    required_ft: RULES.MIDDLE_SCHOOL_FT,
    actual_ft,
    pass: farEnough || !isSchoolHours(now),
    cite: CITES.MIDDLE_SCHOOL,
  };
}

/**
 * 7 ft from fire hydrants. Returns null (check SKIPPED) when the hydrant
 * snapshot is empty — data.sfgov.org publishes no hydrant dataset; our
 * snapshot comes from OpenStreetMap and may be unavailable (see README).
 */
function checkHydrants(pt, hydrantsFC) {
  const hit = nearestFt(pt, hydrantsFC);
  if (!hit) return null;
  const actual_ft = round1(hit.ft);
  return {
    rule: RULE_LABELS.HYDRANT,
    required_ft: RULES.HYDRANT_FT,
    actual_ft,
    pass: actual_ft >= RULES.HYDRANT_FT,
    cite: CITES.HYDRANT,
  };
}

/**
 * Vendor-type sidewalk rule: pushcarts vend on the sidewalk and must leave a
 * 6 ft unobstructed pedestrian path, so the sidewalk at the spot must be at
 * least PUSHCART_MIN_SIDEWALK_FT wide. Uses the nearest street segment from
 * the Sidewalk Widths snapshot (geodesic point-to-line distance).
 * Trucks/trailers vend from the street -> rule not applicable -> null.
 */
function checkSidewalkClearance(pt, sidewalksFC, vendorType) {
  if (vendorType !== 'pushcart_cooking' && vendorType !== 'pushcart_nocook') return null;
  const feats = sidewalksFC && sidewalksFC.features ? sidewalksFC.features : [];
  if (feats.length === 0) return null;
  // cheap bbox prefilter before the exact geodesic pass (snapshot has ~16k
  // segments citywide; segments are short so a vertex test is safe here)
  const [ptLng, ptLat] = pt.geometry.coordinates;
  const nearby = feats.filter((f) =>
    f.geometry && f.geometry.type === 'LineString' &&
    f.geometry.coordinates.some(
      ([x, y]) => Math.abs(y - ptLat) < 0.005 && Math.abs(x - ptLng) < 0.007 // ~550m
    )
  );
  let best = null;
  for (const f of nearby) {
    const d = pointToLineDistance(pt, f, { units: 'miles' }) * FEET_PER_MILE;
    if (!best || d < best.d) best = { d, f };
  }
  if (!best) return null;
  const width = Number(best.f.properties.sidewalk_f);
  return {
    rule: RULE_LABELS.SIDEWALK_CLEARANCE,
    required_ft: RULES.PUSHCART_MIN_SIDEWALK_FT,
    actual_ft: round1(width),
    pass: width >= RULES.PUSHCART_MIN_SIDEWALK_FT,
    cite: CITES.SIDEWALK_CLEARANCE,
  };
}

/**
 * Run every applicable check for a spot. Checks that return null (no data /
 * not applicable to this vendor type) are omitted from checks[] — never
 * silently marked as passing.
 */
function buildChecks({ lat, lng, vendor_type, restaurantsFC, schoolsFC, hydrantsFC, sidewalksFC, now }) {
  const pt = turfPoint([lng, lat]);
  const checks = [
    checkRestaurantEntrances(pt, restaurantsFC),
    checkHydrants(pt, hydrantsFC),
    checkMiddleSchools(pt, schoolsFC, now),
    checkSidewalkClearance(pt, sidewalksFC, vendor_type),
  ].filter(Boolean);
  return { allowed: checks.every((c) => c.pass), checks };
}

module.exports = {
  buildChecks,
  checkRestaurantEntrances,
  checkMiddleSchools,
  checkHydrants,
  checkSidewalkClearance,
  isSchoolHours,
  isMiddleSchool,
  distanceFt,
};
