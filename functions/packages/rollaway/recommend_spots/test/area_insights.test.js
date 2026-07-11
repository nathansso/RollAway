'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAreaInsights, permitChecks, localCuisine } = require('../area_insights');

const clearance = {
  allowed: true,
  checks: [
    { rule: 'restaurant entrance setback', pass: true, required_ft: 75, actual_ft: 120, cite: 'dpw-182101' },
    { rule: 'middle school setback', pass: true, required_ft: 500, actual_ft: 680, cite: 'dpw-182101' },
    { rule: 'fire hydrant clearance', pass: true, required_ft: 7, actual_ft: 22, cite: 'sf-fire' },
  ],
};

test('permitChecks excludes hydrant metrics and preserves other placement evidence', () => {
  assert.deepEqual(permitChecks(clearance), [
    { rule: 'restaurant entrance setback', pass: true, required_ft: 75, actual_ft: 120, cite: 'dpw-182101' },
    { rule: 'middle school setback', pass: true, required_ft: 500, actual_ft: 680, cite: 'dpw-182101' },
  ]);
});

test('localCuisine reports nearby cuisine and direct menu opportunity', () => {
  assert.deepEqual(
    localCuisine({ by_cuisine: { tacos: 4, coffee: 2, pizza: 0 } }, { overlapping: [] }),
    {
      nearby: [{ cuisine: 'tacos', count: 4 }, { cuisine: 'coffee', count: 2 }],
      menu_overlap_count: 0,
      opportunity: 'low_direct_overlap',
    },
  );
});

test('buildAreaInsights creates a navigable parking target with a curb-sign caveat', () => {
  const point = { lat: 37.78, lng: -122.4 };
  const result = buildAreaInsights({
    point,
    signals: {
      clearance,
      closures: { count: 0, closures: [] },
      restaurants: { by_cuisine: { tacos: 3 } },
    },
    competition: { overlapping: [{ name: 'Nearby tacos' }] },
    eliminated: false,
    travel: { minutes: 8, estimated: false },
    travelMode: 'driving',
  });

  assert.equal(result.parking.suitability, 'recommended');
  assert.deepEqual(result.parking.point, point);
  assert.equal(result.parking.permit_checks.length, 2);
  assert.match(result.parking.note, /posted curb and parking signs/i);
  assert.deepEqual(result.navigation, {
    destination: point,
    mode: 'driving',
    minutes: 8,
    estimated: false,
  });
});
