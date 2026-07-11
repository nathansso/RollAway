/**
 * constants.js — every citation id and legal threshold for the clearance
 * check lives HERE and only here, so updating them (e.g. when Person 2
 * finalizes the KB source-id list) is a one-file change.
 */

'use strict';

// Citation ids MUST match Person 2's knowledge-base source ids (§B example
// uses "dpw-182101" = DPW Director's Order 182,101, the MFF vending order).
// PLACEHOLDERS until Person 2 confirms the final id list — update here only.
const CITES = {
  RESTAURANT_ENTRANCE: 'dpw-182101',
  MIDDLE_SCHOOL: 'dpw-182101',
  HYDRANT: 'dpw-182101',
  SIDEWALK_CLEARANCE: 'dpw-182101',
};

// Distance rules (feet — the law is written in feet).
const RULES = {
  RESTAURANT_ENTRANCE_FT: 75, // no vending within 75 ft of a restaurant entrance
  MIDDLE_SCHOOL_FT: 500,      // no vending within 500 ft of a middle school during school hours
  HYDRANT_FT: 7,              // keep 7 ft clear of fire hydrants
  // Pushcarts vend ON the sidewalk: DPW requires an unobstructed 6 ft
  // pedestrian path; with a ~4 ft cart footprint that needs a >= 10 ft
  // sidewalk. Trucks/trailers vend from the street, so this rule is
  // pushcart-only.
  PUSHCART_PED_PATH_FT: 6,
  PUSHCART_FOOTPRINT_FT: 4,
};
RULES.PUSHCART_MIN_SIDEWALK_FT = RULES.PUSHCART_PED_PATH_FT + RULES.PUSHCART_FOOTPRINT_FT;

// Exact §B rule strings (frozen — Person 2's agent surfaces these verbatim).
const RULE_LABELS = {
  RESTAURANT_ENTRANCE: '75ft from restaurant entrance',
  MIDDLE_SCHOOL: '500ft from middle school (school hours)',
  HYDRANT: '7ft from hydrant',
  SIDEWALK_CLEARANCE:
    `${RULES.PUSHCART_MIN_SIDEWALK_FT}ft min sidewalk width for pushcart (${RULES.PUSHCART_PED_PATH_FT}ft pedestrian path)`,
};

// School hours: SF weekdays, 7:00-16:00 local (bell schedules vary; this
// spans them). The 500 ft rule only binds during these hours.
const SCHOOL_HOURS = { days: [1, 2, 3, 4, 5], startMin: 7 * 60, endMin: 16 * 60 };

// Middle school = any school whose grade range overlaps 6-8.
const MIDDLE_GRADES = { low: 6, high: 8 };

// How far around the point we look for restaurant entrances. If none is
// found inside this radius the 75 ft check passes with actual_ft reported
// as this floor (we only know "farther than the search radius").
const RESTAURANT_SEARCH_RADIUS_M = 150;

module.exports = { CITES, RULES, RULE_LABELS, SCHOOL_HOURS, MIDDLE_GRADES, RESTAURANT_SEARCH_RADIUS_M };
