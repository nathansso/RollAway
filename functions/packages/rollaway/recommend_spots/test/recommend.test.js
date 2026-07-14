/**
 * recommend_spots integration tests (node:test — `npm test`). Runs entirely in
 * DEMO_DATA_MODE against the frozen snapshots, so it is deterministic and
 * offline (no network, no LLM, no keys required).
 *
 * Asserts (AGENT-BRIEF §7.2/§7.3):
 *  - exactly 3 spots, each with a full score_breakdown
 *  - at least one ranked (rank 1..n) candidate
 *  - deterministic: identical JSON across two runs
 *  - a single (or ZERO) Spot Scout call, no router turn
 *  - an eliminated candidate carries violations[]
 *  - snapshot determinism for a base Function (get_vendors twice)
 */

'use strict';

// Demo mode + no agent/RAG endpoints => fully offline, zero Spot Scout calls.
process.env.DEMO_DATA_MODE = '1';
delete process.env.SPOT_SCOUT_URL;
delete process.env.MENU_RAG_URL;
delete process.env.FUNCTIONS_BASE_URL;

const test = require('node:test');
const assert = require('node:assert/strict');

const { main } = require('../index');
const getVendors = require('../../get_vendors/index');

const BREAKDOWN_KEYS = ['foot_traffic', 'competition', 'legality', 'closures', 'events', 'travel_minutes'];

const DEMO_INPUT = {
  user_profile: {
    vendor_type: 'truck',
    menu: [{ item: 'al pastor taco', price: 4.5 }, { item: 'horchata', price: 3 }],
    max_travel_minutes: 15,
    travel_mode: 'driving',
  },
  when: { day: 'fri', time: '12:00', hour: 12, date_from: '2026-07-17', date_to: '2026-07-17' },
  location: { lat: 37.78, lng: -122.40, radius_m: 500 },
};

test('returns exactly 3 spots, each with a full score_breakdown', async () => {
  const res = await main(DEMO_INPUT);
  assert.equal(res.statusCode, 200);
  const spots = res.body.spots;
  assert.equal(spots.length, 3, 'must return exactly 3 candidates');
  for (const s of spots) {
    assert.ok(s.id && /^spot-[123]$/.test(s.id));
    assert.ok(s.point && Number.isFinite(s.point.lat) && Number.isFinite(s.point.lng));
    assert.ok(typeof s.block_label === 'string' && s.block_label.length > 0);
    assert.ok(['good', 'caution', 'avoid'].includes(s.verdict));
    assert.equal(typeof s.score, 'number');
    assert.equal(typeof s.eliminated, 'boolean');
    assert.ok(Array.isArray(s.violations));
    assert.ok(typeof s.why_one_line === 'string' && s.why_one_line.length > 0);
    for (const k of BREAKDOWN_KEYS) {
      assert.ok(k in s.score_breakdown, `score_breakdown.${k} missing`);
    }
    // legality carries the raw check_clearance rows
    assert.ok(Array.isArray(s.score_breakdown.legality.checks));
    assert.equal(typeof s.score_breakdown.legality.pass, 'boolean');
    // competition carries penalty + overlapping list
    assert.equal(typeof s.score_breakdown.competition.penalty, 'number');
    assert.ok(Array.isArray(s.score_breakdown.competition.overlapping));
    assert.ok(s.area_insights && s.area_insights.parking);
    assert.deepEqual(s.area_insights.parking.point, s.point);
    assert.ok(!s.area_insights.parking.permit_checks.some((check) => /hydrant/i.test(check.rule)));
    assert.ok(Array.isArray(s.area_insights.local_cuisine.nearby));
    assert.deepEqual(s.area_insights.navigation.destination, s.point);
  }
});

test('at least one candidate is ranked (rank 1..n)', async () => {
  const res = await main(DEMO_INPUT);
  const ranked = res.body.spots.filter((s) => s.rank !== null && !s.eliminated);
  assert.ok(ranked.length >= 1, 'expected at least one ranked, non-eliminated spot');
  // ranks are contiguous from 1
  const ranks = ranked.map((s) => s.rank).sort((a, b) => a - b);
  ranks.forEach((r, i) => assert.equal(r, i + 1, 'ranks must be 1..n contiguous'));
  // eliminated spots are unranked and listed after ranked ones
  const idx = res.body.spots.findIndex((s) => s.eliminated);
  if (idx !== -1) {
    assert.equal(res.body.spots[idx].rank, null, 'eliminated spot must be unranked');
  }
});

test('an eliminated candidate carries violations[]', async () => {
  const res = await main(DEMO_INPUT);
  const eliminated = res.body.spots.filter((s) => s.eliminated);
  assert.ok(eliminated.length >= 1, 'demo scenario should eliminate at least one candidate');
  for (const s of eliminated) {
    assert.ok(s.violations.length >= 1, 'eliminated candidate must carry >=1 violation');
    assert.equal(s.verdict, 'avoid');
    for (const v of s.violations) {
      assert.ok(typeof v.rule === 'string' && v.rule.length > 0);
    }
  }
});

test('deterministic: identical JSON across two runs (no router, offline)', async () => {
  const a = await main(DEMO_INPUT);
  const b = await main(DEMO_INPUT);
  assert.equal(JSON.stringify(a.body), JSON.stringify(b.body), 'output must be byte-identical run to run');
});

test('zero Spot Scout calls + no router: why-lines are deterministic templates', async () => {
  // With SPOT_SCOUT_URL unset the orchestrator makes NO agent call at all (no
  // router, no per-candidate turns) — why_one_line is produced from the
  // breakdown deterministically. The eliminated spot's line states the reason.
  assert.equal(process.env.SPOT_SCOUT_URL, undefined);
  const res = await main(DEMO_INPUT);
  const elim = res.body.spots.find((s) => s.eliminated);
  if (elim) assert.match(elim.why_one_line, /Not recommended/);
  const ranked = res.body.spots.find((s) => !s.eliminated);
  assert.ok(/foot traffic/i.test(ranked.why_one_line));
});

test('snapshot determinism: a base Function returns byte-identical output twice', async () => {
  const args = { lat: 37.78, lng: -122.40, radius_m: 500, day: 'fri', time: '12:00' };
  const r1 = await getVendors.main(args);
  const r2 = await getVendors.main(args);
  assert.equal(JSON.stringify(r1.body), JSON.stringify(r2.body));
  assert.ok(Array.isArray(r1.body.vendors));
});

test('defaults from scenario.json when when/location omitted', async () => {
  const res = await main({ user_profile: { vendor_type: 'truck' } });
  assert.equal(res.statusCode, 200);
  // #8: with no explicit travel_mode, a short-radius (in-neighborhood) search
  // now defaults to walking instead of driving. Offline (frozen, all-estimated
  // travel matrix) nothing is ever eliminated, so the range sampler returns the
  // full K_SPOTS=5. With live keys the old driving default snapped to a freeway
  // on-ramp and eliminated near candidates down to 3; walking keeps all 5.
  assert.equal(res.body.spots.length, 5);
});

test('rejects an invalid vendor_type with BAD_INPUT', async () => {
  const res = await main({ user_profile: { vendor_type: 'blimp' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'BAD_INPUT');
});
