/**
 * Unit tests for the clearance geometry invariant (node:test — `npm test`,
 * no deploy needed). Fixtures are placed at exact geodesic offsets and each
 * offset is sanity-checked with turf before the rule is asserted, so a
 * regression in either the fixture math or the rule logic fails loudly.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { featureCollection, point: turfPoint } = require('@turf/helpers');
const {
  buildChecks, checkRestaurantEntrances, checkHydrants, checkMiddleSchools,
  checkSidewalkClearance, isSchoolHours, distanceFt,
} = require('../rules');
const { RULES, RULE_LABELS, CITES } = require('../constants');

// Test origin: SoMa, San Francisco.
const ORIGIN = { lat: 37.78, lng: -122.40 };
const FT_PER_M = 1 / 0.3048;

/** A [lng,lat] Point feature `feet` east of the origin (equirectangular offset). */
function pointEastFt(feet, props = {}) {
  const meters = feet / FT_PER_M;
  const dLng = meters / (111320 * Math.cos((ORIGIN.lat * Math.PI) / 180));
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [ORIGIN.lng + dLng, ORIGIN.lat] },
    properties: props,
  };
}

const origin = turfPoint([ORIGIN.lng, ORIGIN.lat]);

test('fixture offsets are geodesically accurate (turf sanity check)', () => {
  const fifty = pointEastFt(50);
  const d = distanceFt(origin, fifty);
  assert.ok(Math.abs(d - 50) < 1, `expected ~50ft, turf measured ${d}ft`);
});

test('a point 50ft from a restaurant entrance FAILS the 75ft check', () => {
  const check = checkRestaurantEntrances(origin, featureCollection([pointEastFt(50)]));
  assert.equal(check.rule, RULE_LABELS.RESTAURANT_ENTRANCE);
  assert.equal(check.required_ft, 75);
  assert.equal(check.pass, false);
  assert.ok(Math.abs(check.actual_ft - 50) < 1, `actual_ft ${check.actual_ft} should be ~50`);
  assert.equal(check.cite, CITES.RESTAURANT_ENTRANCE);
});

test('a point 110ft from the nearest restaurant PASSES the 75ft check', () => {
  const check = checkRestaurantEntrances(origin, featureCollection([pointEastFt(110)]));
  assert.equal(check.pass, true);
  assert.ok(Math.abs(check.actual_ft - 110) < 1);
});

test('a hydrant 20ft away PASSES the 7ft check', () => {
  const check = checkHydrants(origin, featureCollection([pointEastFt(20)]));
  assert.equal(check.rule, RULE_LABELS.HYDRANT);
  assert.equal(check.required_ft, 7);
  assert.equal(check.pass, true);
  assert.ok(Math.abs(check.actual_ft - 20) < 1, `actual_ft ${check.actual_ft} should be ~20`);
});

test('a hydrant 4ft away FAILS the 7ft check', () => {
  const check = checkHydrants(origin, featureCollection([pointEastFt(4)]));
  assert.equal(check.pass, false);
});

test('hydrant check is SKIPPED (null), not fake-passed, when no hydrant data', () => {
  assert.equal(checkHydrants(origin, featureCollection([])), null);
});

// Fixed instants for the school-hours clock (America/Los_Angeles):
const SCHOOL_TIME = new Date('2026-07-10T18:00:00Z'); // Fri 11:00 SF — school hours
const NIGHT_TIME = new Date('2026-07-11T04:00:00Z');  // Fri 21:00 SF — after hours

test('school-hours clock resolves SF time correctly', () => {
  assert.equal(isSchoolHours(SCHOOL_TIME), true);
  assert.equal(isSchoolHours(NIGHT_TIME), false);
});

test('a middle school 300ft away FAILS the 500ft check during school hours', () => {
  const school = pointEastFt(300, { name: 'Test MS', low_grade: '6', high_grade: '8' });
  const check = checkMiddleSchools(origin, featureCollection([school]), SCHOOL_TIME);
  assert.equal(check.rule, RULE_LABELS.MIDDLE_SCHOOL);
  assert.equal(check.required_ft, 500);
  assert.equal(check.pass, false);
  assert.ok(Math.abs(check.actual_ft - 300) < 2);
});

test('the same school PASSES outside school hours (rule does not bind)', () => {
  const school = pointEastFt(300, { name: 'Test MS', low_grade: '6', high_grade: '8' });
  const check = checkMiddleSchools(origin, featureCollection([school]), NIGHT_TIME);
  assert.equal(check.pass, true);
});

test('a 900ft-away middle school PASSES; an elementary school is ignored', () => {
  const ms = pointEastFt(900, { name: 'Far MS', low_grade: '6', high_grade: '8' });
  const elem = pointEastFt(100, { name: 'Close Elementary', low_grade: 'K', high_grade: '5' });
  const check = checkMiddleSchools(origin, featureCollection([ms, elem]), SCHOOL_TIME);
  assert.equal(check.pass, true);
  assert.ok(Math.abs(check.actual_ft - 900) < 3, 'elementary school must not drive the check');
});

function sidewalkSegment(widthFt) {
  // short segment passing ~15ft south of the origin
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [ORIGIN.lng - 0.0005, ORIGIN.lat - 0.00004],
        [ORIGIN.lng + 0.0005, ORIGIN.lat - 0.00004],
      ],
    },
    properties: { street: 'TEST ST', sidewalk_f: widthFt },
  };
}

test('pushcart on a 15ft sidewalk PASSES the sidewalk-clearance rule', () => {
  const check = checkSidewalkClearance(
    origin, featureCollection([sidewalkSegment(15)]), 'pushcart_cooking'
  );
  assert.equal(check.required_ft, RULES.PUSHCART_MIN_SIDEWALK_FT);
  assert.equal(check.pass, true);
  assert.equal(check.actual_ft, 15);
});

test('pushcart on an 8ft sidewalk FAILS; trucks skip the sidewalk rule', () => {
  const fc = featureCollection([sidewalkSegment(8)]);
  assert.equal(checkSidewalkClearance(origin, fc, 'pushcart_nocook').pass, false);
  assert.equal(checkSidewalkClearance(origin, fc, 'truck'), null);
});

test('buildChecks: allowed is the AND of every check, §B field names exact', () => {
  const { allowed, checks } = buildChecks({
    lat: ORIGIN.lat, lng: ORIGIN.lng, vendor_type: 'truck',
    restaurantsFC: featureCollection([pointEastFt(50)]), // fails
    schoolsFC: featureCollection([pointEastFt(900, { low_grade: '6', high_grade: '8' })]),
    hydrantsFC: featureCollection([pointEastFt(20)]),
    sidewalksFC: featureCollection([]),
    now: SCHOOL_TIME,
  });
  assert.equal(allowed, false);
  assert.equal(checks.length, 3);
  for (const c of checks) {
    assert.deepEqual(
      Object.keys(c).sort(),
      ['actual_ft', 'cite', 'pass', 'required_ft', 'rule'],
      '§B checks[] shape must be exact'
    );
  }
});

test('main(): full function run offline (fixture restaurants), §B envelope on bad input', async () => {
  const { main } = require('../index');
  const good = await main({ lat: 37.78, lng: -122.40, vendor_type: 'truck' });
  assert.equal(good.statusCode, 200);
  assert.equal(typeof good.body.allowed, 'boolean');
  assert.ok(Array.isArray(good.body.checks) && good.body.checks.length >= 2);

  const bad = await main({ lat: 37.78, lng: -122.40, vendor_type: 'blimp' });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.error.code, 'BAD_INPUT');
});
