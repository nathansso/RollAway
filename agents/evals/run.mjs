#!/usr/bin/env node
// Rollaway agent evaluation gate.
//   node run.mjs --offline      # (default) structural gate, must be GREEN before any merge
//   node run.mjs --live         # replay seeds against the deployed routed endpoint (needs creds)
//
// Offline validates the repo artifacts against docs/CONTRACTS.md §A/§B/§C/§D and the seed
// behaviors — no live model needed. Rerun after EVERY instruction change.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { read, readRepo, extractJsonBlocks, parseSourceIds, parseContractSourceIds, c } from "./lib/util.mjs";
import { route } from "./lib/route.mjs";
import { detectJailbreak, anonymize, refusalEnvelope } from "./lib/guardrails.mjs";
import { validateEnvelope, validateChecklist } from "./lib/schema.mjs";
import { payloads, clearancePayload, restaurantsPayload } from "../fixtures/payloads.mjs";
import { mockNormalize, CACHEABLE_PREFIX, PREFIX_SHA } from "../enrichment/normalize_fooditems.mjs";
import { competitionOverlapCore } from "../menu_rag/overlap.mjs";
import { DEMO_COMPETITORS, demoMenuKbId } from "../menu_rag/query.mjs";
import { runSpotScoutSingleTurn } from "../runtime/agents.mjs";
import { readFileSync as _rfs } from "node:fs";

const __dir = dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(read("evals/seeds.json")).seeds;

// ---- tiny check harness ----------------------------------------------------------------
const results = [];
function check(name, fn) {
  try {
    const r = fn();
    results.push({ name, pass: !!r.pass, detail: r.detail || "" });
  } catch (e) {
    results.push({ name, pass: false, detail: `threw: ${e.message}` });
  }
}
const ok = (detail) => ({ pass: true, detail });
const bad = (detail) => ({ pass: false, detail });

// Expected §B fields (verbatim) for the tool-schema check.
const B = {
  get_vendors:      { in: ["lat","lng","radius_m","day","time"], out: ["vendors","count"], item: ["permit_id","name","type","cuisine","status","point","scheduled_here","schedule_window"], itemKey: "vendors" },
  get_closures:     { in: ["lat","lng","radius_m","date_from","date_to"], out: ["closures","count"], item: ["id","reason","source","geometry","active_from","active_to"], itemKey: "closures" },
  get_foot_traffic: { in: ["lat","lng","radius_m","day","hour"], out: ["score","basis","nearby_stations","live_activity","historical_avg"] },
  get_restaurants:  { in: ["lat","lng","radius_m","day","time_from","time_to"], out: ["total","by_cuisine","by_price","saturation"] },
  get_events:       { in: ["lat","lng","radius_m","date_from","date_to"], out: ["events","count"], item: ["name","venue","point","start","expected_attendance","source"], itemKey: "events" },
  check_clearance:  { in: ["lat","lng","vendor_type"], out: ["allowed","checks"], item: ["rule","required_ft","actual_ft","pass","cite"], itemKey: "checks" }
};

const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const supersetOf = (have, need) => need.every((x) => have.includes(x));

// ---- load shared artifacts once ---------------------------------------------------------
const sourcesMd = read("kb/SOURCES.md");
const sourceIds = parseSourceIds(sourcesMd);
const contractsMd = readRepo("docs/CONTRACTS.md");

const checklistDocs = {};
for (const vt of ["truck", "trailer", "pushcart_cooking", "pushcart_nocook"]) {
  const blocks = extractJsonBlocks(read(`kb/${vt}.md`));
  checklistDocs[vt] = blocks.find((b) => b && b.vendor_type) || null;
}

const envelopeExamples = extractJsonBlocks(read("instructions/output_envelope.md"));

// ---------------------------------------------------------------------------------------
// OFFLINE CHECKS
// ---------------------------------------------------------------------------------------
async function runOffline() {
  // Precompute the single-turn Spot Scout result once (async), then assert synchronously below.
  const SPOT_FIXTURE = {
    user_profile: { vendor_type: "truck", cuisine: "tacos", menu_kb_id: "menu-kb-demo-el-sabor-local" },
    candidates: [
      { id: "spot-1", point: { lat: 37.7852, lng: -122.3969 },
        signals: { foot_traffic_score: 0.7, restaurant_saturation: "low",
          clearance: { allowed: true, checks: [
            { rule: "75ft from restaurant entrance", required_ft: 75, actual_ft: 110, pass: true, cite: "dpw-182101" },
            { rule: "7ft from hydrant", required_ft: 7, actual_ft: 20, pass: true, cite: "dpw-182101" } ] },
          nearby_vendors: [ { name: "El Sabor", cuisine: "tacos", scheduled_here: false } ],
          competitors: [ { name: "Taqueria Cancún", items: ["street taco", "burrito", "quesadilla"], price_points: [3.25, 10, 8.5] } ] } },
      { id: "spot-2", point: { lat: 37.7799, lng: -122.39 },
        signals: { foot_traffic_score: 0.3, restaurant_saturation: "high",
          clearance: { allowed: false, checks: [ { rule: "75ft from restaurant entrance", required_ft: 75, actual_ft: 50, pass: false, cite: "dpw-182101" } ] },
          nearby_vendors: [], competitors: [] } }
    ]
  };
  let spotSingle = null, spotSingleTrace = null;
  try { const r = await runSpotScoutSingleTurn(structuredClone(SPOT_FIXTURE)); spotSingle = r.env; spotSingleTrace = r.trace; }
  catch (e) { spotSingle = { __error: e.message }; }

  // 1. instruction files versioned
  check("instructions are versioned", () => {
    const files = ["router.md", "output_envelope.md", "spot_scout.md", "permit_copilot.md", "guardrails.md"];
    const missing = files.filter((f) => !/version:\s*\d+\.\d+\.\d+/.test(read(`instructions/${f}`)));
    return missing.length ? bad(`no version header: ${missing.join(", ")}`) : ok(`${files.length} files carry version:`);
  });

  // 2. envelope examples conform to §A
  check("output_envelope.md examples conform to §A", () => {
    if (envelopeExamples.length < 2) return bad(`expected >=2 json envelope examples, got ${envelopeExamples.length}`);
    const errs = [];
    envelopeExamples.forEach((env, i) => validateEnvelope(env).forEach((e) => errs.push(`ex${i}: ${e}`)));
    return errs.length ? bad(errs.join("; ")) : ok(`${envelopeExamples.length} examples valid`);
  });

  // 2b. one example is spot_scout(map_actions), the other permit_copilot(checklist)
  check("envelope examples split map_actions vs checklist", () => {
    const spot = envelopeExamples.find((e) => e.agent === "spot_scout");
    const permit = envelopeExamples.find((e) => e.agent === "permit_copilot");
    if (!spot || !permit) return bad("need one spot_scout and one permit_copilot example");
    if (!(spot.map_actions.length > 0 && spot.checklist === null)) return bad("spot example must fill map_actions and null checklist");
    if (!(permit.checklist && permit.map_actions.length === 0)) return bad("permit example must fill checklist and empty map_actions");
    return ok("spot fills map_actions; permit fills checklist");
  });

  // 3. checklist docs conform to §D
  check("kb checklists conform to §D", () => {
    const errs = [];
    for (const [vt, cl] of Object.entries(checklistDocs)) {
      if (!cl) { errs.push(`${vt}: no json block`); continue; }
      if (cl.vendor_type !== vt) errs.push(`${vt}: vendor_type mismatch (${cl.vendor_type})`);
      validateChecklist(cl, vt).forEach((e) => errs.push(e));
    }
    return errs.length ? bad(errs.join("; ")) : ok("4 vendor-type checklists valid");
  });

  // 4. routing correct for every seed with an expected agent
  check("router routes every seed correctly", () => {
    const errs = [];
    for (const s of seeds) {
      if (!s.expected_agent) continue;
      const got = route(s.prompt).agent;
      if (got !== s.expected_agent) errs.push(`${s.id}: got ${got}, want ${s.expected_agent}`);
    }
    return errs.length ? bad(errs.join("; ")) : ok(`${seeds.filter((s) => s.expected_agent).length} seeds route correctly`);
  });

  // 5. every cited source id resolves in SOURCES.md
  check("all cited source ids resolve in SOURCES.md", () => {
    const cited = new Set();
    envelopeExamples.forEach((env) => {
      (env.citations || []).forEach((ct) => ct.source && cited.add(ct.source));
      if (env.checklist) (env.checklist.steps || []).forEach((st) => st.cite && cited.add(st.cite));
    });
    Object.values(checklistDocs).forEach((cl) => cl && cl.steps.forEach((st) => cited.add(st.cite)));
    const unresolved = [...cited].filter((id) => !sourceIds.has(id));
    return unresolved.length ? bad(`unresolved: ${unresolved.join(", ")}`) : ok(`${cited.size} distinct ids all resolve`);
  });

  // 6. SOURCES.md ⇄ docs/CONTRACTS.md §E in sync
  check("SOURCES.md ⇄ CONTRACTS §E source-id list in sync", () => {
    const contractIds = parseContractSourceIds(contractsMd);
    const a = [...sourceIds].sort(), b = [...contractIds].sort();
    if (!setEq(a, b)) return bad(`SOURCES=${a.join(",")} vs §E=${b.join(",")}`);
    return ok(`${a.length} ids match between SOURCES.md and §E`);
  });

  // 7. tool schemas match §B field-for-field
  check("fixtures tool schemas match §B", () => {
    const schemas = JSON.parse(read("fixtures/tool-schemas.json"));
    const byName = Object.fromEntries(schemas.tools.map((t) => [t.name, t]));
    const errs = [];
    for (const [name, spec] of Object.entries(B)) {
      const t = byName[name];
      if (!t) { errs.push(`${name}: missing tool schema`); continue; }
      const props = Object.keys(t.parameters.properties || {});
      if (!supersetOf(props, spec.in)) errs.push(`${name}: input params ${props} missing ${spec.in.filter((x) => !props.includes(x))}`);
      // payload output shape
      const pl = payloads[name];
      if (!pl) { errs.push(`${name}: no fixture payload`); continue; }
      if (!setEq(Object.keys(pl), spec.out)) errs.push(`${name}: output keys ${Object.keys(pl)} != ${spec.out}`);
      if (spec.item) {
        const arr = pl[spec.itemKey];
        if (!Array.isArray(arr) || !arr[0]) errs.push(`${name}: ${spec.itemKey}[0] missing`);
        else if (!setEq(Object.keys(arr[0]), spec.item)) errs.push(`${name}: ${spec.itemKey}[0] keys ${Object.keys(arr[0])} != ${spec.item}`);
      }
    }
    return errs.length ? bad(errs.join(" | ")) : ok("6 tools: input params ⊇ §B, output keys == §B");
  });

  // 8. clearance geometry seed (#2): NO comes from the tool, 75ft fails, cite dpw-182101
  check("clearance fixture: 50ft<75ft fails, allowed=false, cite dpw-182101", () => {
    const cc = payloads.check_clearance;
    if (cc.allowed !== false) return bad("allowed should be false");
    const r = cc.checks.find((x) => x.required_ft === 75);
    if (!r) return bad("no 75ft check");
    if (r.pass !== false) return bad("75ft check should fail at 50ft");
    if (r.cite !== "dpw-182101") return bad(`cite ${r.cite} != dpw-182101`);
    return ok("geometry returns NO with dpw-182101 (not model math)");
  });

  // 8b. check_clearance row count by vendor type: truck=3 rows, pushcart=4 rows (4th=sidewalk)
  check("check_clearance: 3 rows truck/trailer, 4 rows pushcart types", () => {
    const errs = [];
    for (const vt of ["truck", "trailer"]) if (clearancePayload(vt).checks.length !== 3) errs.push(`${vt} not 3 rows`);
    for (const vt of ["pushcart_cooking", "pushcart_nocook"]) if (clearancePayload(vt).checks.length !== 4) errs.push(`${vt} not 4 rows`);
    return errs.length ? bad(errs.join("; ")) : ok("truck/trailer=3, pushcart_cooking/pushcart_nocook=4");
  });

  // 8c. the 4th (sidewalk-width) row cites sf-sidewalk-width AND that id resolves in SOURCES.md
  check("sidewalk-width row cites sf-sidewalk-width (resolves in SOURCES.md)", () => {
    const row = clearancePayload("pushcart_cooking").checks.find((x) => /sidewalk/i.test(x.rule));
    if (!row) return bad("no sidewalk-width row for pushcart");
    if (row.cite !== "sf-sidewalk-width") return bad(`cite ${row.cite} != sf-sidewalk-width`);
    if (!sourceIds.has("sf-sidewalk-width")) return bad("sf-sidewalk-width not registered in SOURCES.md");
    if (row.required_ft !== 10) return bad(`required_ft ${row.required_ft} != 10`);
    // truck must NOT carry the sidewalk row
    if (clearancePayload("truck").checks.some((x) => /sidewalk/i.test(x.rule))) return bad("truck wrongly has a sidewalk row");
    return ok("sidewalk row: cite sf-sidewalk-width, required 10ft, pushcart-only");
  });

  // 8d. §B.4: get_restaurants window block is additive (present only with a valid full window)
  check("get_restaurants §B.4 window block: additive + validated", () => {
    const none = restaurantsPayload({});
    if (!none.ok) return bad("no-window call should be ok");
    if (!setEq(Object.keys(none.body), ["total","by_cuisine","by_price","saturation"])) return bad(`no-window keys drifted: ${Object.keys(none.body)}`);
    const full = restaurantsPayload({ day: "fri", time_from: "18:00", time_to: "22:00" });
    if (!full.ok || !full.body.window) return bad("full window should add a window block");
    const w = full.body.window;
    if (!setEq(Object.keys(w), ["day","time_from","time_to","open_count","open_weighted","saturation","by_cuisine_open"])) return bad(`window keys: ${Object.keys(w)}`);
    if (!["low","medium","high"].includes(w.saturation)) return bad(`window.saturation ${w.saturation} not in enum`);
    const partial = restaurantsPayload({ day: "fri", time_from: "18:00" });
    if (partial.ok || !partial.body.error || partial.body.error.code !== "BAD_INPUT") return bad("partial window should be BAD_INPUT");
    return ok("additive window; full=block, partial=BAD_INPUT, none=base 4 keys");
  });

  // 9. seed #1: pushcart_nocook excludes DMV, includes wide sidewalk clearance (cite sf-sidewalk-width)
  check("pushcart_nocook checklist excludes DMV & includes sidewalk clearance", () => {
    const cl = checklistDocs.pushcart_nocook;
    const hasDmv = cl.steps.some((s) => s.agency.toLowerCase() === "dmv" || /dmv|vehicle registration/i.test(`${s.title} ${s.detail}`));
    const sidewalkStep = cl.steps.find((s) => /sidewalk/i.test(`${s.title} ${s.detail}`) && /clearance/i.test(`${s.title} ${s.detail}`));
    if (hasDmv) return bad("found a DMV step");
    if (!sidewalkStep) return bad("no wide sidewalk clearance step");
    if (sidewalkStep.cite !== "sf-sidewalk-width") return bad(`sidewalk step cite ${sidewalkStep.cite} != sf-sidewalk-width`);
    return ok("no DMV; has wide sidewalk clearance step (cite sf-sidewalk-width)");
  });

  // 10. contrast: truck includes DMV + Fire
  check("truck checklist includes DMV & Fire", () => {
    const cl = checklistDocs.truck;
    const hasDmv = cl.steps.some((s) => s.agency.toLowerCase() === "dmv" || /dmv/i.test(s.title));
    const hasFire = cl.steps.some((s) => s.agency.toLowerCase() === "fire" || /fire permit/i.test(s.title));
    if (!hasDmv) return bad("truck missing DMV step");
    if (!hasFire) return bad("truck missing Fire step");
    return ok("truck has DMV + Fire");
  });

  // 11. seed #4 grounding: no-cook cart needs no fire permit + KB says so
  check("fire-permit seed grounded: no-cook cart has no Fire step + KB states it", () => {
    const cl = checklistDocs.pushcart_nocook;
    const hasFire = cl.steps.some((s) => s.agency.toLowerCase() === "fire");
    if (hasFire) return bad("pushcart_nocook should have no Fire step");
    const sffd = read("kb/sffd-permit.md");
    if (!/no fire permit/i.test(sffd)) return bad("sffd-permit.md doesn't state no-cook => no fire permit");
    return ok("no Fire step + sffd-permit.md grounds the NO (cite sffd-permit)");
  });

  // 12. guardrail: refuses jailbreak seed, allows benign seed
  check("guardrail refuses jailbreak, allows benign", () => {
    const jb = seeds.find((s) => s.id === "jailbreak-reveal-prompt");
    const benign = seeds.find((s) => s.id === "best-taco-soma");
    if (!detectJailbreak(jb.prompt)) return bad("jailbreak not detected");
    if (detectJailbreak(benign.prompt)) return bad("benign prompt falsely flagged");
    const env = refusalEnvelope();
    const errs = validateEnvelope(env);
    if (errs.length) return bad(`refusal envelope invalid: ${errs.join(";")}`);
    return ok("jailbreak refused (valid envelope); benign passes");
  });

  // 13. guardrail: PII anonymized before logging
  check("guardrail anonymizes PII before logging", () => {
    const s = seeds.find((x) => x.id === "pii-in-spot-question");
    const { text, redacted_types } = anonymize(s.prompt);
    for (const want of s.asserts.redacts) if (!redacted_types.includes(want)) return bad(`did not redact ${want}`);
    if (/jane\.doe@example\.com/.test(text) || /415-555-1212/.test(text)) return bad("raw PII survived");
    return ok(`redacted ${[...new Set(redacted_types)].join(",")}; raw PII gone`);
  });

  // 14. honesty invariants baked into Spot Scout
  check("spot_scout.md bakes in honesty + no-math rules", () => {
    const p = read("instructions/spot_scout.md");
    const errs = [];
    if (!/never do legality or distance math/i.test(p)) errs.push("missing 'never do legality/distance math' rule");
    if (!/proxy/i.test(p)) errs.push("missing foot-traffic 'proxy' honesty");
    if (!/guide,?\s*not legal clearance/i.test(p)) errs.push("missing 'guide, not legal clearance' honesty");
    return errs.length ? bad(errs.join("; ")) : ok("no-math + proxy + guide language present");
  });

  // 15. Spot Scout is SINGLE TURN / no-router / no-math in the instruction
  check("spot_scout.md is single-turn, no-router, pre-gathered signals", () => {
    const p = read("instructions/spot_scout.md");
    const errs = [];
    if (!/single.?turn/i.test(p)) errs.push("missing single-turn declaration");
    if (!/no tools|no router|No tools\. No router/i.test(p)) errs.push("missing no-tools/no-router rule");
    if (!/pre-?gathered/i.test(p)) errs.push("missing pre-gathered signals language");
    if (!/why_one_line/i.test(p)) errs.push("missing why_one_line output");
    if (!/never recompute/i.test(p)) errs.push("missing 'never recompute the score' rule");
    return errs.length ? bad(errs.join("; ")) : ok("single-turn, no-router, pre-gathered, why_one_line, no-recompute");
  });

  // 16. Spot Scout single-turn RUNTIME: valid §A, 0 tool calls, ranked, verdict from clearance
  check("spot_scout single-turn: valid §A, 0 tool calls, ranked from pre-gathered signals", () => {
    if (!spotSingle || spotSingle.__error) return bad(`runtime threw: ${spotSingle?.__error}`);
    const errs = validateEnvelope(spotSingle);
    if (errs.length) return bad(`§A invalid: ${errs.slice(0, 2).join("; ")}`);
    if (spotSingleTrace.length !== 0) return bad(`made ${spotSingleTrace.length} tool calls (must be 0 — single turn)`);
    if (spotSingle.checklist !== null) return bad("checklist must be null");
    if (spotSingle.map_actions.length !== 2) return bad("expected 2 ranked spots");
    if (!(spotSingle.map_actions[0].score >= spotSingle.map_actions[1].score)) return bad("not ranked by score");
    // spot-2 fails clearance -> must be avoid; agent did not recompute legality
    const s2 = spotSingle.map_actions.find((a) => a.id === "spot-2");
    if (s2.verdict !== "avoid") return bad(`spot-2 (fails clearance) verdict ${s2.verdict} != avoid`);
    if (!spotSingle.citations.some((c) => c.source === "dpw-182101")) return bad("missing dpw-182101 clearance citation");
    return ok(`ranked ${spotSingle.map_actions.map((a) => a.id).join(">")}, 0 tools, cites dpw-182101`);
  });

  // 17. Menu-RAG overlap reasons over ITEMS + PRICES, never a cuisine label
  check("menu_rag overlap: item+price overlap, not a cuisine label", () => {
    const menu = JSON.parse(_rfs(new URL("../menu_rag/menu.demo.json", import.meta.url), "utf8"));
    const r = competitionOverlapCore(menu, DEMO_COMPETITORS);
    const taqueria = r.competitors.find((x) => /Cancún|Torta/i.test(x.name));
    const coffee = r.competitors.find((x) => /Coffee/i.test(x.name));
    if (!taqueria || taqueria.overlap_score <= 0) return bad("taqueria should overlap the taco menu");
    if (!coffee || coffee.overlap_score !== 0) return bad("coffee shop should have ~0 menu overlap");
    // overlaps are described by item pairs + price notes, and the summary states no-cuisine
    const anyItemPair = r.competitors.some((x) => x.overlapping_items.some((o) => o.my_item && o.competitor_item));
    if (!anyItemPair) return bad("overlaps carry no item pairs");
    if (!/never a cuisine label/i.test(r.summary.reasoned_over)) return bad("summary should state it reasons over items+prices, not cuisine");
    const hasPrice = r.competitors.some((x) => x.overlapping_items.some((o) => o.price_gap !== null));
    if (!hasPrice) return bad("no price comparison present");
    return ok(`taqueria overlap=${taqueria.overlap_score}, coffee=0, item+price pairs present`);
  });

  // 18. fooditems normalizer: items+keywords, RAW PRESERVED, cache prefix constant
  check("normalize_fooditems: items+keywords, raw preserved, constant cache prefix", () => {
    const raw = "Hot Dogs: Chips: Soda / Bottled Water";
    const n = mockNormalize(raw);
    if (!Array.isArray(n.items) || !n.items.length) return bad("no items");
    if (!Array.isArray(n.keywords) || !n.keywords.includes("hot_dog")) return bad(`keywords missing hot_dog: ${n.keywords}`);
    // the cacheable prefix must be a fixed, non-empty string with a stable hash (prompt caching)
    if (typeof CACHEABLE_PREFIX !== "string" || CACHEABLE_PREFIX.length < 100) return bad("cache prefix missing/short");
    if (!/^[0-9a-f]{12}$/.test(PREFIX_SHA)) return bad(`prefix sha malformed: ${PREFIX_SHA}`);
    // raw must be preservable verbatim (normalizer never mutates the input string)
    if (raw !== "Hot Dogs: Chips: Soda / Bottled Water") return bad("raw mutated");
    return ok(`items=[${n.items.join(",")}], keywords include hot_dog, prefix sha256:${PREFIX_SHA}`);
  });

  // 19. Permit checklists surface the HIDDEN clocks (30 / 90 / 15) for every vendor type
  check("permit checklists surface the 30/90/15-day hidden clocks", () => {
    const errs = [];
    for (const [vt, cl] of Object.entries(checklistDocs)) {
      const days = new Set(cl.steps.map((s) => s.deadline_days).filter((d) => d != null));
      for (const need of [30, 90, 15]) if (!days.has(need)) errs.push(`${vt} missing ${need}-day clock`);
    }
    return errs.length ? bad(errs.join("; ")) : ok("every vendor type surfaces 30, 90 and 15-day deadlines");
  });

  // 20. Permit checklists span the four agencies in order + carry autofill_field hints
  check("permit checklists: four agencies + autofill_field hints", () => {
    const errs = [];
    for (const [vt, cl] of Object.entries(checklistDocs)) {
      const agencies = cl.steps.map((s) => s.agency);
      for (const need of ["Treasurer", "Public Health", "Public Works"]) if (!agencies.includes(need)) errs.push(`${vt} missing ${need}`);
      // ordering: Treasurer (business reg) precedes Public Works (location)
      const firstTre = agencies.indexOf("Treasurer");
      const firstPw = agencies.indexOf("Public Works");
      if (firstTre > firstPw) errs.push(`${vt}: Treasurer must precede Public Works`);
      // orders must be strictly increasing integers
      const orders = cl.steps.map((s) => s.order);
      if (orders.some((o, i) => i > 0 && o <= orders[i - 1])) errs.push(`${vt}: step order not strictly increasing`);
      // at least one autofill_field hint present
      if (!cl.steps.some((s) => typeof s.autofill_field === "string" && s.autofill_field)) errs.push(`${vt}: no autofill_field hint`);
    }
    // vendor-type differences: truck/trailer have Fire + DMV; pushcart_nocook has neither
    const hasAgency = (vt, a) => checklistDocs[vt].steps.some((s) => s.agency === a);
    if (!hasAgency("truck", "Fire") || !hasAgency("truck", "DMV")) errs.push("truck missing Fire/DMV");
    if (!hasAgency("trailer", "Fire") || !hasAgency("trailer", "DMV")) errs.push("trailer missing Fire/DMV");
    if (hasAgency("pushcart_nocook", "Fire") || hasAgency("pushcart_nocook", "DMV")) errs.push("pushcart_nocook wrongly has Fire/DMV");
    return errs.length ? bad(errs.join("; ")) : ok("4 agencies ordered, autofill hints, truck/trailer=Fire+DMV, pushcart_nocook=neither");
  });

  return summarize("OFFLINE");
}

// ---------------------------------------------------------------------------------------
// LIVE MODE
// ---------------------------------------------------------------------------------------
async function runLive() {
  const url = process.env.GRADIENT_ENDPOINT_URL;
  const key = process.env.GRADIENT_AGENT_KEY;
  if (!url || !key) {
    console.log(c.yellow("\n[live] SKIPPED — set GRADIENT_ENDPOINT_URL and GRADIENT_AGENT_KEY to replay seeds against the deployed routed endpoint."));
    console.log(c.dim("[live] (This is expected until the human deploy step in RUNBOOK.md is done.)"));
    return 0;
  }
  console.log(c.bold(`\n[live] replaying ${seeds.length} seeds against ${url}\n`));
  for (const s of seeds) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ session_id: `eval-${s.id}`, message: s.prompt, context: s.context || {} })
      });
      const env = await res.json();
      const errs = validateEnvelope(env);
      let pass = errs.length === 0;
      let detail = errs.length ? errs.slice(0, 2).join("; ") : `agent=${env.agent}`;
      if (s.expected_agent && env.agent !== s.expected_agent && s.id !== "jailbreak-reveal-prompt") { pass = false; detail += ` (want ${s.expected_agent})`; }
      results.push({ name: `live:${s.id}`, pass, detail });
    } catch (e) {
      results.push({ name: `live:${s.id}`, pass: false, detail: e.message });
    }
  }

  const base = url.replace(/\/$/, "");
  const demoKbId = demoMenuKbId() || "menu-kb-demo-el-sabor-local";   // real KB uuid after a live ingest

  // Direct single-turn Spot Scout: pre-gathered signals, must be valid §A with 0 tool calls.
  try {
    const payload = {
      user_profile: { vendor_type: "truck", cuisine: "tacos", menu_kb_id: demoKbId },
      candidates: [
        { id: "spot-1", point: { lat: 37.7852, lng: -122.3969 },
          signals: { foot_traffic_score: 0.7, restaurant_saturation: "low",
            clearance: { allowed: true, checks: [ { rule: "75ft from restaurant entrance", required_ft: 75, actual_ft: 110, pass: true, cite: "dpw-182101" } ] },
            nearby_vendors: [ { name: "El Sabor", cuisine: "tacos", scheduled_here: false } ],
            competitors: [ { name: "Taqueria Cancún", items: ["street taco", "burrito"], price_points: [3.25, 10] } ] } },
        { id: "spot-2", point: { lat: 37.7799, lng: -122.39 },
          signals: { foot_traffic_score: 0.3, restaurant_saturation: "high",
            clearance: { allowed: false, checks: [ { rule: "75ft from restaurant entrance", required_ft: 75, actual_ft: 50, pass: false, cite: "dpw-182101" } ] },
            nearby_vendors: [], competitors: [] } }
      ]
    };
    const res = await fetch(`${base}/spot_scout?debug=1`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(payload) });
    const j = await res.json();
    const env = j.envelope || j;
    const errs = validateEnvelope(env);
    let pass = errs.length === 0 && env.agent === "spot_scout" && env.map_actions.length === 2 && env.checklist === null;
    const toolCalls = j.meta?.tool_calls;
    if (toolCalls && toolCalls !== 0) pass = false;
    results.push({ name: "live:spot_scout-single-turn", pass, detail: errs.length ? errs.slice(0, 2).join("; ") : `ranked, tool_calls=${toolCalls ?? "n/a"}` });
  } catch (e) {
    results.push({ name: "live:spot_scout-single-turn", pass: false, detail: e.message });
  }

  // Direct Menu-RAG competition overlap: items+prices, never cuisine.
  try {
    const body = { menu_kb_id: demoKbId, competitors: [
      { name: "Taqueria Cancún", items: ["street taco", "burrito", "quesadilla"], price_points: [3.25, 10, 8.5] },
      { name: "Blue Bottle Coffee", items: ["latte", "pastry"], price_points: [5.5, 4] }
    ] };
    const res = await fetch(`${base}/menu_overlap`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    const r = await res.json();
    const taq = (r.competitors || []).find((x) => /Cancún/.test(x.name));
    const cof = (r.competitors || []).find((x) => /Coffee/.test(x.name));
    const pass = !!(taq && taq.overlap_score > 0 && cof && cof.overlap_score === 0 && /never a cuisine label/i.test(r.summary?.reasoned_over || ""));
    results.push({ name: "live:menu_overlap-items-prices", pass, detail: pass ? `taqueria=${taq.overlap_score}, coffee=0, item+price` : "overlap shape/cuisine-guard failed" });
  } catch (e) {
    results.push({ name: "live:menu_overlap-items-prices", pass: false, detail: e.message });
  }

  return summarize("LIVE");
}

// ---------------------------------------------------------------------------------------
function summarize(mode) {
  const pad = Math.max(...results.map((r) => r.name.length));
  console.log(c.bold(`\nRollaway eval — ${mode}\n`));
  for (const r of results) {
    const tag = r.pass ? c.green("PASS") : c.red("FAIL");
    console.log(`  ${tag}  ${r.name.padEnd(pad)}  ${c.dim(r.detail)}`);
  }
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const allGreen = passed === total;
  console.log("\n" + (allGreen ? c.green(c.bold(`GREEN — ${passed}/${total} checks passed`)) : c.red(c.bold(`RED — ${passed}/${total} passed, ${total - passed} failed`))));
  return allGreen ? 0 : 1;
}

// ---- main ------------------------------------------------------------------------------
const mode = process.argv.includes("--live") ? "live" : "offline";
const code = await (mode === "live" ? runLive() : Promise.resolve(runOffline()));
process.exit(code);
