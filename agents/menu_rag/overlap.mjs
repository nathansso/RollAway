// Menu competition-overlap CORE — pure, deterministic, no network.
//
// Reasons over MENU ITEMS + PRICE POINTS, never a coarse cuisine label. Given THIS vendor's real
// menu (items + prices) and a competitor's NORMALIZED items (+ optional price points), it returns
// how much the competitor overlaps the vendor's menu, which specific items collide, and how their
// prices compare. This is the reliable demo path AND the fallback the live KB query degrades to.
//
// Shared item→match-token logic reuses the fooditems normalizer so a competitor's items are
// tokenized exactly the way the enrichment pipeline tokenizes them (no drift).

import { mockNormalize } from "../enrichment/normalize_fooditems.mjs";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Build the set of match tokens for one item. Combines: canonical keyword(s) from the name (via
// the shared normalizer) + any explicitly-provided keywords (slugified) + the slugified name.
function matchTokens(item) {
  const name = typeof item === "string" ? item : (item.name || item.item || "");
  const provided = (typeof item === "object" && Array.isArray(item.keywords)) ? item.keywords : [];
  const toks = new Set();
  for (const k of mockNormalize(name).keywords) toks.add(k);
  for (const k of provided) { const s = slug(k); if (s) toks.add(s); }
  const ns = slug(name);
  if (ns) toks.add(ns);
  return toks;
}

function itemPrice(item) {
  if (typeof item !== "object" || item == null) return null;
  const p = item.price != null ? item.price : (item.price_point != null ? item.price_point : null);
  return typeof p === "number" && !Number.isNaN(p) ? p : null;
}

// Normalize a vendor menu ({items:[{name,keywords,price}]}) into internal item records.
export function normalizeMenu(menu) {
  const items = (menu.items || []).map((it) => ({
    name: typeof it === "string" ? it : (it.name || ""),
    tokens: matchTokens(it),
    price: itemPrice(it)
  }));
  return { vendor_id: menu.vendor_id || null, vendor_name: menu.vendor_name || null, items };
}

// Normalize a competitor. Accepts:
//   { name, items:[strings|{name,keywords,price}], keywords:[...], price_points:[...], price_level }
// `keywords` (from fooditems_normalized.json) and bare `items` strings are both supported.
export function normalizeCompetitor(comp) {
  const rawItems = [];
  if (Array.isArray(comp.items)) {
    for (const it of comp.items) rawItems.push(it);
  }
  // A competitor described only by normalized keywords (e.g. a permit vendor from
  // fooditems_normalized.json) — treat each keyword as an item.
  if ((!rawItems.length) && Array.isArray(comp.keywords)) {
    for (const k of comp.keywords) rawItems.push(k);
  }
  const prices = Array.isArray(comp.price_points) ? comp.price_points.filter((n) => typeof n === "number") : [];
  // price_level 1..4 -> a representative dollar band midpoint (only used if item prices absent).
  const levelBand = { 1: 4, 2: 9, 3: 18, 4: 35 };
  const items = rawItems.map((it, i) => ({
    name: typeof it === "string" ? it : (it.name || ""),
    tokens: matchTokens(it),
    price: itemPrice(it) != null ? itemPrice(it) : (prices[i] != null ? prices[i] : null)
  }));
  return {
    name: comp.name || "competitor",
    items,
    price_points: prices,
    price_level: typeof comp.price_level === "number" ? comp.price_level : null,
    level_band: typeof comp.price_level === "number" ? levelBand[comp.price_level] || null : null
  };
}

function tokensOverlap(a, b) {
  for (const t of a) if (b.has(t)) return true;
  return false;
}

function priceCompare(mine, theirs) {
  if (mine == null || theirs == null) return { gap: null, note: null };
  const gap = +(theirs - mine).toFixed(2);
  let note;
  const rel = mine === 0 ? 0 : gap / mine;
  if (Math.abs(rel) <= 0.15) note = "similar price";
  else if (gap < 0) note = "they undercut you";
  else note = "you undercut them";
  return { gap, note };
}

function verdictFor(score) {
  if (score >= 0.5) return "high";
  if (score >= 0.2) return "medium";
  return "low";
}

// Compare ONE competitor against the normalized vendor menu.
export function overlapOne(vendorMenu, competitorRaw) {
  const comp = normalizeCompetitor(competitorRaw);
  const overlapping_items = [];
  const matchedMyIdx = new Set();
  const matchedCompIdx = new Set();

  vendorMenu.items.forEach((mine, mi) => {
    comp.items.forEach((theirs, ci) => {
      if (tokensOverlap(mine.tokens, theirs.tokens)) {
        matchedMyIdx.add(mi);
        matchedCompIdx.add(ci);
        const theirPrice = theirs.price != null ? theirs.price : comp.level_band;
        const { gap, note } = priceCompare(mine.price, theirPrice);
        overlapping_items.push({
          my_item: mine.name,
          competitor_item: theirs.name || [...theirs.tokens][0] || "",
          shared: [...mine.tokens].filter((t) => theirs.tokens.has(t)),
          price_mine: mine.price,
          price_theirs: theirPrice,
          price_gap: gap,
          price_note: note
        });
      }
    });
  });

  const denom = vendorMenu.items.length || 1;
  const overlap_score = +(matchedMyIdx.size / denom).toFixed(3);
  // Aggregate price signal across matched pairs that have both prices.
  const priced = overlapping_items.filter((o) => o.price_gap != null);
  let price_summary = "prices not comparable";
  if (priced.length) {
    const avgGap = +(priced.reduce((s, o) => s + o.price_gap, 0) / priced.length).toFixed(2);
    price_summary = avgGap > 0.5 ? `you're ~$${avgGap.toFixed(2)} cheaper on shared items`
      : avgGap < -0.5 ? `you're ~$${Math.abs(avgGap).toFixed(2)} pricier on shared items`
      : "similar prices on shared items";
  }

  return {
    name: comp.name,
    overlap_score,
    verdict: verdictFor(overlap_score),
    matched_my_items: matchedMyIdx.size,
    matched_competitor_items: matchedCompIdx.size,
    competitor_item_count: comp.items.length,
    overlapping_items: dedupeOverlaps(overlapping_items),
    price_summary
  };
}

// One competitor item can token-match several of my items; keep the clearest pair per (my_item).
function dedupeOverlaps(list) {
  const seen = new Set();
  const out = [];
  for (const o of list) {
    const k = `${o.my_item}||${o.competitor_item}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out.slice(0, 20);
}

// Full competition-overlap result over MANY competitors.
export function competitionOverlapCore(menu, competitors) {
  const vendorMenu = normalizeMenu(menu);
  const per = (competitors || []).map((c) => overlapOne(vendorMenu, c));
  const scores = per.map((p) => p.overlap_score);
  const max = scores.length ? Math.max(...scores) : 0;
  const mean = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3) : 0;
  const most = per.slice().sort((a, b) => b.overlap_score - a.overlap_score)[0] || null;
  return {
    vendor: { vendor_id: vendorMenu.vendor_id, vendor_name: vendorMenu.vendor_name, menu_item_count: vendorMenu.items.length },
    competitors: per,
    summary: {
      competitor_count: per.length,
      mean_overlap: mean,
      max_overlap: max,
      most_overlapping: most ? most.name : null,
      direct_competitors: per.filter((p) => p.verdict === "high").length,
      reasoned_over: "menu items + price points (never a cuisine label)"
    }
  };
}
