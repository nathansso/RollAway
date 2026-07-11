/**
 * get_restaurants — CONTRACTS.md §B.4
 *
 * Google Places API (New) Nearby Search, bucketed into the §C cuisine enum
 * and price_level 1-4, with a saturation verdict.
 *
 * saturation is popularity-weighted: each venue counts by review-mass ×
 * rating (popularity.js — Google exposes no busyness API, so review mass is
 * the proxy), not 1. Optional day/time_from/time_to inputs add a `window`
 * block scoring only venues OPEN during the vendor's planned setup window,
 * computed locally from regularOpeningHours (additive §B change — see
 * CONTRACTS.md §B.4).
 *
 * Without GOOGLE_PLACES_KEY (or if Places is unreachable) the bundled
 * data/sample_places.json fixture feeds the same pipeline so the §B.4 shape
 * always comes back. // TODO(real-key): fixture covers the SoMa/downtown demo
 * area only.
 *
 * Caching: the normalized place list is cached 6 h per warm container, keyed
 * by lat/lng rounded to 3 decimals (~110 m grid) + radius rounded to 50 m —
 * protects the Places free tier from map-jitter re-queries. Bucketing and
 * window math run per request (pure, ≤20 venues), so different windows share
 * one Places call. maxResultCount is capped at 20 by the API; the default
 * POPULARITY ranking means dense areas return the 20 most popular venues
 * (density undercounts there — see README).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  guard, ok, UpstreamError,
  validatePoint, validateDay, validateTime,
  fetchJSON, TTLCache, haversineMeters,
} = require('./shared');
const { venueWeight, windowOverlap, saturationVerdict } = require('./popularity');

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACES_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const OPEN_THRESHOLD = 0.5; // open ≥ half the window ⇒ counts as open competition
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
        // rating/userRatingCount/regularOpeningHours bill at the same
        // Enterprise SKU as priceLevel — adding them changes no cost tier.
        'X-Goog-FieldMask': 'places.displayName,places.types,places.priceLevel,places.location,'
          + 'places.rating,places.userRatingCount,places.regularOpeningHours',
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
      rating: p.rating || null,
      user_rating_count: p.userRatingCount || 0,
      periods: (p.regularOpeningHours && p.regularOpeningHours.periods) || null,
    }));
  } catch (err) {
    console.error('Places degraded to fixture:', err.message);
    return fixturePlaces(lat, lng, radius_m);
  }
}

function fixturePlaces(lat, lng, radius_m) {
  return SAMPLE_PLACES
    .filter((p) => haversineMeters(lat, lng, p.lat, p.lng) <= radius_m)
    .map((p) => ({
      name: p.name,
      types: p.types || [],
      price_level: p.price_level || null,
      rating: p.rating || null,
      user_rating_count: p.user_rating_count || 0,
      periods: p.periods || null,
    }));
}

/** Parse the optional setup-window args; null when none requested. */
function parseWindow(args) {
  const day = validateDay(args.day);
  const fromMin = validateTime(args.time_from);
  const toMin = validateTime(args.time_to);
  if (day === null && fromMin === null && toMin === null) return null;
  if (day === null || fromMin === null || toMin === null) {
    throw new UpstreamError('BAD_INPUT',
      "day, time_from and time_to must be provided together (e.g. day:'fri', time_from:'18:00', time_to:'22:00').");
  }
  if (fromMin === toMin) {
    throw new UpstreamError('BAD_INPUT',
      'time_from and time_to must differ (time_to <= time_from means the window runs overnight).');
  }
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { day, fromMin, toMin, time_from: hhmm(fromMin), time_to: hhmm(toMin) };
}

exports.main = guard(async (args) => {
  const { lat, lng, radius_m } = validatePoint(args, { defaultRadius: 300, maxRadius: 2000 });
  const win = parseWindow(args);

  const placeKey = `${lat.toFixed(3)},${lng.toFixed(3)},${Math.round(radius_m / 50) * 50}`;
  const places = await cache.getOrSet(placeKey, PLACES_TTL_MS, () =>
    fetchPlaces(lat, lng, radius_m)
  );

  const by_cuisine = {};
  const by_price = {};
  let weighted = 0;
  let weightedOpen = 0;
  let openTotal = 0;
  const open_by_cuisine = {};

  for (const p of places) {
    const c = bucketCuisine(p.name, p.types);
    by_cuisine[c] = (by_cuisine[c] || 0) + 1;
    if (p.price_level) {
      const k = String(p.price_level);
      by_price[k] = (by_price[k] || 0) + 1;
    }
    const w = venueWeight(p);
    weighted += w;
    if (win) {
      const overlap = windowOverlap(p.periods, win.day, win.fromMin, win.toMin);
      weightedOpen += w * overlap;
      if (overlap >= OPEN_THRESHOLD) {
        openTotal++;
        open_by_cuisine[c] = (open_by_cuisine[c] || 0) + 1;
      }
    }
  }

  const body = {
    total: places.length,
    by_cuisine,
    by_price,
    saturation: saturationVerdict(weighted, radius_m),
  };
  if (win) {
    body.window = {
      day: win.day,
      time_from: win.time_from,
      time_to: win.time_to,
      open_total: openTotal,
      open_by_cuisine,
      saturation_open: saturationVerdict(weightedOpen, radius_m),
    };
  }
  return ok(body);
});
