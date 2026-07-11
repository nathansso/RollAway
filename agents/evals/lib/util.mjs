// Shared helpers for the eval runner.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
export const AGENTS_DIR = resolve(__dir, "..", "..");           // agents/
export const REPO_DIR = resolve(AGENTS_DIR, "..");              // repo root

export function read(relFromAgents) {
  return readFileSync(resolve(AGENTS_DIR, relFromAgents), "utf8");
}
export function readRepo(relFromRepo) {
  return readFileSync(resolve(REPO_DIR, relFromRepo), "utf8");
}

// Extract all ```json ... ``` fenced blocks from a markdown string, parsed.
export function extractJsonBlocks(md) {
  const out = [];
  const re = /```json\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    try { out.push(JSON.parse(m[1])); } catch (e) { out.push({ __parse_error: e.message, __raw: m[1].slice(0, 120) }); }
  }
  return out;
}

// Parse the authoritative source-id table in kb/SOURCES.md: collect every `id` in the
// first markdown table's first column (backtick-wrapped).
export function parseSourceIds(sourcesMd) {
  const ids = new Set();
  const re = /^\|\s*`([a-z0-9-]+)`\s*\|/gim;
  let m;
  while ((m = re.exec(sourcesMd)) !== null) ids.add(m[1]);
  return ids;
}

// Parse the §E source-id enum list out of docs/CONTRACTS.md (the comma list after the
// "Every `citations[].source` (§A) and every clearance `cite`" line).
export function parseContractSourceIds(contractsMd) {
  const idx = contractsMd.indexOf("Every `citations[].source`");
  if (idx === -1) return new Set();
  const chunk = contractsMd.slice(idx, idx + 600);
  const codeMatch = chunk.match(/`([^`]*checklist-pushcart-nocook[^`]*)`/);
  if (!codeMatch) return new Set();
  return new Set(codeMatch[1].split(",").map((s) => s.trim()).filter(Boolean));
}

export const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`
};
