#!/usr/bin/env node
// Cuisine enrichment — map each permit's free-text `fooditems` to ONE §C cuisine enum value.
//
//   node classify.mjs --mock                 # deterministic, no creds (runnable now)
//   GRADIENT_API_KEY=... node classify.mjs   # live Gradient serverless inference
//   node classify.mjs --mock --limit 50      # sample
//   node classify.mjs --in permits.json --out cuisine_lookup.json
//
// Output: cuisine_lookup.json  ->  { "<permit_id>": "tacos", ... }   (keyed by permit_id)
// This is the PRE-COMPUTED lookup table Person 3's get_vendors joins on (see README.md).
//
// Prompt caching: every live call sends the IDENTICAL system prefix (CACHEABLE_PREFIX below);
// only the one record varies in the user message. That fixed prefix is what Gradient caches.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

// ---- §C enum (Person 2 owns this; any change pings P1 + P3) ----------------------------
export const CUISINES = [
  "tacos", "burritos", "burgers", "hot_dogs", "sandwiches", "coffee", "ice_cream",
  "bbq", "asian", "halal", "pizza", "seafood", "desserts", "drinks", "other"
];

// ---- The cacheable instruction prefix (IDENTICAL on every call) -------------------------
export const CACHEABLE_PREFIX = [
  "You are a food-cuisine classifier for San Francisco mobile food vendors.",
  "Map the vendor's free-text food description to EXACTLY ONE category from this fixed list:",
  CUISINES.join(", ") + ".",
  "Rules:",
  "- Output ONLY the single category token, lowercase, no punctuation, no explanation.",
  "- Pick the single best primary category. If a truck sells tacos and burritos, prefer the",
  "  most prominent/first; if truly generic or unclear, output 'other'.",
  "- 'coffee/tea/espresso' -> coffee; 'ice cream/gelato/popsicle' -> ice_cream;",
  "  'hot dog/corn dog' -> hot_dogs; 'bbq/ribs/brisket' -> bbq; 'sub/deli/panini' -> sandwiches;",
  "  'noodles/ramen/sushi/dim sum/teriyaki/pho' -> asian; 'water/soda/juice/lemonade' -> drinks;",
  "  'candy/pastry/donut/churro/cake' -> desserts.",
  "Respond with one token only."
].join("\n");

// ---- Deterministic mock classifier (ordered; first match wins) --------------------------
// Only used with --mock or when no GRADIENT_API_KEY is set. Every output is in CUISINES.
const MOCK_RULES = [
  [/ice\s*cream|gelato|popsicle|paleta|shave[d]?\s*ice|snow\s*cone|frozen\s*yogurt|\bsorbet\b/i, "ice_cream"],
  [/hot\s*dog|corn\s*dog|\bfrankfurter\b|\bsausage\b/i, "hot_dogs"],
  [/\bhalal\b/i, "halal"],
  [/\bbbq\b|barbe?cue|\bribs\b|brisket|smoked\s*meat|pulled\s*pork/i, "bbq"],
  [/\bpizza\b|calzone/i, "pizza"],
  [/\btacos?\b|taqueria|\belote\b|quesadilla/i, "tacos"],
  [/burrito|\bmexican\b/i, "burritos"],
  [/burger|cheeseburger|hamburger|sliders?/i, "burgers"],
  [/coffee|espresso|latte|cappucc|\bmocha\b|\btea\b|chai/i, "coffee"],
  [/sandwich|\bsub\b|\bsubs\b|\bdeli\b|panini|\bwrap\b|\bhoagie\b|cheesesteak/i, "sandwiches"],
  [/noodle|ramen|\bpho\b|sushi|dim\s*sum|teriyaki|dumpling|\bwok\b|chinese|thai|korean|japanese|vietnamese|\basian\b|\bboba\b|bubble\s*tea|\bfried\s*rice\b/i, "asian"],
  [/seafood|\bfish\b|shrimp|\bcrab\b|lobster|oyster|\bclam\b|ceviche|poke/i, "seafood"],
  [/candy|crackerjack|cracker\s*jack|pastr|donut|doughnut|churro|\bcake\b|cookie|\bpie\b|dessert|kettle\s*corn|\bpopcorn\b|funnel\s*cake|\bwaffle\b|\bcrepe\b/i, "desserts"],
  [/water|soda|juice|lemonade|smoothie|\bdrinks?\b|beverage|\bsoft\s*drink\b|aguas?\s*frescas?/i, "drinks"]
];

export function mockClassify(text) {
  if (!text || !String(text).trim()) return "other";
  for (const [re, cuisine] of MOCK_RULES) if (re.test(text)) return cuisine;
  return "other";
}

// ---- Live classifier (Gradient serverless inference, OpenAI-compatible) -----------------
async function liveClassify(text, cfg) {
  const body = {
    model: cfg.model,
    temperature: 0,
    max_tokens: 4,
    messages: [
      { role: "system", content: CACHEABLE_PREFIX },   // <- identical prefix => prompt-cached
      { role: "user", content: `Food description: ${text}\nCategory:` }
    ]
  };
  const res = await fetch(`${cfg.url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`inference ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const raw = (json.choices?.[0]?.message?.content || "").trim().toLowerCase();
  const token = raw.replace(/[^a-z_]/g, "");
  return CUISINES.includes(token) ? token : "other";
}

// ---- CLI --------------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { mock: false, limit: Infinity, in: "permits.json", out: "cuisine_lookup.json" };
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
  const mode = live ? `LIVE (${cfg.model} @ ${cfg.url})` : "MOCK (deterministic)";
  console.log(`[enrich] mode: ${mode}`);
  if (!args.mock && !key) {
    console.log("[enrich] GRADIENT_API_KEY not set -> falling back to --mock so the pipeline still runs.");
  }

  let permits;
  try {
    permits = JSON.parse(readFileSync(inPath, "utf8"));
  } catch (e) {
    console.error(`[enrich] could not read ${inPath}. Pull it first:\n  curl "https://data.sfgov.org/resource/rqzj-sfat.json?$limit=5000" > ${args.in}`);
    process.exit(1);
  }

  const lookup = {};
  const counts = {};
  let n = 0, skipped = 0;
  for (const rec of permits) {
    if (n >= args.limit) break;
    const id = rec.permit || rec.permit_id;
    if (!id) { skipped++; continue; }
    if (lookup[id]) continue; // dataset has duplicate permit rows; classify once
    const text = rec.fooditems || rec.food_items || "";
    let cuisine;
    try {
      cuisine = live ? await liveClassify(text, cfg) : mockClassify(text);
    } catch (e) {
      console.error(`[enrich] ${id} live call failed (${e.message}); using mock for this record.`);
      cuisine = mockClassify(text);
    }
    if (!CUISINES.includes(cuisine)) cuisine = "other";
    lookup[id] = cuisine;
    counts[cuisine] = (counts[cuisine] || 0) + 1;
    n++;
  }

  // Stable, sorted output.
  const sorted = Object.fromEntries(Object.keys(lookup).sort().map((k) => [k, lookup[k]]));
  writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");

  const total = Object.keys(sorted).length;
  const allValid = Object.values(sorted).every((v) => CUISINES.includes(v));
  console.log(`[enrich] classified ${total} unique permits (skipped ${skipped} without id)`);
  console.log(`[enrich] wrote ${outPath}`);
  console.log(`[enrich] distribution: ${JSON.stringify(counts)}`);
  console.log(`[enrich] all values within §C enum: ${allValid ? "YES" : "NO"}`);
  if (!allValid) process.exit(2);
}

main();
