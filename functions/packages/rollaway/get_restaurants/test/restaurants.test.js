/**
 * get_restaurants tests — pure popularity/window math + offline main() shape.
 * Run: npm test (node --test; no network, no GOOGLE_PLACES_KEY needed —
 * main() exercises the bundled fixture path).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { venueWeight, windowOverlap, saturationVerdict } = require('../popularity');
const { main } = require('../index');

// Every-day helper: same open/close (minutes) for all 7 Google days.
function daily(openH, openM, closeH, closeM, closeNextDay = false) {
  const periods = [];
  for (let d = 0; d < 7; d++) {
    periods.push({
      open: { day: d, hour: openH, minute: openM },
      close: { day: closeNextDay ? (d + 1) % 7 : d, hour: closeH, minute: closeM },
    });
  }
  return periods;
}

// ---------------------------------------------------------------- venueWeight

test('venueWeight ≈ 1.0 for a typical venue (300 reviews, 4.0★)', () => {
  const w = venueWeight({ rating: 4.0, user_rating_count: 300 });
  assert.ok(Math.abs(w - 1) < 0.01, `got ${w}`);
});

test('venueWeight: sparse-review venue weighs far below an established one', () => {
  const sparse = venueWeight({ rating: 4.0, user_rating_count: 3 });
  assert.ok(sparse < 0.3, `got ${sparse}`);
  assert.ok(venueWeight({ rating: 4.5, user_rating_count: 2000 }) > 1.2);
});

test('venueWeight clamps: zero reviews floors at 0.25, landmark caps at 3.75', () => {
  assert.equal(venueWeight({ user_rating_count: 0 }), 0.25);
  const max = venueWeight({ rating: 5, user_rating_count: 10_000_000 });
  assert.ok(max <= 3 * 1.25 + 1e-9, `got ${max}`);
});

test('venueWeight: missing rating is neutral (factor 1)', () => {
  assert.equal(
    venueWeight({ user_rating_count: 300 }),
    venueWeight({ rating: 4.0, user_rating_count: 300 })
  );
});

// -------------------------------------------------------------- windowOverlap

const from18 = 18 * 60;
const to22 = 22 * 60;

test('windowOverlap: venue open across the whole window → 1', () => {
  assert.equal(windowOverlap(daily(10, 0, 22, 0), 'fri', from18, to22), 1);
});

test('windowOverlap: venue closed all evening → 0 (coffee shop, 06:00-15:00)', () => {
  assert.equal(windowOverlap(daily(6, 0, 15, 0), 'fri', from18, to22), 0);
});

test('windowOverlap: partial coverage (closes 20:00 during an 18-22 window) → 0.5', () => {
  assert.equal(windowOverlap(daily(10, 0, 20, 0), 'fri', from18, to22), 0.5);
});

test('windowOverlap: overnight venue period (16:00-02:00 next day) covers a late window', () => {
  assert.equal(windowOverlap(daily(16, 0, 2, 0, true), 'fri', 22 * 60, 23 * 60 + 59), 1);
});

test('windowOverlap: overnight REQUEST window (fri 20:00-01:00) vs 10:00-22:00 venue → 2h/5h', () => {
  const overlap = windowOverlap(daily(10, 0, 22, 0), 'fri', 20 * 60, 1 * 60);
  assert.ok(Math.abs(overlap - 2 / 5) < 1e-9, `got ${overlap}`);
});

test('windowOverlap: saturday-night request wraps the week boundary (sat 22:00-02:00)', () => {
  // Venue open sat 16:00 → sun 02:00 (close.day wraps 6→0); window sat 22:00 → sun 02:00.
  const periods = [{ open: { day: 6, hour: 16, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }];
  assert.equal(windowOverlap(periods, 'sat', 22 * 60, 2 * 60), 1);
});

test('windowOverlap: 24h venue (open with no close) → 1', () => {
  assert.equal(windowOverlap([{ open: { day: 0, hour: 0, minute: 0 } }], 'mon', from18, to22), 1);
});

test('windowOverlap: missing hours data → 1 (assume open, conservative)', () => {
  assert.equal(windowOverlap(null, 'fri', from18, to22), 1);
  assert.equal(windowOverlap([], 'fri', from18, to22), 1);
});

// ---------------------------------------------------------- saturationVerdict

test('saturationVerdict thresholds at 300m radius (area ≈ 0.283 km²)', () => {
  assert.equal(saturationVerdict(2, 300), 'low');      // ~7/km²
  assert.equal(saturationVerdict(6, 300), 'medium');   // ~21/km²
  assert.equal(saturationVerdict(14, 300), 'high');    // ~50/km²
});

// ------------------------------------------------- main() offline (fixture)

const AT = { lat: 37.78, lng: -122.40, radius_m: 300 };

test('main without window: exactly the four §B.4 keys, saturation in enum', async () => {
  const res = await main({ ...AT });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['by_cuisine', 'by_price', 'saturation', 'total']);
  assert.ok(['low', 'medium', 'high'].includes(res.body.saturation));
  assert.ok(res.body.total > 0, 'fixture venues expected near the demo point');
});

test('main with window: adds exactly the window block; evening excludes daytime-only venues', async () => {
  // 500 m radius so the fixture deli (≈385 m out) is in scope — it must then
  // drop out of the evening window because it closes at 16:00.
  const res = await main({ ...AT, radius_m: 500, day: 'fri', time_from: '18:00', time_to: '22:00' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    Object.keys(res.body).sort(),
    ['by_cuisine', 'by_price', 'saturation', 'total', 'window']
  );
  const w = res.body.window;
  assert.deepEqual(
    Object.keys(w).sort(),
    ['day', 'open_by_cuisine', 'open_total', 'saturation_open', 'time_from', 'time_to']
  );
  assert.equal(w.day, 'fri');
  assert.equal(w.time_from, '18:00');
  assert.ok(w.open_total > 0 && w.open_total <= res.body.total);
  // Coffee shops in the fixture close by 15:00 — except 24h Third St Coffee.
  // Daytime-only sandwiches (Deli on Howard, closes 16:00) must drop out.
  assert.equal(w.open_by_cuisine.sandwiches, undefined);
  assert.equal(w.open_by_cuisine.coffee, 1); // only the 24h one
  assert.ok(['low', 'medium', 'high'].includes(w.saturation_open));
});

test('main: weekday-lunch window keeps the deli in', async () => {
  const res = await main({ ...AT, radius_m: 500, day: 'tue', time_from: '11:30', time_to: '13:30' });
  assert.equal(res.body.window.open_by_cuisine.sandwiches, 1);
});

test('main: partial window args → BAD_INPUT envelope', async () => {
  for (const bad of [
    { day: 'fri', time_from: '18:00' },              // missing time_to
    { time_from: '18:00', time_to: '22:00' },        // missing day
    { day: 'fri', time_from: '18:00', time_to: '18:00' }, // zero-length
  ]) {
    const res = await main({ ...AT, ...bad });
    assert.equal(res.statusCode, 400, JSON.stringify(bad));
    assert.equal(res.body.error.code, 'BAD_INPUT');
    assert.equal(typeof res.body.error.message, 'string');
  }
});

test('main: window args do not disturb the base §B fields (regression vs no-window)', async () => {
  const plain = await main({ ...AT });
  const windowed = await main({ ...AT, day: 'fri', time_from: '18:00', time_to: '22:00' });
  assert.equal(windowed.body.total, plain.body.total);
  assert.deepEqual(windowed.body.by_cuisine, plain.body.by_cuisine);
  assert.deepEqual(windowed.body.by_price, plain.body.by_price);
  assert.equal(windowed.body.saturation, plain.body.saturation);
});
