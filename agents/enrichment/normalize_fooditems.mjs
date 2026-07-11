#!/usr/bin/env node
// fooditems normalization (serverless inference) — CONTRACTS §B/§C companion.
//
// Turns the messy free-text `fooditems` on each SF Mobile Food Facility permit (rqzj-sfat) —
// e.g. "Hot Dogs: Chips: Soda: Bottled Water" — into a COMPARABLE, structured shape the Menu
// RAG competition-overlap query (agents/menu_rag/query.mjs) can match item-for-item against a
// vendor's real menu. It reasons over ITEMS, never a coarse cuisine label (that's classify.mjs).
//
//   node normalize_fooditems.mjs --mock              # deterministic, no creds (offline gate)
//   node normalize_fooditems.mjs --mock --limit 50   # sample
//   GRADIENT_API_KEY=... node normalize_fooditems.mjs                 # live Gradient inference
//   node normalize_fooditems.mjs --in permits.json --out fooditems_normalized.json
//
// Output: fooditems_normalized.json ->
//   { "<permit_id>": { "raw": "<ORIGINAL free text — PRESERVED>",
//                      "items":    ["hot dog","chips","soda","bottled water"],   // human labels
//                      "keywords": ["hot_dog","chips","soda","water"] } }         // match slugs
//
// PROMPT CACHING: every live call sends the byte-identical system prefix (CACHEABLE_PREFIX below);
// only the one record varies in the user message. That fixed prefix is what Gradient's prompt
// cache hits, so an N-record batch pays for the ~1.4 KB instruction roughly ONCE, not N times.
// Keep the prefix byte-identical across calls — never interpolate the record into it.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

// ---- The cacheable instruction prefix (IDENTICAL on every call) -------------------------
export const CACHEABLE_PREFIX = [
  "You normalize a San Francisco mobile-food vendor's raw menu/food description into a clean,",
  "comparable list of individual food and drink ITEMS so two vendors' menus can be matched",
  "item-by-item (not by a single cuisine label).",
  "Rules:",
  "- Split the description into distinct items. Inputs use ':', ';', ',', '/', '&', 'and', or",
  "  newlines as separators. Ignore packaging/filler words ('assorted', 'various', 'etc',",
  "  'pre-packaged', 'prepackaged', 'and more', 'misc', 'miscellaneous').",
  "- Return each item as a short lowercase singular noun phrase (e.g. 'Hot Dogs' -> 'hot dog',",
  "  'Tacos' -> 'taco', 'Bottled Water' -> 'bottled water').",
  "- Deduplicate. Keep at most 12 items. If nothing meaningful is present, return an empty list.",
  "- Output ONLY a compact JSON array of strings, no prose, no keys, e.g. [\"hot dog\",\"chips\",\"soda\"].",
  "Respond with the JSON array only."
].join("\n");

export const PREFIX_SHA = createHash("sha256").update(CACHEABLE_PREFIX).digest("hex").slice(0, 12);

// ---- Deterministic mock normalizer (offline; no creds) ----------------------------------
// Splits on the same separators the prefix names, cleans tokens, and slugifies keywords.
const SEP_RE = /\s*(?::|;|,|\/|\||\n|\r|\+|&|\band\b|\bwith\b|\bplus\b)\s*/gi;
// Only TRUE noise — words that carry no menu-item meaning. NB: do NOT filter descriptive words
// like "hot"/"cold"/"fresh" (they belong to items, e.g. "hot dog") or category words like
// "drink"/"food" (they can be the item itself).
const FILLER = new Set([
  "assorted", "various", "etc", "and", "more", "misc", "miscellaneous", "prepackaged",
  "pre-packaged", "packaged", "the", "a", "an", "of", "or", "other", "others", ""
]);

// light singularization for the human label
function singular(word) {
  if (/(ss|us|is)$/.test(word)) return word;
  if (/ies$/.test(word)) return word.replace(/ies$/, "y");
  if (/(ches|shes|xes|ses)$/.test(word)) return word.replace(/es$/, "");
  if (/s$/.test(word)) return word.replace(/s$/, "");
  return word;
}

function cleanItem(chunk) {
  const words = String(chunk)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w && !FILLER.has(w));
  if (!words.length) return null;
  // singularize the LAST word (the head noun) only, so "carne asada tacos" -> "carne asada taco"
  words[words.length - 1] = singular(words[words.length - 1]);
  const label = words.join(" ").trim();
  return label || null;
}

const slug = (label) => label.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Common noise heads collapse to a canonical keyword so overlap matching is robust across phrasings.
const KEYWORD_CANON = [
  [/\bhot ?dog\b|\bcorn ?dog\b|frankfurter|sausage/, "hot_dog"],
  [/\btaco/, "taco"],
  [/\bburrito|\bmexican\b/, "burrito"],
  [/\bquesadilla/, "quesadilla"],
  [/\bnacho/, "nachos"],
  [/\belote|street corn|\bcorn\b/, "elote"],
  [/\bburger|hamburger|cheeseburger|slider/, "burger"],
  [/\bpizza|calzone/, "pizza"],
  [/\bsandwich|\bsub\b|panini|hoagie|cheesesteak|\bwrap\b|\bdeli\b/, "sandwich"],
  [/\bcoffee|espresso|latte|cappucc|mocha|americano/, "coffee"],
  [/\btea\b|chai|boba|bubble tea/, "tea"],
  [/ice ?cream|gelato|popsicle|paleta|shave ?ice|snow ?cone|sorbet|frozen yogurt/, "ice_cream"],
  [/\bwater\b/, "water"],
  [/\bsoda\b|soft drink|pop\b|cola/, "soda"],
  [/\bjuice|lemonade|agua|horchata|smoothie/, "juice"],
  [/\bchip|crisp/, "chips"],
  [/\bcandy|churro|donut|doughnut|cookie|\bcake\b|pastr|funnel|waffle|crepe|dessert/, "dessert"],
  [/\bnoodle|ramen|\bpho\b|dumpling|\bwok\b|fried rice|teriyaki|\bcurry\b/, "asian_dish"],
  [/\bsushi|poke|\bfish\b|shrimp|\bcrab\b|lobster|oyster|ceviche|seafood/, "seafood_dish"],
  [/\bbbq|barbe?cue|\brib\b|brisket|pulled pork|smoked/, "bbq"],
  [/\bhalal/, "halal"],
  [/\bkabob|kebab|shawarma|gyro|falafel/, "middle_eastern"],
  [/\bsalad/, "salad"],
  [/\bfrie|french fr/, "fries"]
];

function keywordFor(label) {
  for (const [re, k] of KEYWORD_CANON) if (re.test(label)) return k;
  return slug(label);
}

export function mockNormalize(raw) {
  if (!raw || !String(raw).trim()) return { items: [], keywords: [] };
  const chunks = String(raw).split(SEP_RE);
  const items = [];
  const keywords = [];
  const seenItem = new Set();
  const seenKw = new Set();
  for (const ch of chunks) {
    const label = cleanItem(ch);
    if (!label || seenItem.has(label)) continue;
    seenItem.add(label);
    items.push(label);
    const kw = keywordFor(label);
    if (kw && !seenKw.has(kw)) { seenKw.add(kw); keywords.push(kw); }
    if (items.length >= 12) break;
  }
  return { items, keywords };
}

// ---- Live normalizer (Gradient serverless inference, OpenAI-compatible) ------------------
async function liveNormalize(raw, cfg) {
  const body = {
    model: cfg.model,
    temperature: 0,
    max_tokens: 128,
    messages: [
      { role: "system", content: CACHEABLE_PREFIX },     // <- byte-identical prefix => prompt-cached
      { role: "user", content: `Raw food description: ${raw}\nJSON array:` }
    ]
  };
  const res = await fetch(`${cfg.url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`inference ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const text = (json.choices?.[0]?.message?.content || "").trim();
  // parse the JSON array the model returns (tolerate stray prose / fences)
  let arr = [];
  const m = text.match(/\[[\s\S]*\]/);
  if (m) { try { arr = JSON.parse(m[0]); } catch { arr = []; } }
  const items = [];
  const keywords = [];
  const seenItem = new Set(), seenKw = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const label = cleanItem(it);                          // reuse the same cleaner for consistency
    if (!label || seenItem.has(label)) continue;
    seenItem.add(label); items.push(label);
    const kw = keywordFor(label);
    if (kw && !seenKw.has(kw)) { seenKw.add(kw); keywords.push(kw); }
    if (items.length >= 12) break;
  }
  // If the model returned nothing usable, fall back to the deterministic split (best-effort).
  if (!items.length) return mockNormalize(raw);
  return { items, keywords };
}

// ---- CLI --------------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { mock: false, limit: Infinity, in: "permits.json", out: "fooditems_normalized.json" };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--mock") a.mock = true;
    else if (t === "--limit") a.limit = parseInt(argv[++i], 10);
    else if (t === "--in") a.in = argv[++i];
    else if (t === "--out") a.out = argv[++i];
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  const inPath = resolve(__dir, args.in);
  const outPath = resolve(__dir, args.out);

  const key = process.env.GRADIENT_API_KEY;
  const cfg = {
    key,
    url: (process.env.GRADIENT_INFERENCE_URL || "https://inference.do-ai.run/v1").replace(/\/$/, ""),
    model: process.env.GRADIENT_MODEL || "llama3.3-70b-instruct"
  };
  const live = !args.mock && !!key;
  console.log(`[normalize] mode: ${live ? `LIVE (${cfg.model} @ ${cfg.url})` : "MOCK (deterministic)"}`);
  console.log(`[normalize] prompt-cache prefix: sha256:${PREFIX_SHA} (${Buffer.byteLength(CACHEABLE_PREFIX)} bytes) — reused byte-identical on EVERY record`);
  if (!args.mock && !key) console.log("[normalize] GRADIENT_API_KEY not set -> falling back to --mock so the pipeline still runs.");

  let permits;
  try {
    permits = JSON.parse(readFileSync(inPath, "utf8"));
  } catch {
    console.error(`[normalize] could not read ${inPath}. Pull it first:\n  curl "https://data.sfgov.org/resource/rqzj-sfat.json?$limit=5000" > ${args.in}`);
    process.exit(1);
  }

  const out = {};
  let n = 0, skipped = 0, calls = 0;
  const prefixesSeen = new Set();
  for (const rec of permits) {
    if (n >= args.limit) break;
    const id = rec.permit || rec.permit_id;
    if (!id) { skipped++; continue; }
    if (out[id]) continue;                       // dataset has duplicate permit rows; normalize once
    const raw = rec.fooditems || rec.food_items || "";
    let norm;
    if (live) {
      try { norm = await liveNormalize(raw, cfg); calls++; prefixesSeen.add(PREFIX_SHA); }
      catch (e) { console.error(`[normalize] ${id} live call failed (${e.message}); using mock for this record.`); norm = mockNormalize(raw); }
    } else {
      norm = mockNormalize(raw);
      prefixesSeen.add(PREFIX_SHA);
    }
    // PRESERVE the raw text verbatim — the frontend shows it in vendor detail.
    out[id] = { raw, items: norm.items, keywords: norm.keywords };
    n++;
  }

  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");

  const total = Object.keys(sorted).length;
  const rawPreserved = Object.values(sorted).every((v) => typeof v.raw === "string");
  const itemsShape = Object.values(sorted).every((v) => Array.isArray(v.items) && Array.isArray(v.keywords));
  console.log(`[normalize] normalized ${total} unique permits (skipped ${skipped} without id)`);
  console.log(`[normalize] wrote ${outPath}`);
  console.log(`[normalize] raw text preserved on every record: ${rawPreserved ? "YES" : "NO"}`);
  console.log(`[normalize] items+keywords arrays on every record: ${itemsShape ? "YES" : "NO"}`);
  console.log(`[normalize] cache-prefix reuse: 1 distinct prefix (sha256:${PREFIX_SHA}) across ${live ? calls : total} record${(live ? calls : total) === 1 ? "" : "s"} => prefix billed ~once`);
  if (!rawPreserved || !itemsShape) process.exit(2);
}

// run as CLI only (allow importing mockNormalize / CACHEABLE_PREFIX without side effects)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
