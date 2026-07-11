/**
 * invoke_local.js — run any Rollaway Function locally without deploying:
 * requires the function's index.js and calls main() with a mock args object,
 * exactly the way the DO runtime would.
 *
 * Usage:
 *   node functions/scripts/invoke_local.js <function_name> '<json args>'
 *   node functions/scripts/invoke_local.js get_vendors '{"lat":37.78,"lng":-122.40,"radius_m":500,"day":"fri","time":"12:00"}'
 *
 * Reads functions/.env (KEY=VALUE lines) into process.env first, so functions
 * that need GOOGLE_PLACES_KEY etc. behave like the deployed ones.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// minimal .env loader (functions/.env, then repo-root .env as fallback)
for (const envPath of [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const [, , fnName, argsJson] = process.argv;
if (!fnName) {
  console.error("usage: node invoke_local.js <function_name> '<json args>'");
  process.exit(1);
}

const fnDir = path.join(ROOT, 'packages', 'rollaway', fnName);
if (!fs.existsSync(path.join(fnDir, 'index.js'))) {
  console.error(`no such function: ${fnDir}`);
  process.exit(1);
}

const args = argsJson ? JSON.parse(argsJson) : {};
const { main } = require(path.join(fnDir, 'index.js'));

main(args)
  .then((res) => {
    console.log(JSON.stringify(res, null, 2));
  })
  .catch((err) => {
    console.error('HARNESS FAILURE (function threw past its guard):', err);
    process.exit(1);
  });
