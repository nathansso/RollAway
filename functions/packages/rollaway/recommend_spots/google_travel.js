/**
 * google_travel.js — traffic-aware origin -> candidates travel via the Google
 * Distance Matrix API (issue #17). Server-side only: uses GOOGLE_MAPS_SERVER_KEY
 * (no referrer restriction). `departure_time` yields `duration_in_traffic`.
 *
 * Returns rows aligned to `dests`: [{ minutes, estimated, meters }]. An
 * unroutable element (ZERO_RESULTS / NOT_FOUND) becomes { minutes: null }.
 */

'use strict';

const { fetchJSON, demoFetchOpts } = require('./shared');

const DM_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const GOOGLE_MODE = { driving: 'driving', walking: 'walking', cycling: 'bicycling' };
const MAX_DESTS = 25; // Distance Matrix: <=25 destinations / <=100 elements per request

/** Future departure epoch (secs) derived from `when`, else 'now'. */
function toDepartureTime(when) {
  if (!when || !when.date_from) return 'now';
  const time = when.time && /^\d{1,2}:\d{2}/.test(when.time) ? when.time : '12:00';
  const parsed = new Date(`${when.date_from}T${time}:00`);
  const epoch = Math.floor(parsed.getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  // Distance Matrix only accepts a future (or present) departure_time.
  return Number.isFinite(epoch) && epoch > now ? epoch : 'now';
}

async function googleMatrix(origin, dests, mode, key, when) {
  const gmode = GOOGLE_MODE[mode] || 'driving';
  const departure = toDepartureTime(when);
  const rows = new Array(dests.length);

  for (let start = 0; start < dests.length; start += MAX_DESTS) {
    const batch = dests.slice(start, start + MAX_DESTS);
    const params = new URLSearchParams({
      origins: `${origin.lat},${origin.lng}`,
      destinations: batch.map((d) => `${d.lat},${d.lng}`).join('|'),
      mode: gmode,
      key,
    });
    if (gmode === 'driving') {
      params.set('departure_time', String(departure));
      params.set('traffic_model', 'best_guess');
    }

    const res = await fetchJSON(`${DM_URL}?${params.toString()}`, {
      timeoutMs: 8000,
      retries: 1,
      ...demoFetchOpts(),
    });
    if (!res || res.status !== 'OK' || !Array.isArray(res.rows) || !res.rows[0]) {
      throw new Error(`Distance Matrix status ${res && res.status}`);
    }
    const elements = res.rows[0].elements || [];
    for (let i = 0; i < batch.length; i += 1) {
      const el = elements[i];
      if (!el || el.status !== 'OK') {
        rows[start + i] = { minutes: null, estimated: true, meters: null };
        continue;
      }
      const secs =
        (el.duration_in_traffic && el.duration_in_traffic.value) ||
        (el.duration && el.duration.value);
      rows[start + i] = {
        minutes: Number.isFinite(secs) ? Math.round((secs / 60) * 10) / 10 : null,
        estimated: false,
        meters: el.distance && Number.isFinite(el.distance.value) ? el.distance.value : null,
      };
    }
  }
  return rows;
}

module.exports = { googleMatrix, toDepartureTime, GOOGLE_MODE, MAX_DESTS };
