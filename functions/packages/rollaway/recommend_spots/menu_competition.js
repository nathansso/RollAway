/**
 * menu_competition.js — competition overlap between the user's menu and the
 * vendors/restaurants near a candidate spot (AGENT-BRIEF §4d).
 *
 * The real menu RAG (Person 3 / agents) is planned but not live yet. This code
 * targets its PINNED interface and ships a deterministic bridge so
 * recommend_spots is runnable now:
 *
 *   Interface (LOCKED — the RAG must match exactly):
 *     POST MENU_RAG_URL  { menu, nearby: { vendors, restaurants } }
 *       -> { overlap_score: 0..1, overlapping: [ { name, cuisine, price_tier } ] }
 *
 *   - MENU_RAG_URL set  -> call it, use its response.
 *   - else (bridge)     -> map menu items to the §C cuisine enum with the same
 *     keyword approach get_vendors/get_restaurants use (NO LLM), then overlap =
 *     share of nearby vendors/restaurants in the same cuisine + price tier.
 *
 * Coordination issue #B pins this interface across branches.
 */

'use strict';

const { fetchJSON, demoFetchOpts } = require('./shared');

// §C cuisine enum keyword map (mirrors get_restaurants CUISINE_KEYWORDS; kept
// local so this module is self-contained and LLM-free).
const CUISINE_KEYWORDS = [
  ['tacos', ['taco', 'taqueria', 'al pastor', 'carne asada']],
  ['burritos', ['burrito', 'mission burrito']],
  ['burgers', ['burger', 'hamburger', 'cheeseburger', 'smash']],
  ['hot_dogs', ['hot dog', 'hotdog', 'frank', 'sausage', 'bratwurst']],
  ['sandwiches', ['sandwich', 'deli', 'sub', 'panini', 'banh mi', 'wrap']],
  ['coffee', ['coffee', 'espresso', 'latte', 'cappuccino', 'cold brew', 'cafe']],
  ['ice_cream', ['ice cream', 'gelato', 'soft serve', 'sundae']],
  ['bbq', ['bbq', 'barbecue', 'brisket', 'ribs', 'pulled pork']],
  ['asian', ['asian', 'chinese', 'japanese', 'korean', 'vietnamese', 'thai', 'sushi',
    'ramen', 'noodle', 'dumpling', 'pho', 'bao', 'curry', 'pad thai', 'teriyaki', 'poke']],
  ['halal', ['halal', 'shawarma', 'kebab', 'gyro', 'falafel']],
  ['pizza', ['pizza', 'slice', 'margherita', 'pepperoni']],
  ['seafood', ['seafood', 'fish', 'shrimp', 'crab', 'lobster', 'oyster', 'ceviche']],
  ['desserts', ['dessert', 'bakery', 'donut', 'doughnut', 'pastry', 'cookie', 'cake', 'churro']],
  ['drinks', ['juice', 'boba', 'bubble tea', 'smoothie', 'lemonade', 'agua fresca', 'tea']],
];

/** Map one free-text menu item to a §C cuisine, or 'other'. */
function cuisineOf(text) {
  const hay = String(text || '').toLowerCase();
  for (const [cuisine, words] of CUISINE_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return cuisine;
  }
  return 'other';
}

/** Price -> tier bucket 1..4 (street-food scale). */
function priceTier(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  if (p < 8) return 1;
  if (p < 15) return 2;
  if (p < 30) return 3;
  return 4;
}

/** Cuisines + price tiers the user's menu represents. */
function profileMenu(menu) {
  const cuisines = new Set();
  const tiers = new Set();
  for (const item of Array.isArray(menu) ? menu : []) {
    const label = item && (item.item || item.name || item);
    const c = cuisineOf(label);
    if (c !== 'other') cuisines.add(c);
    const t = priceTier(item && item.price);
    if (t) tiers.add(t);
  }
  return { cuisines, tiers };
}

/**
 * Deterministic bridge overlap. Returns the LOCKED response shape.
 * `vendors` is get_vendors.vendors[]; `restaurants` is the get_restaurants body.
 */
function bridgeOverlap(menu, vendors, restaurants) {
  const { cuisines, tiers } = profileMenu(menu);
  const overlapping = [];

  // No menu (or all-'other') -> no menu-based competition signal.
  if (cuisines.size === 0) {
    return { overlap_score: 0, overlapping };
  }

  // Vendor competitors: same cuisine. Mobile food is ~tier 1, so a user selling
  // cheap items competes directly; higher tiers still overlap on cuisine.
  const vendorList = Array.isArray(vendors) ? vendors : [];
  let vendorMatches = 0;
  for (const v of vendorList) {
    if (v && cuisines.has(v.cuisine)) {
      vendorMatches++;
      overlapping.push({
        name: v.name || 'Unknown vendor',
        cuisine: v.cuisine,
        price_tier: 1,
      });
    }
  }

  // Restaurant competitors: get_restaurants gives per-cuisine and per-price
  // counts (not per-venue names), so restaurants contribute to the score and a
  // synthetic aggregate entry, but named rows come from vendors.
  const byCuisine = (restaurants && restaurants.by_cuisine) || {};
  const byPrice = (restaurants && restaurants.by_price) || {};
  let restaurantMatches = 0;
  for (const c of cuisines) {
    const n = byCuisine[c] || 0;
    if (n > 0) {
      restaurantMatches += n;
      overlapping.push({ name: `${n} nearby ${c} restaurant${n > 1 ? 's' : ''}`, cuisine: c, price_tier: null });
    }
  }

  // Price-tier similarity modulates the score: how much of the priced nearby
  // supply sits in the user's tier(s).
  const totalPriced = Object.values(byPrice).reduce((a, b) => a + b, 0);
  let priceShare = 1;
  if (tiers.size > 0 && totalPriced > 0) {
    let inTier = 0;
    for (const t of tiers) inTier += byPrice[String(t)] || 0;
    priceShare = inTier / totalPriced;
  }

  const totalNearby = vendorList.length + ((restaurants && restaurants.total) || 0);
  // max(4, ...) keeps a couple of matches in a near-empty area from spiking to 1.0.
  const raw = (vendorMatches + restaurantMatches) / Math.max(4, totalNearby);
  const overlap_score = clamp(raw * (0.5 + 0.5 * priceShare), 0, 1);

  return { overlap_score: round2(overlap_score), overlapping };
}

/**
 * menuCompetition — the module recommend_spots calls per candidate.
 * Uses MENU_RAG_URL when set, else the deterministic bridge.
 */
function normalizedMenu(userMenu) {
  const items = (Array.isArray(userMenu) ? userMenu : []).map((item) => ({
    name: String(item && (item.name || item.item || item) || '').trim(),
    price: Number.isFinite(Number(item && item.price)) ? Number(item.price) : null,
  })).filter((item) => item.name);
  return { items };
}

function competitorRows(vendors) {
  return (Array.isArray(vendors) ? vendors : []).map((vendor) => {
    const raw = String(vendor && (vendor.fooditems_raw || vendor.raw || '') || '');
    const items = Array.isArray(vendor && vendor.items)
      ? vendor.items
      : raw.split(/[:;,/\n]+/).map((item) => item.trim()).filter(Boolean);
    return {
      name: vendor && vendor.name ? vendor.name : 'Unknown vendor',
      items,
      price_points: Array.isArray(vendor && vendor.price_points) ? vendor.price_points : [],
    };
  }).filter((competitor) => competitor.items.length > 0);
}

/**
 * menuCompetition - the module recommend_spots calls per candidate.
 * Uses the direct Gradient Menu-RAG contract when configured, else the bridge.
 */
async function menuCompetition(userMenu, vendors, restaurants) {
  const url = process.env.MENU_RAG_URL;
  if (url) {
    try {
      const res = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_kb_id: process.env.MENU_KB_ID || null,
          menu: normalizedMenu(userMenu),
          competitors: competitorRows(vendors),
        }),
        timeoutMs: 6000,
        retries: 1,
        ...demoFetchOpts(),
      });
      const rows = Array.isArray(res && res.competitors) ? res.competitors : [];
      const summary = res && res.summary ? res.summary : {};
      const overlap = Number(summary.max_overlap);
      return {
        overlap_score: clamp(Number.isFinite(overlap) ? overlap : 0, 0, 1),
        overlapping: rows.filter((row) => Number(row.overlap_score) > 0).map((row) => ({
          name: row.name || 'Unknown competitor',
          overlap_score: clamp(Number(row.overlap_score) || 0, 0, 1),
          overlapping_items: Array.isArray(row.overlapping_items) ? row.overlapping_items : [],
          price_summary: row.price_summary || null,
        })),
      };
    } catch (err) {
      console.error('MENU_RAG_URL degraded to deterministic bridge:', err && err.message ? err.message : err);
    }
  }
  return bridgeOverlap(userMenu, vendors, restaurants);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { menuCompetition, bridgeOverlap, cuisineOf, priceTier, profileMenu, normalizedMenu, competitorRows };
