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

// Rule/law/agency docs (always grounding) + the checklist docs (add only the matching one when
// the vendor_type is known — keeps the context ~half size, which roughly halves latency).
const AGENCY_DOCS = ["SOURCES.md", "dpw-182101.md", "sf-sidewalk-width.md", "clearance-rules.md",
  "sfpw-mff-permit.md", "sfdph-mff.md", "sffd-permit.md", "ttx-cert.md", "ca-dmv.md"];
const CHECKLISTS = ["truck.md", "trailer.md", "pushcart_cooking.md", "pushcart_nocook.md"];
const readKbFiles = (files) => files
  .filter((f) => { try { readFileSync(resolve(KB, f)); return true; } catch { return false; } })
  .map((f) => `### FILE: kb/${f}\n${readFileSync(resolve(KB, f), "utf8")}`).join("\n\n");

function kbContext(vendorType) {
  const cl = vendorType && CHECKLISTS.includes(`${vendorType}.md`) ? [`${vendorType}.md`] : CHECKLISTS;
  return readKbFiles([...AGENCY_DOCS, ...cl]);
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
  const system =
    `${loadInstr("permit_copilot.md")}\n\n---\n\n${ENVELOPE}\n\n---\n` +
    `KNOWLEDGE BASE — ground every claim in this text and cite the matching source id:\n\n${kbContext(context.vendor_type)}${OUTPUT_ONLY}`;
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
