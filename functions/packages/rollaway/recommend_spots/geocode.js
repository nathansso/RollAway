/**
 * geocode.js — reverse-geocode a spot point to a street address (issue #17),
 * via the Google Geocoding API using GOOGLE_MAPS_SERVER_KEY (server-side only).
 * Returns the formatted address string, or null when unavailable.
 */

'use strict';

const { fetchJSON, demoFetchOpts } = require('./shared');

const GEO_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

async function reverseGeocode(point, key) {
  if (!key || !point) return null;
  const params = new URLSearchParams({
    latlng: `${point.lat},${point.lng}`,
    key,
  });
  try {
    const res = await fetchJSON(`${GEO_URL}?${params.toString()}`, {
      timeoutMs: 6000,
      retries: 1,
      ...demoFetchOpts(),
    });
    if (!res || res.status !== 'OK' || !Array.isArray(res.results) || !res.results[0]) {
      return null;
    }
    return res.results[0].formatted_address || null;
  } catch (err) {
    console.error('reverseGeocode failed:', err && err.message ? err.message : err);
    return null;
  }
}

module.exports = { reverseGeocode };
