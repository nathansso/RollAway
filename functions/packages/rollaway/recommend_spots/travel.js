/**
 * travel.js — origin → candidate travel times for recommend_spots (AGENT-BRIEF §5).
 *
 * PRIMARY PATH: Mapbox Matrix API (one call for the origin → up-to-3
 * candidates fan-out) using MAPBOX_TOKEN. This is the expected, live path.
 *
 * DEMO_DATA_MODE: read the frozen matrix from demo_data/travel.<key>.json so
 * the demo is deterministic and fully offline (frozen by freeze_snapshots.mjs).
 *
 * TRANSIENT-FAILURE SAFETY NET ONLY: if Mapbox 5xx/times out (key present),
 * degrade to a deterministic haversine ÷ mode-speed estimate marked
 * `estimated: true`. This is NOT the normal path — never skip live Mapbox.
 */

'use strict';

const {
  fetchJSON, haversineMeters, isDemoMode, loadSnapshot, snapshotKey, demoFetchOpts,
} = require('./shared');

const MATRIX_URL = 'https://api.mapbox.com/directions-matrix/v1/mapbox';

// In-city travel speeds for the fallback estimate (m/s). Deliberately
// conservative — this only runs on a transient Mapbox failure.
const MODE_SPEED_MPS = { driving: 6.0, walking: 1.4, cycling: 4.0 };

// Mapbox routing profile per travel_mode. Anything unknown -> driving.
const MODE_PROFILE = { driving: 'driving', walking: 'walking', cycling: 'cycling' };

/** Deterministic key for the frozen travel matrix (origin-point based). */
function travelKey(origin, mode) {
  return `${snapshotKey({ lat: origin.lat, lng: origin.lng })}_${mode}`;
}

/** Haversine ÷ mode speed, rounded to 1 dp. The transient-failure estimate. */
function estimateMinutes(origin, dest, mode) {
  const speed = MODE_SPEED_MPS[mode] || MODE_SPEED_MPS.driving;
  const meters = haversineMeters(origin.lat, origin.lng, dest.lat, dest.lng);
  return Math.round((meters / speed / 60) * 10) / 10;
}

function estimateAll(origin, dests, mode) {
  return dests.map((d) => ({ minutes: estimateMinutes(origin, d, mode), estimated: true }));
}

/**
 * travelMinutes matrix: origin → each dest. Returns
 * [{ minutes: number, estimated: boolean }] aligned to `dests` order.
 * `mode` is a user travel_mode ('driving' | 'walking' | 'cycling').
 */
async function travelMatrix(origin, dests, mode = 'driving') {
  const m = MODE_SPEED_MPS[mode] ? mode : 'driving';

  // DEMO_DATA_MODE: frozen matrix if present, else offline estimate.
  if (isDemoMode()) {
    const snap = loadSnapshot('travel', travelKey(origin, m));
    if (snap && Array.isArray(snap.rows)) return snap.rows;
    console.warn(`DEMO_DATA_MODE: no frozen travel matrix for ${travelKey(origin, m)} — estimating`);
    return estimateAll(origin, dests, m);
  }

  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    // Should always be set (see .env). Loud warning, then estimate so the demo
    // never hard-fails on a missing token.
    console.warn('MAPBOX_TOKEN unset at runtime — falling back to haversine estimate (fix this!)');
    return estimateAll(origin, dests, m);
  }

  try {
    return await liveMatrix(origin, dests, m, token);
  } catch (err) {
    console.error('Mapbox Matrix degraded to haversine estimate:', err && err.message ? err.message : err);
    return estimateAll(origin, dests, m);
  }
}

async function liveMatrix(origin, dests, mode, token) {
  const profile = MODE_PROFILE[mode] || 'driving';
  // coords: origin first, then each destination. Mapbox uses lng,lat order.
  const points = [origin, ...dests];
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const destIdx = dests.map((_, i) => i + 1).join(';'); // destinations are indices 1..n
  const url = `${MATRIX_URL}/${profile}/${encodeURIComponent(coords)}` +
    `?sources=0&destinations=${destIdx}&annotations=duration&access_token=${token}`;

  const res = await fetchJSON(url, { timeoutMs: 6000, retries: 1, ...demoFetchOpts() });
  const durations = res && res.durations && res.durations[0];
  if (!Array.isArray(durations) || durations.length !== dests.length) {
    throw new Error('Mapbox Matrix returned an unexpected duration shape');
  }
  return durations.map((secs, i) => {
    if (secs === null || secs === undefined || !Number.isFinite(secs)) {
      // Mapbox couldn't route to this point — estimate just this leg.
      return { minutes: estimateMinutes(origin, dests[i], mode), estimated: true };
    }
    return { minutes: Math.round((secs / 60) * 10) / 10, estimated: false };
  });
}

module.exports = { travelMatrix, travelKey, estimateMinutes, MODE_SPEED_MPS };
