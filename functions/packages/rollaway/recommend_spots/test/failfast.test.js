/**
 * Fail-fast degrade test (AGENT-BRIEF §7.4). Proves §2b (fail-fast fetch
 * profile) + §2a-step-2 (live miss degrades to snapshot):
 *
 * In NON-demo mode with DEMO_FAILFAST=1, a live fetch to an unroutable host
 * aborts in ~2.5s (timeoutMs 2500, retries 0) and withData returns the frozen
 * snapshot instead of throwing — all in ≲3s, not the ~20s a retrying live path
 * would take.
 */

'use strict';

// NON-demo mode, but fail-fast profile on (as if DEMO_DATA_MODE drove it).
delete process.env.DEMO_DATA_MODE;
process.env.DEMO_FAILFAST = '1';

const test = require('node:test');
const assert = require('node:assert/strict');

const { withData, fetchJSON, demoFetchOpts, loadSnapshot, snapshotKey } = require('../shared');

// Reuse a snapshot the freeze step wrote for the demo anchor.
const ARGS = { lat: 37.78, lng: -122.40, radius_m: 500, day: 'fri', time: '12:00' };

test('a live miss degrades to the frozen snapshot in <=3s (fail-fast)', async () => {
  const expected = loadSnapshot('get_vendors', snapshotKey(ARGS));
  assert.ok(expected, 'precondition: get_vendors snapshot must be frozen (run freeze_snapshots.mjs)');

  const t0 = Date.now();
  const body = await withData('get_vendors', ARGS, async () => {
    // Unroutable TEST-NET host (RFC 5737) — connect blackholes until the 2.5s
    // AbortController fires. demoFetchOpts() supplies timeoutMs:2500, retries:0.
    await fetchJSON('http://192.0.2.1/never', { ...demoFetchOpts() });
    throw new Error('should have thrown before here');
  });
  const elapsed = Date.now() - t0;

  assert.deepEqual(body, expected, 'withData must return the frozen snapshot on a live miss');
  assert.ok(elapsed <= 3000, `degrade took ${elapsed}ms — expected <=3000ms (fail-fast)`);
});

test('demoFetchOpts is the 2.5s/0-retry profile when DEMO_FAILFAST is set', () => {
  assert.deepEqual(demoFetchOpts(), { timeoutMs: 2500, retries: 0 });
});
