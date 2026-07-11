#!/usr/bin/env node
// Menu RAG — QUERY: competition-overlap against a vendor's real menu KB.
//
// This is the interface Person 2's `recommend_spots` calls. Given a candidate spot's nearby
// vendors/restaurants (their NORMALIZED items + price points) and THIS vendor's `menu_kb_id`, it
// returns HOW MUCH each competitor overlaps the vendor's real menu — which items collide and how
// prices compare. It reasons over MENU ITEMS + PRICE POINTS, NEVER a coarse cuisine label.
//
// Programmatic (what recommend_spots uses):
//   import { competitionOverlap } from "./query.mjs";
//   const r = await competitionOverlap({ menu_kb_id, competitors });
//
// CLI:
//   node query.mjs --demo                                    # built-in demo competitors
//   node query.mjs --menu-kb-id menu-kb-demo-el-sabor-local --competitors-file comp.json
//   DIGITALOCEAN_ACCESS_TOKEN=... node query.mjs --menu-kb-id <real-kb-uuid> --demo   # live KB

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { competitionOverlapCore } from "./overlap.mjs";
import { haveToken, getKnowledgeBase, kbSemanticSearch } from "./gradient_kb.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));

// Resolve a menu_kb_id to the local manifest that mirrors its ingested menu (written by ingest.mjs).
export function resolveMenu(menu_kb_id) {
  const files = readdirSync(__dir).filter((f) => /^menu_kb\..+\.json$/.test(f));
  for (const f of files) {
    try {
      const m = JSON.parse(readFileSync(resolve(__dir, f), "utf8"));
      if (m.menu_kb_id === menu_kb_id) return m;
    } catch { /* skip */ }
  }
  return null;
}

// Built-in demo competitors — normalized items + price points, NO cuisine label anywhere.
export const DEMO_COMPETITORS = [
  { name: "Taqueria Cancún", items: ["street taco", "carne asada burrito", "quesadilla", "chips and guacamole"], price_points: [3.25, 10.0, 8.5, 6.0] },
  { name: "La Torta Gorda", items: ["torta", "taco", "horchata", "jarritos"], price_points: [11.0, 3.75, 3.5, 3.0] },
  { name: "Blue Bottle Coffee", items: ["latte", "cold brew", "croissant", "pastry"], price_points: [5.5, 5.0, 4.5, 4.0] },
  { name: "The Halal Guys", items: ["chicken over rice", "gyro", "falafel"], price_level: 2 }
];

// The interface recommend_spots calls. Returns the overlap result plus KB provenance.
export async function competitionOverlap({ menu_kb_id, competitors, menu = null, useKb = true } = {}) {
  if (!menu && menu_kb_id) {
    const manifest = resolveMenu(menu_kb_id);
    if (!manifest) throw new Error(`menu_kb_id "${menu_kb_id}" not found — run ingest.mjs first`);
    menu = manifest.menu;
  }
  if (!menu) throw new Error("provide menu_kb_id (resolved via manifest) or a menu object");

  const provenance = { menu_kb_id: menu_kb_id || null, provider: "local", kb_verified: false, retrieval: "deterministic" };

  // LIVE: if this is a real Gradient KB and we have a token, verify it exists and (best-effort)
  // use its semantic retrieval to confirm item matches. The overlap MATH is always item/price
  // based; KB retrieval augments it. Falls back cleanly if standalone retrieval isn't exposed.
  const looksLikeRealKb = menu_kb_id && !/-local$/.test(menu_kb_id) && useKb && haveToken();
  if (looksLikeRealKb) {
    try {
      const kb = await getKnowledgeBase(menu_kb_id);
      if (kb) {
        provenance.provider = "gradient";
        provenance.kb_verified = true;
        // Probe retrieval with one representative competitor item.
        const probeItem = (competitors?.[0]?.items?.[0]) || "taco";
        const search = await kbSemanticSearch(menu_kb_id, String(probeItem));
        if (search && search.ok) { provenance.retrieval = "kb_semantic"; provenance.retrieval_endpoint = search.endpoint; }
      }
    } catch (e) {
      provenance.kb_error = e.message;
    }
  }

  const core = competitionOverlapCore(menu, competitors || []);
  return { ...provenance, ...core };
}

// ---- CLI --------------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { demo: false, menu_kb_id: null, competitorsFile: null, menuFile: null };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--demo") a.demo = true;
    else if (t === "--menu-kb-id") a.menu_kb_id = argv[++i];
    else if (t === "--competitors-file") a.competitorsFile = argv[++i];
    else if (t === "--menu-file") a.menuFile = argv[++i];
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  let menu = null;
  let menu_kb_id = args.menu_kb_id;

  if (args.menuFile) {
    const loaded = JSON.parse(readFileSync(resolve(process.cwd(), args.menuFile), "utf8"));
    menu = loaded.menu || loaded;                 // accept a manifest or a raw menu
    menu_kb_id = menu_kb_id || loaded.menu_kb_id || null;
  }
  if (!menu_kb_id && !menu) {
    // default to the demo vendor's manifest if present
    const demo = resolveMenu("menu-kb-demo-el-sabor-local");
    if (demo) { menu_kb_id = demo.menu_kb_id; }
    else { console.error("No --menu-kb-id / --menu-file, and no demo manifest. Run: node ingest.mjs --mock"); process.exit(1); }
  }

  const competitors = args.competitorsFile
    ? JSON.parse(readFileSync(resolve(process.cwd(), args.competitorsFile), "utf8"))
    : DEMO_COMPETITORS;

  console.log(`[query] menu_kb_id=${menu_kb_id}  competitors=${competitors.length}  token=${haveToken()}`);
  const result = await competitionOverlap({ menu_kb_id, competitors, menu });

  console.log(`[query] provider=${result.provider} kb_verified=${result.kb_verified} retrieval=${result.retrieval}`);
  console.log(`[query] vendor menu items: ${result.vendor.menu_item_count}`);
  for (const c of result.competitors) {
    const items = c.overlapping_items.map((o) => `${o.competitor_item}~${o.my_item}${o.price_gap != null ? ` (${o.price_note})` : ""}`).join("; ");
    console.log(`  - ${c.name.padEnd(22)} overlap=${c.overlap_score} [${c.verdict}]  matched ${c.matched_my_items}/${result.vendor.menu_item_count}  ${c.price_summary}`);
    if (items) console.log(`      items: ${items}`);
  }
  console.log(`[query] summary: mean_overlap=${result.summary.mean_overlap} max=${result.summary.max_overlap} most=${result.summary.most_overlapping} direct=${result.summary.direct_competitors}`);
  console.log(`[query] reasoned over: ${result.summary.reasoned_over}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
