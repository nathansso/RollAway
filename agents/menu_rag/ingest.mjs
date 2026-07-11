#!/usr/bin/env node
// Menu RAG — INGEST a vendor's real menu (items + prices) into a Gradient Knowledge Base and
// return a `menu_kb_id`. This is the per-user enrichment: each vendor's actual menu becomes a KB
// the competition-overlap query (query.mjs) reasons against — over ITEMS + PRICES, never a
// cuisine label.
//
//   node ingest.mjs --mock                          # local KB (offline gate, no creds)
//   DIGITALOCEAN_ACCESS_TOKEN=... node ingest.mjs    # LIVE: real Gradient KB, real menu_kb_id
//   node ingest.mjs --menu menu.demo.json --name rollaway-menu-demo-el-sabor
//
// Idempotent: re-running finds the existing KB by name instead of creating a duplicate.
// Writes a local MANIFEST (menu_kb.<vendor_id>.json) that mirrors the KB content so query.mjs is
// demo-reliable even when standalone KB retrieval isn't exposed on the account (see DECISIONS).
//
// KBs are provisioned by THIS SCRIPT, never at runtime on the demo path (invariant §3).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import {
  haveToken, defaultProject, pickEmbeddingModel, findKnowledgeBaseByName,
  createKnowledgeBase, addDataSource, getKnowledgeBase
} from "./gradient_kb.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));

// Render the menu as an indexable text document (one line per item, price included) — this is
// what gets ingested so retrieval matches on item text + price, not a cuisine label.
export function menuToDoc(menu) {
  const lines = [
    `# Menu — ${menu.vendor_name || menu.vendor_id}`,
    `vendor_id: ${menu.vendor_id}`,
    `vendor_type: ${menu.vendor_type || "unknown"}`,
    `currency: ${menu.currency || "USD"}`,
    "",
    "## Items (name — keywords — price)"
  ];
  for (const it of menu.items || []) {
    const kws = (it.keywords || []).join(", ");
    const price = it.price != null ? `$${Number(it.price).toFixed(2)}` : "n/a";
    lines.push(`- ${it.name} — [${kws}] — ${price}`);
  }
  return lines.join("\n") + "\n";
}

export function manifestPath(vendorId) {
  return resolve(__dir, `menu_kb.${vendorId}.json`);
}

async function ingestLive(menu, kbName) {
  const proj = await defaultProject();
  if (!proj) throw new Error("could not resolve default DO project");
  const region = "tor1";

  // Idempotent: reuse an existing KB with this name.
  const existing = await findKnowledgeBaseByName(kbName);
  if (existing) {
    console.log(`  [live] KB already exists: ${existing.uuid} (${kbName})`);
    return { menu_kb_id: existing.uuid, provider: "gradient", project_id: proj.id, region, reused: true };
  }

  const emb = await pickEmbeddingModel();
  console.log(`  [live] project=${proj.id} region=${region} embedding_model=${emb ? emb.name : "(none found — creating without explicit embedding model)"}`);

  const created = await createKnowledgeBase({
    name: kbName,
    project_id: proj.id,
    region,
    embedding_model_uuid: emb ? emb.uuid : undefined
  });
  if (!created.ok) {
    throw new Error(`KB creation failed: HTTP ${created.status}: ${JSON.stringify(created.data).slice(0, 200)}`);
  }
  const kb = created.data.knowledge_base || created.data;
  const uuid = kb.uuid || kb.id;
  console.log(`  [live] created KB: ${uuid} (${kbName})`);

  // Best-effort: attach the menu doc as a data source. If the account's data-source shape differs
  // (e.g. requires a Spaces bucket), the KB still exists (real menu_kb_id) and the local manifest
  // mirrors the menu for the overlap query. We report the real result either way.
  const doc = menuToDoc(menu);
  const ds = await addDataSource(uuid, {
    knowledge_base_uuid: uuid,
    file_upload_data_source: { original_file_name: `${menu.vendor_id}-menu.md`, size_in_bytes: String(Buffer.byteLength(doc)), stored_object_key: `${menu.vendor_id}-menu.md` }
  }).catch((e) => ({ ok: false, status: 0, data: { message: e.message } }));
  console.log(`  [live] data source attach: HTTP ${ds.status} ${ds.ok ? "OK" : "(not attached — menu mirrored locally; see DECISIONS)"}`);

  return { menu_kb_id: uuid, provider: "gradient", project_id: proj.id, region, reused: false, data_source_attached: !!ds.ok };
}

function ingestMock(menu, kbName) {
  // Deterministic local KB id — stable across runs so query.mjs resolves it every time.
  return { menu_kb_id: `menu-kb-${menu.vendor_id}-local`, provider: "local", kb_name: kbName, reused: false };
}

export async function ingestMenu({ menu, name, mock = false } = {}) {
  const kbName = name || `rollaway-menu-${menu.vendor_id}`;
  const live = !mock && haveToken();
  const info = live ? await ingestLive(menu, kbName) : ingestMock(menu, kbName);

  // Write the manifest that mirrors the KB content (single source of truth for query.mjs).
  const manifest = {
    menu_kb_id: info.menu_kb_id,
    kb_name: kbName,
    provider: info.provider,
    reused: !!info.reused,
    created_at: new Date().toISOString(),
    vendor: { vendor_id: menu.vendor_id, vendor_name: menu.vendor_name, vendor_type: menu.vendor_type },
    menu,
    doc_preview: menuToDoc(menu).slice(0, 400)
  };
  // also drop the rendered doc for the KB data source / auditing
  try { mkdirSync(resolve(__dir, "kb_docs"), { recursive: true }); } catch { /* exists */ }
  writeFileSync(resolve(__dir, "kb_docs", `${menu.vendor_id}-menu.md`), menuToDoc(menu));
  writeFileSync(manifestPath(menu.vendor_id), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

// ---- CLI --------------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { mock: false, menu: "menu.demo.json", name: null };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--mock") a.mock = true;
    else if (t === "--menu") a.menu = argv[++i];
    else if (t === "--name") a.name = argv[++i];
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  const menu = JSON.parse(readFileSync(resolve(__dir, args.menu), "utf8"));
  const live = !args.mock && haveToken();
  console.log(`[ingest] mode: ${live ? "LIVE (real Gradient KB)" : "MOCK/local"}  vendor=${menu.vendor_id}  items=${(menu.items || []).length}`);
  if (!args.mock && !haveToken()) console.log("[ingest] DIGITALOCEAN_ACCESS_TOKEN not set -> local KB manifest (offline). Set the token to provision a real Gradient KB.");

  const manifest = await ingestMenu({ menu, name: args.name, mock: args.mock });
  console.log(`[ingest] menu_kb_id = ${manifest.menu_kb_id}   (provider: ${manifest.provider}${manifest.reused ? ", reused" : ""})`);
  console.log(`[ingest] wrote manifest ${manifestPath(menu.vendor_id)}`);
  console.log(`[ingest] ingested ${(menu.items || []).length} items with prices — overlap reasons over items+prices, never cuisine.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
