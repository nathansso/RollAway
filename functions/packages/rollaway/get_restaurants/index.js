/**
 * get_restaurants — CONTRACTS.md §B.4
 *
 * Google Places API (New) Nearby Search, bucketed into the §C cuisine enum
 * and price_level 1-4, with a saturation verdict.
 *
 * Without GOOGLE_PLACES_KEY (or if Places is unreachable) the bundled
 * data/sample_places.json fixture feeds the same bucketing pipeline so the
 * §B.4 shape always comes back. // TODO(real-key): fixture covers the
 * SoMa/downtown demo area only.
 *
 * Caching: results cached 6 h per warm container, keyed by lat/lng rounded to
 * 3 decimals (~110 m grid) + radius rounded to 50 m — protects the Places
 * free tier from map-jitter re-queries.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  guard, ok,
  validatePoint, fetchJSON, TTLCache, haversineMeters,
} = require('./shared');

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACES_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const cache = new TTLCache();

let SAMPLE_PLACES = [];
try {
  SAMPLE_PLACES = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'sample_places.json'), 'utf8')
  ).places;
} catch { /* fixture optional */ }

// §C enum (Person 2 owns it). Keyword mapping from Places types + names.
const CUISINE_KEYWORDS = [
  ['tacos', ['taco', 'taqueria']],
  ['burritos', ['burrito']],
  ['burgers', ['burger', 'hamburger_restaurant']],
  ['hot_dogs', ['hot dog', 'hot_dog']],
  ['sandwiches', ['sandwich', 'deli', 'sandwich_shop']],
  ['coffee', ['coffee', 'cafe', 'coffee_shop', 'espresso']],
  ['ice_cream', ['ice cream', 'ice_cream_shop', 'gelato']],
  ['bbq', ['bbq', 'barbecue', 'barbecue_restaurant']],
  ['asian', ['asian', 'chinese', 'japanese', 'korean', 'vietnamese', 'thai', 'sushi', 'ramen',
    'chinese_restaurant', 'japanese_restaurant', 'korean_restaurant', 'vietnamese_restaurant',
    'thai_restaurant', 'sushi_restaurant', 'ramen_restaurant', 'indian_restaurant', 'indian']],
  ['halal', ['halal']],
  ['pizza', ['pizza', 'pizza_restaurant', 'pizzeria']],
  ['seafood', ['seafood', 'seafood_restaurant', 'fish']],
  ['desserts', ['dessert', 'bakery', 'donut', 'pastry', 'dessert_shop']],
  ['drinks', ['juice', 'bar', 'boba', 'bubble tea', 'tea_house', 'juice_shop', 'smoothie']],
];

function bucketCuisine(name, types) {
  const hay = `${name} ${types.join(' ')}`.toLowerCase();
  for (const [cuisine, words] of CUISINE_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return cuisine;
  }
  return 'other';
}

const PRICE_LEVEL_MAP = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// saturation thresholds: food places per km^2 of the searched circle.
// A dense corridor like Valencia runs >60/km^2; a quiet block <10.
const SATURATION = { medium: 15, high: 40 };

async function fetchPlaces(lat, lng, radius_m) {
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return fixturePlaces(lat, lng, radius_m); // TODO(real-key)
  try {
    const res = await fetchJSON(PLACES_URL, {
      method: 'POST',
      timeoutMs: 6000,
      retries: 1,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.types,places.priceLevel,places.location',
      },
      body: JSON.stringify({
        includedTypes: ['restaurant', 'cafe', 'meal_takeaway', 'bakery', 'bar'],
        maxResultCount: 20,
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius: radius_m },
        },
      }),
    });
    return (res.places || []).map((p) => ({
      name: (p.displayName && p.displayName.text) || '',
      types: p.types || [],
      price_level: PRICE_LEVEL_MAP[p.priceLevel] || null,
    }));
  } catch (err) {
    console.error('Places degraded to fixture:', err.message);
    return fixturePlaces(lat, lng, radius_m);
  }
}

function fixturePlaces(lat, lng, radius_m) {
  return SAMPLE_PLACES
    .filter((p) => haversineMeters(lat, lng, p.lat, p.lng) <= radius_m)
    .map((p) => ({ name: p.name, types: p.types || [], price_level: p.price_level || null }));
}

exports.main = guard(async (args) => {
  const { lat, lng, radius_m } = validatePoint(args, { defaultRadius: 300, maxRadius: 2000 });
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${Math.round(radius_m / 50) * 50}`;

  const body = await cache.getOrSet(cacheKey, PLACES_TTL_MS, async () => {
    const places = await fetchPlaces(lat, lng, radius_m);

    const by_cuisine = {};
    const by_price = {};
    for (const p of places) {
      const c = bucketCuisine(p.name, p.types);
      by_cuisine[c] = (by_cuisine[c] || 0) + 1;
      if (p.price_level) {
        const k = String(p.price_level);
        by_price[k] = (by_price[k] || 0) + 1;
      }
    }

    const areaKm2 = Math.PI * (radius_m / 1000) ** 2;
    const density = places.length / areaKm2;
    const saturation =
      density >= SATURATION.high ? 'high' : density >= SATURATION.medium ? 'medium' : 'low';

    return { total: places.length, by_cuisine, by_price, saturation };
  });

  return ok(body);
});
