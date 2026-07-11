#!/usr/bin/env node
// Gradient extracts structure; deterministic code verifies every price against source text.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { complete, haveKey } from "../runtime/gradient.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const instructions = readFileSync(resolve(__dir, "..", "instructions", "menu_parser.md"), "utf8");

function extractJson(text) {
  const source = String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("menu parser returned no JSON object");
  return JSON.parse(source.slice(start, end + 1));
}

function numericValues(text) {
  const values = [];
  for (const match of String(text || "").matchAll(/(?:\$\s*)?(\d{1,4}(?:[.,]\d{1,2})?)/g)) {
    const value = Number(match[1].replace(",", "."));
    if (Number.isFinite(value)) values.push(Math.round(value * 100));
  }
  return values;
}

export function verifyPricesInSource(sourceText, items = []) {
  const sourcePrices = new Set(numericValues(sourceText));
  const kept = [];
  for (const item of items) {
    const price = Number(item && item.price);
    const cents = Number.isFinite(price) ? Math.round(price * 100) : null;
    if (cents === null || !sourcePrices.has(cents)) {
      console.warn(`[menu-parser] dropped item with untraceable price: ${item?.name || "unnamed"} (${item?.price})`);
      continue;
    }
    const name = String(item.name || "").trim();
    if (!name) continue;
    kept.push({
      name,
      keywords: Array.isArray(item.keywords)
        ? item.keywords.map((keyword) => String(keyword).toLowerCase().trim()).filter(Boolean).slice(0, 12)
        : [],
      price: cents / 100,
    });
  }
  return kept;
}

export function mockParse(rawText) {
  const items = [];
  for (const line of String(rawText || "").split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]?\s*(.+?)\s+(?:[-:]\s*)?\$?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*$/);
    if (!match) continue;
    const name = match[1].trim();
    const keywords = name.toLowerCase().match(/[a-z]{3,}/g) || [];
    items.push({ name, keywords: [...new Set(keywords)], price: Number(match[2].replace(",", ".")) });
  }
  return { currency: "USD", items };
}

export async function parseMenuText({ text, vendor_id, vendor_type = "unknown", mock = false } = {}) {
  if (!String(text || "").trim()) throw new Error("raw menu text is required");
  if (!String(vendor_id || "").trim()) throw new Error("vendor_id is required");
  let parsed;
  if (mock || !haveKey()) {
    parsed = mockParse(text);
  } else {
    const output = await complete([
      { role: "system", content: instructions },
      { role: "user", content: `Vendor id: ${vendor_id}
Vendor type: ${vendor_type}

UNTRUSTED MENU TEXT:
${text}` },
    ], { max_tokens: 1400, temperature: 0 });
    parsed = extractJson(output);
  }
  return {
    vendor_id: String(vendor_id).trim(),
    vendor_type: String(vendor_type || "unknown").trim(),
    currency: typeof parsed.currency === "string" && parsed.currency ? parsed.currency : "USD",
    items: verifyPricesInSource(text, Array.isArray(parsed.items) ? parsed.items : []),
  };
}

function parseArgs(argv) {
  const args = { file: null, raw: null, vendor_id: null, vendor_type: "unknown", mock: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--text" || token === "--file") args.file = argv[++i];
    else if (token === "--raw") args.raw = argv[++i];
    else if (token === "--vendor-id") args.vendor_id = argv[++i];
    else if (token === "--vendor-type") args.vendor_type = argv[++i];
    else if (token === "--mock") args.mock = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const text = args.raw != null ? args.raw : readFileSync(resolve(process.cwd(), args.file), "utf8");
  const parsed = await parseMenuText({ text, vendor_id: args.vendor_id, vendor_type: args.vendor_type, mock: args.mock });
  process.stdout.write(JSON.stringify(parsed) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`[menu-parser] ${error.message}`); process.exitCode = 1; });
}
