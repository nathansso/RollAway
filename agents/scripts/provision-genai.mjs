#!/usr/bin/env node
// Managed Gradient Agent provisioner via the DigitalOcean GenAI REST API.
// Reverse-engineered and partially verified against the live API on 2026-07-11:
//   - GET  /v2/gen-ai/models            (verified: 93 models, all function-calling)
//   - GET  /v2/gen-ai/regions           (verified: tor1/atl1/ric1)
//   - POST /v2/gen-ai/knowledge_bases   (verified: creates a KB)
//   - POST /v2/gen-ai/agents            (VERIFIED BLOCKED: 403 "failed to create agent" —
//                                        Agent creation is gated on this account/token; see below)
//
// Run when Agent creation is enabled on the account:
//   DIGITALOCEAN_ACCESS_TOKEN=<rw token> node provision-genai.mjs
//
// It creates rollaway-spot-scout and rollaway-permit-copilot from the repo instructions, and a
// KB from agents/kb. Every step reports its real result; nothing is faked.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const KEY = process.env.DIGITALOCEAN_ACCESS_TOKEN || process.env.DO_KEY;
if (!KEY) { console.error("Set DIGITALOCEAN_ACCESS_TOKEN (a read/write DO API token)."); process.exit(1); }
const API = "https://api.digitalocean.com/v2";
const __dir = dirname(fileURLToPath(import.meta.url));
const INSTR = resolve(__dir, "..", "instructions");
const H = { authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const j = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t }; }
  return { status: r.status, ok: r.ok, d };
};
const instr = (f) => readFileSync(resolve(INSTR, f), "utf8");
const say = (s) => console.log("\n==> " + s);

const MODEL_NAME = "Llama 3.3 Instruct (70B)";   // any function-calling model from GET /gen-ai/models

async function main() {
  say("Discover project / region / model");
  const proj = (await j("GET", "/projects/default")).d.project;
  const region = "tor1";
  const models = (await j("GET", "/gen-ai/models?per_page=100")).d.models || [];
  const model = models.find((m) => m.name === MODEL_NAME) || models.find((m) => /llama 3\.3/i.test(m.name));
  if (!proj || !model) { console.error("could not resolve project/model"); process.exit(1); }
  console.log(`  project=${proj.id}  region=${region}  model=${model.name} (${model.uuid})`);

  const existing = (await j("GET", "/gen-ai/agents?per_page=100")).d.agents || [];
  const byName = Object.fromEntries(existing.map((a) => [a.name, a]));

  const agents = [
    { name: "rollaway-spot-scout", files: ["spot_scout.md", "output_envelope.md"], description: "Rollaway location agent (function calling over the tools + clearance)." },
    { name: "rollaway-permit-copilot", files: ["permit_copilot.md", "output_envelope.md"], description: "Rollaway permit agent (KB-grounded, cited checklist)." }
  ];
  const created = {};
  for (const a of agents) {
    say(`Agent ${a.name}`);
    if (byName[a.name]) { console.log("  already exists:", byName[a.name].uuid); created[a.name] = byName[a.name]; continue; }
    const body = {
      name: a.name,
      instruction: a.files.map(instr).join("\n\n---\n\n"),
      model_uuid: model.uuid, project_id: proj.id, region, description: a.description
    };
    const r = await j("POST", "/gen-ai/agents", body);
    if (r.ok) { const ag = r.d.agent || r.d; created[a.name] = ag; console.log("  created:", ag.uuid); }
    else {
      console.log(`  HTTP ${r.status}:`, JSON.stringify(r.d).slice(0, 120));
      if (r.status === 403) console.log("  ^ Agent creation is FORBIDDEN on this account. Enable the GenAI *Agents* feature in the\n    DigitalOcean console (Gradient → Agents), or ask DO support to enable agent creation for\n    the team, then re-run. KB creation and inference already work with this token.");
    }
  }

  say("Knowledge base (attach to permit-copilot)");
  console.log("  KB creation is supported (POST /v2/gen-ai/knowledge_bases). Ingesting agents/kb/*.md");
  console.log("  needs a data source — upload the docs to a Spaces bucket (needs Spaces keys) or use");
  console.log("  the KB file-upload data source. Left as a follow-up; see RUNBOOK §4.");

  say("Next (when agents exist)");
  console.log("  - register the 6 tools (fixtures/tool-schemas.json) on rollaway-spot-scout");
  console.log("  - create the routed entry point in front of both agents (router.md logic)");
  console.log("  - attach guardrails (guardrails.config.json) to both");
  console.log("  - mint the endpoint access key and hand Person 1 the URL + key");
  console.log("\n  Until Agent creation is enabled, run the working runtime instead:");
  console.log("  GRADIENT_API_KEY=<key> node ../runtime/server.mjs   (see runtime/README.md)");
}
main();
