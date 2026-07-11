#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseMenuText } from "./parse.mjs";
import { ingestMenu } from "./ingest.mjs";

function args(argv) {
  const out = { file: null, vendor_id: null, vendor_type: "unknown", mock: false, name: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--text" || argv[i] === "--file") out.file = argv[++i];
    else if (argv[i] === "--vendor-id") out.vendor_id = argv[++i];
    else if (argv[i] === "--vendor-type") out.vendor_type = argv[++i];
    else if (argv[i] === "--name") out.name = argv[++i];
    else if (argv[i] === "--mock") out.mock = true;
  }
  return out;
}

export async function parseAndIngest(options) {
  const text = options.text ?? readFileSync(resolve(process.cwd(), options.file), "utf8");
  const menu = await parseMenuText({ text, vendor_id: options.vendor_id, vendor_type: options.vendor_type, mock: options.mock });
  return ingestMenu({ menu, name: options.name, mock: options.mock });
}

async function main() {
  const options = args(process.argv);
  const manifest = await parseAndIngest(options);
  process.stdout.write(JSON.stringify(manifest) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`[parse-and-ingest] ${error.message}`); process.exitCode = 1; });
}
