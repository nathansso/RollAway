/**
 * check_clearance — CONTRACTS.md §B "Clearance geometry check". THE INVARIANT:
 * the law is computed as real code (turf.js geodesics, feet), never by the LLM.
 *
 * Rules (thresholds + cite ids centralized in constants.js):
 *  - 75 ft from restaurant entrances   (Google Places points; bundled fixture
 *                                       when GOOGLE_PLACES_KEY is unset)
 *  - 500 ft from middle schools during school hours (data/schools.geojson
 *                                       snapshot of Socrata 7e7j-59qk)
 *  - 7 ft from fire hydrants           (data/hydrants.geojson snapshot from
 *                                       OpenStreetMap — data.sfgov.org has no
 *                                       hydrant dataset; if the snapshot is
 *                                       empty the check is SKIPPED, see README)
 *  - pushcart sidewalk clearance       (data/sidewalks.geojson snapshot of
 *                                       Sidewalk Widths 2014, pushcart_* only)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { featureCollection, point: turfPoint } = require('@turf/helpers');
const distance = require('@turf/distance').default;

const {
  guard, ok, UpstreamError,
  validatePoint, fetchJSON, TTLCache, VENDOR_TYPES,
  withData, demoFetchOpts, isDemoMode,
} = require('./shared');
const { buildChecks } = require('./rules');
const { RESTAURANT_SEARCH_RADIUS_M } = require('./constants');

function loadGeoJSON(name) {
  try {
    // require() rejects the .geojson extension, so read + parse explicitly
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', name), 'utf8'));
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

const SCHOOLS = loadGeoJSON('schools.geojson');
const HYDRANTS = loadGeoJSON('hydrants.geojson');
const SIDEWALKS = loadGeoJSON('sidewalks.geojson');
const SAMPLE_RESTAURANTS = loadGeoJSON('sample_restaurants.geojson');

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACES_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — restaurant entrances don't move
const placesCache = new TTLCache();

/**
 * Restaurant entrance points within RESTAURANT_SEARCH_RADIUS_M of the spot,
 * as a Point FeatureCollection.
 * - With GOOGLE_PLACES_KEY: Places API (New) Nearby Search, cached 6 h by
 *   rounded coordinate (~110 m grid) to respect free-tier quota.
 * - Without a key: bundled data/sample_restaurants.geojson fixture, radius
 *   filtered. // TODO(real-key): fixture only covers the SoMa demo area.
 * - Places upstream failure degrades to the fixture rather than failing the
 *   whole clearance response.
 */
async function getRestaurantEntrances(lat, lng) {
  const key = process.env.GOOGLE_PLACES_KEY;
  // Demo mode is fully offline: the entrance lookup is the ONLY network call in
  // this Function, so in DEMO_DATA_MODE we use the bundled fixture and never
  // touch Places. Geometry math is unchanged either way.
  if (isDemoMode() || !key) return fixtureRestaurants(lat, lng); // TODO(real-key)

  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  try {
    return await placesCache.getOrSet(cacheKey, PLACES_TTL_MS, async () => {
      const res = await fetchJSON(PLACES_URL, {
        method: 'POST',
        timeoutMs: 6000,
        retries: 1,
        ...demoFetchOpts(),
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.displayName,places.location',
        },
        body: JSON.stringify({
          includedTypes: ['restaurant', 'cafe', 'meal_takeaway', 'bakery'],
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: RESTAURANT_SEARCH_RADIUS_M,
            },
          },
        }),
      });
      const features = (res.places || [])
        .filter((p) => p.location)
        .map((p) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [p.location.longitude, p.location.latitude],
          },
          properties: { name: p.displayName && p.displayName.text },
        }));
      return featureCollection(features);
    });
  } catch (err) {
    console.error('Places degraded to fixture:', err.message);
    return fixtureRestaurants(lat, lng);
  }
}

function fixtureRestaurants(lat, lng) {
  const origin = turfPoint([lng, lat]);
  return featureCollection(
    (SAMPLE_RESTAURANTS.features || []).filter(
      (f) => distance(origin, f, { units: 'meters' }) <= RESTAURANT_SEARCH_RADIUS_M
    )
  );
}

exports.main = guard(async (args) => {
  const { lat, lng } = validatePoint(args, { defaultRadius: 1, maxRadius: 5000 });
  const vendor_type = String(args.vendor_type || '').toLowerCase();
  if (!VENDOR_TYPES.includes(vendor_type)) {
    throw new UpstreamError(
      'BAD_INPUT',
      `vendor_type must be one of ${VENDOR_TYPES.join(', ')} (got '${args.vendor_type}').`
    );
  }

  // Honors DEMO_DATA_MODE (snapshot keyed by point + vendor_type). Geometry is
  // deterministic and offline; only the restaurant-entrance lookup can be live.
  const body = await withData('check_clearance', { lat, lng, vendor_type }, async () => {
    const restaurantsFC = await getRestaurantEntrances(lat, lng);
    const { allowed, checks } = buildChecks({
      lat, lng, vendor_type,
      restaurantsFC,
      schoolsFC: SCHOOLS,
      hydrantsFC: HYDRANTS,
      sidewalksFC: SIDEWALKS,
      now: new Date(),
    });
    return { allowed, checks };
  });
  return ok(body);
});
