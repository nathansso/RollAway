#!/usr/bin/env node
// Provision BOTH Rollaway knowledge bases on the real DigitalOcean Gradient account:
//   1. the PERMIT KB   (agents/kb/*.md)  -> attached to permit_copilot
//   2. the demo MENU KB (agents/menu_rag/menu.demo.json) -> returns a real menu_kb_id
//
// KBs are provisioned by THIS SCRIPT (not at runtime, per invariant §3). Idempotent: existing KBs
// (matched by name) are reused, not duplicated. Every call reports its real HTTP result — nothing
// is faked. Managed-agent creation is a separate, currently-403 step (see provision-genai.mjs);
// KB creation + inference work on this account (RUNBOOK §0b).
//
//   DIGITALOCEAN_ACCESS_TOKEN=<rw token> node agents/scripts/provision-kbs.mjs
//   node agents/scripts/provision-kbs.mjs --mock     # offline dry-run (local menu KB manifest)
//
// The token is READ FROM ENV ONLY — never printed, never written to any file.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  haveToken, defaultProject, pickEmbeddingModel, findKnowledgeBaseByName,
  createKnowledgeBase, addDataSource
} from "../menu_rag/gradient_kb.mjs";
import { ingestMenu } from "../menu_rag/ingest.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const KB_DIR = resolve(__dir, "..", "kb");
const MENU = resolve(__dir, "..", "menu_rag", "menu.demo.json");
const mock = process.argv.includes("--mock");

const say = (s) => console.log("\n==> " + s);

async function provisionPermitKb() {
  say("Permit KB (agents/kb/*.md -> permit_copilot)");
  const name = "rollaway-permit-kb";
  const docs = readdirSync(KB_DIR).filter((f) => f.endsWith(".md"));
  console.log(`  ${docs.length} KB docs: ${docs.join(", ")}`);

  if (mock || !haveToken()) {
    console.log(`  [dry-run] would create KB "${name}" and ingest ${docs.length} docs. Set DIGITALOCEAN_ACCESS_TOKEN to provision for real.`);
    return { name, provider: "local", docs: docs.length };
  }

  const existing = await findKnowledgeBaseByName(name);
  if (existing) { console.log(`  [live] KB already exists: ${existing.uuid}`); return { name, permit_kb_id: existing.uuid, provider: "gradient", reused: true }; }

  const proj = await defaultProject();
  const emb = await pickEmbeddingModel();
  console.log(`  [live] project=${proj?.id} embedding=${emb ? emb.name : "(none)"}`);
  const created = await createKnowledgeBase({ name, project_id: proj.id, region: "tor1", embedding_model_uuid: emb ? emb.uuid : undefined });
  if (!created.ok) { console.log(`  [live] KB creation HTTP ${created.status}: ${JSON.stringify(created.data).slice(0, 200)}`); return { name, error: created.status }; }
  const kb = created.data.knowledge_base || created.data;
  const uuid = kb.uuid || kb.id;
  console.log(`  [live] created permit KB: ${uuid}`);
  // Best-effort data-source attach per doc (Spaces/file-upload shape varies; KB exists regardless).
  let attached = 0;
  for (const f of docs) {
    const content = readFileSync(resolve(KB_DIR, f), "utf8");
    const ds = await addDataSource(uuid, {
      knowledge_base_uuid: uuid,
      file_upload_data_source: { original_file_name: f, size_in_bytes: String(Buffer.byteLength(content)), stored_object_key: f }
    }).catch(() => ({ ok: false }));
    if (ds.ok) attached++;
  }
  console.log(`  [live] data sources attached: ${attached}/${docs.length}${attached < docs.length ? " (remainder need a Spaces bucket — see RUNBOOK §4)" : ""}`);
  return { name, permit_kb_id: uuid, provider: "gradient", docs: docs.length, attached };
}

async function provisionMenuKb() {
  say("Demo MENU KB (agents/menu_rag/menu.demo.json -> menu_kb_id)");
  const menu = JSON.parse(readFileSync(MENU, "utf8"));
  const manifest = await ingestMenu({ menu, mock });
  console.log(`  menu_kb_id = ${manifest.menu_kb_id}  (provider: ${manifest.provider}${manifest.reused ? ", reused" : ""})`);
  console.log(`  ingested ${manifest.menu.items.length} items with prices for competition-overlap (items+prices, never cuisine).`);
  return { name: manifest.kb_name, menu_kb_id: manifest.menu_kb_id, provider: manifest.provider };
}

async function main() {
  console.log(`[provision-kbs] mode: ${mock ? "MOCK (dry-run/local)" : haveToken() ? "LIVE (real Gradient account)" : "no token -> local"}`);
  const permit = await provisionPermitKb();
  const menu = await provisionMenuKb();

  say("Summary");
  console.log(`  permit KB: ${permit.permit_kb_id || "(local/dry-run)"}  [${permit.provider}]`);
  console.log(`  menu   KB: ${menu.menu_kb_id}  [${menu.provider}]`);
  console.log("\n  Attach the permit KB to permit_copilot; hand the menu_kb_id to recommend_spots.");
  if (!haveToken() && !mock) console.log("  (No token found — set DIGITALOCEAN_ACCESS_TOKEN to provision the real KBs.)");
}

main();
