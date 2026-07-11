// The two agents, run on Gradient inference using the repo's own instructions/KB/tools.
// Spot Scout does real function calling over the tool server; Permit Copilot is grounded in the
// KB (full-KB-in-context RAG). Both emit the §A envelope.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { complete, runWithTools } from "./gradient.mjs";
import { openaiTools, executeTool } from "./tools.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const INSTR = resolve(__dir, "..", "instructions");
const KB = resolve(__dir, "..", "kb");

const loadInstr = (f) => readFileSync(resolve(INSTR, f), "utf8");
const ENVELOPE = loadInstr("output_envelope.md");
const OUTPUT_ONLY =
  "\n\n=== CRITICAL OUTPUT RULE ===\nRespond with ONLY the §A JSON envelope: a single valid JSON " +
  "object, no markdown code fences, no prose before or after. Exactly one of map_actions (non-empty) " +
  "or checklist (non-null) is filled.";

// Rule/law docs (retrieved by relevance) + checklist docs (the matching one has the full §D
// answer). Lean context = SOURCES (id list) + matching checklist + up to 3 rule docs the question
// actually mentions. Cuts prefill ~3x vs full-KB stuffing, which is the main latency win.
const RULE_DOCS = ["dpw-182101.md", "sf-sidewalk-width.md", "clearance-rules.md",
  "sfpw-mff-permit.md", "sfdph-mff.md", "sffd-permit.md", "ttx-cert.md", "ca-dmv.md"];
const CHECKLISTS = ["truck.md", "trailer.md", "pushcart_cooking.md", "pushcart_nocook.md"];
const readOne = (f) => readFileSync(resolve(KB, f), "utf8");
const readKbFiles = (files) => [...new Set(files)]
  .filter((f) => { try { readOne(f); return true; } catch { return false; } })
  .map((f) => `### FILE: kb/${f}\n${readOne(f)}`).join("\n\n");

// Rule docs the question actually mentions (keyword overlap), top 3.
function retrieveRuleDocs(message = "") {
  const terms = [...new Set((message.toLowerCase().match(/[a-z]{4,}/g) || []))];
  return RULE_DOCS
    .map((f) => { const t = readOne(f).toLowerCase(); return { f, s: terms.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0) }; })
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.f);
}
function kbContext(vendorType, message = "") {
  const files = ["SOURCES.md"];
  if (vendorType && CHECKLISTS.includes(`${vendorType}.md`)) files.push(`${vendorType}.md`);
  else files.push(...CHECKLISTS);
  files.push(...retrieveRuleDocs(message));
  return readKbFiles(files);
}

const VENDOR_TYPES = ["truck", "trailer", "pushcart_cooking", "pushcart_nocook"];
function inferVendorType(message) {
  const m = (message || "").toLowerCase();
  if (/\btrailer\b/.test(m)) return "trailer";
  if (/\btruck\b/.test(m)) return "truck";
  if (/\bcart\b|pushcart/.test(m)) {
    if (/cook|grill|fry|fried|propane|flame|griddle|hot food/.test(m)) return "pushcart_cooking";
    return "pushcart_nocook";   // ice cream / prepackaged / cold default
  }
  return null;
}
// Authored §D checklist straight from kb/<vt>.md (single source of truth — never regenerated).
const loadChecklist = (vt) => extractEnvelope(readOne(`${vt}.md`));

// source id -> { file, label } from the SOURCES.md table.
const SRC = (() => {
  const map = {};
  for (const m of readOne("SOURCES.md").matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/gim))
    map[m[1]] = { file: m[2], label: m[3].replace(/\*\*/g, "").trim().slice(0, 90) };
  return map;
})();
const FILE_TO_ID = Object.fromEntries(Object.entries(SRC).map(([id, v]) => [v.file, id]));

// Deterministic citations: every checklist step cite + any rule doc the question pulled in.
function citationsFor(checklist, retrievedFiles) {
  const out = [], seen = new Set();
  const add = (id, quote) => { if (id && !seen.has(id)) { seen.add(id); out.push({ label: SRC[id]?.label || id, source: id, quote: (quote || SRC[id]?.label || `See kb/${SRC[id]?.file || id}`).slice(0, 180) }); } };
  if (checklist) for (const s of checklist.steps) add(s.cite, s.detail);
  for (const f of retrievedFiles || []) add(FILE_TO_ID[f]);
  return out;
}

// Pull the first balanced JSON object out of a model reply (tolerates ``` fences / stray prose).
export function extractEnvelope(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
    else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { if (--depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

const degraded = (agent, text) => ({
  agent, reply_markdown: (text || "").slice(0, 2000) || "I couldn't produce a structured answer.",
  citations: [], map_actions: [], checklist: null
});

export async function runSpotScout(message, context = {}) {
  const system = `${loadInstr("spot_scout.md")}\n\n---\n\n${ENVELOPE}${OUTPUT_ONLY}`;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: `User message: ${message}\nContext: ${JSON.stringify(context)}` }
  ];
  const { content, trace } = await runWithTools({ messages, tools: openaiTools, execute: executeTool });
  const env = extractEnvelope(content) || degraded("spot_scout", content);
  env.agent = "spot_scout";
  if (!Array.isArray(env.map_actions)) env.map_actions = [];
  if (!Array.isArray(env.citations)) env.citations = [];
  env.checklist = null;
  // Invariant enforcement: every clearance explanation carries a citation. Backfill from the
  // ACTUAL check_clearance tool output (its `cite` ids) if the model forgot — never invented.
  const rows = trace.filter((t) => t.name === "check_clearance").flatMap((t) => t.result?.checks || []);
  const have = new Set(env.citations.map((c) => c.source));
  for (const r of rows) {
    if (r.cite && !have.has(r.cite)) {
      env.citations.push({ label: `Clearance — ${r.rule}`, source: r.cite,
        quote: `${r.rule}: required ${r.required_ft}ft, actual ${r.actual_ft}ft, pass=${r.pass}` });
      have.add(r.cite);
    }
  }
  return { env, trace };
}

export async function runPermitCopilot(message, context = {}) {
  const vt = VENDOR_TYPES.includes(context.vendor_type) ? context.vendor_type : inferVendorType(message);
  const retrieved = retrieveRuleDocs(message);

  // Fast path: vendor type known -> the checklist is AUTHORED data (kb/<vt>.md). Load it directly
  // and only ask the model for a short prose reply. No large JSON generation => big latency win,
  // and the checklist can't drift from the source of truth.
  const checklist = vt ? loadChecklist(vt) : null;
  if (checklist) {
    const sys =
      "You are Rollaway's Permit Copilot. You are given a vendor's AUTHORED permit checklist (JSON) " +
      "and relevant SF rule docs. Write a SHORT, friendly plain-text answer (2-4 sentences): what they " +
      "need, what they do NOT need (call out no-DMV / no-Fire when true for this vendor type), and the " +
      "hidden clocks (30-day public notice, 90-day document window, 15-day appeal). Answer the user's " +
      "actual question. Do NOT output JSON, do NOT re-list every step. Be honest: the checker is a guide, " +
      "not legal clearance.";
    const usr = `Vendor type: ${vt}\nUser question: ${message}\nAuthored checklist: ${JSON.stringify(checklist)}\n\nRelevant rule docs:\n${readKbFiles(["SOURCES.md", ...retrieved])}`;
    let reply = "";
    try { reply = (await complete([{ role: "system", content: sys }, { role: "user", content: usr }], { max_tokens: 320 })).trim(); }
    catch (e) { reply = `Here is your ${vt.replace(/_/g, " ")} permit checklist across the SF agencies.`; }
    return { env: { agent: "permit_copilot", reply_markdown: reply, citations: citationsFor(checklist, retrieved), map_actions: [], checklist }, trace: [] };
  }

  // Fallback: no vendor type resolvable -> let the model answer (grounded, lean context). Q&A
  // answers are short output, so this stays fast.
  const system =
    `${loadInstr("permit_copilot.md")}\n\n---\n\n${ENVELOPE}\n\n---\n` +
    `KNOWLEDGE BASE — ground every claim in this text and cite the matching source id:\n\n${kbContext(vt, message)}${OUTPUT_ONLY}`;
  const content = await complete([
    { role: "system", content: system },
    { role: "user", content: `User message: ${message}\nContext: ${JSON.stringify(context)}` }
  ]);
  const env = extractEnvelope(content) || degraded("permit_copilot", content);
  env.agent = "permit_copilot";
  if (!Array.isArray(env.map_actions)) env.map_actions = [];
  if (!Array.isArray(env.citations)) env.citations = [];
  if (env.checklist === undefined) env.checklist = null;
  return { env, trace: [] };
}
