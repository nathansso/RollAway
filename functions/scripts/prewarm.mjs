/**
 * prewarm.mjs — warm every Function on the exact demo scenario (AGENT-BRIEF §6b)
 * so there are NO cold starts on stage. Also reports agent/KB readiness.
 *
 * Modes:
 *   - FUNCTIONS_BASE_URL set  -> ping the deployed URLs over HTTP.
 *   - unset                   -> local in-process main() (runnable pre-deploy).
 *
 * Pings all six base Functions + recommend_spots on the scenario coords/day/
 * time/date. Confirms the menu KB + both agents are up when SPOT_SCOUT_URL /
 * MENU_RAG_URL / AGENT_HEALTH_URL are set; otherwise prints a clear
 * "agents not wired" line (see issues #B/#C) instead of failing. Prints each
 * Function's latency and EXITS NON-ZERO if any Function errors — it is a gate.
 *
 * Usage:  node functions/scripts/prewarm.mjs
 *         DEMO_DATA_MODE=1 node functions/scripts/prewarm.mjs   # warm the demo build
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'packages', 'rollaway');

for (const envPath of [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { signalArgs } = require(path.join(PKG, 'recommend_spots', 'candidates.js'));
const SCENARIO = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo_data', 'scenario.json'), 'utf8'));

const BASE_URL = process.env.FUNCTIONS_BASE_URL ? process.env.FUNCTIONS_BASE_URL.replace(/\/$/, '') : null;

const ctx = {
  day: SCENARIO.when.day,
  time: SCENARIO.when.time,
  hour: SCENARIO.when.hour,
  date_from: SCENARIO.when.date_from,
  date_to: SCENARIO.when.date_to,
  radius_m: SCENARIO.radius_m,
  vendor_type: SCENARIO.default_vendor_type,
};

// Args for each base Function on the anchor (same shapes recommend_spots uses).
const anchorArgs = signalArgs(SCENARIO.anchor, ctx);

const RECOMMEND_INPUT = {
  user_profile: {
    vendor_type: SCENARIO.default_vendor_type,
    menu: [{ item: 'al pastor taco', price: 4.5 }],
    max_travel_minutes: SCENARIO.max_travel_minutes,
    travel_mode: 'driving',
  },
  when: SCENARIO.when,
  location: { ...SCENARIO.anchor, radius_m: SCENARIO.radius_m },
};

const TARGETS = [
  ['get_vendors', anchorArgs.get_vendors],
  ['get_closures', anchorArgs.get_closures],
  ['get_restaurants', anchorArgs.get_restaurants],
  ['get_foot_traffic', anchorArgs.get_foot_traffic],
  ['get_events', anchorArgs.get_events],
  ['check_clearance', anchorArgs.check_clearance],
  ['recommend_spots', RECOMMEND_INPUT],
];

async function pingLocal(name, args) {
  const { main } = require(path.join(PKG, name, 'index.js'));
  const res = await main(args);
  return { statusCode: res && res.statusCode, body: res && res.body };
}

async function pingHttp(name, args) {
  const res = await fetch(`${BASE_URL}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  return { statusCode: res.status, body };
}

async function ping(name, args) {
  const t0 = Date.now();
  try {
    const { statusCode, body } = BASE_URL ? await pingHttp(name, args) : await pingLocal(name, args);
    const ms = Date.now() - t0;
    const okStatus = statusCode === 200 && !(body && body.error);
    return { name, ok: okStatus, ms, note: okStatus ? summarize(name, body) : `HTTP ${statusCode}${body && body.error ? ' ' + body.error.code : ''}` };
  } catch (err) {
    return { name, ok: false, ms: Date.now() - t0, note: err.message };
  }
}

function summarize(name, body) {
  if (!body) return '';
  if (name === 'recommend_spots') return `${(body.spots || []).length} spots`;
  if (name === 'get_vendors') return `${body.count} vendors`;
  if (name === 'get_closures') return `${body.count} closures`;
  if (name === 'get_events') return `${body.count} events`;
  if (name === 'get_restaurants') return `${body.total} venues, saturation ${body.saturation}`;
  if (name === 'get_foot_traffic') return `score ${body.score}`;
  if (name === 'check_clearance') return `allowed ${body.allowed}`;
  return 'ok';
}

async function checkAgents() {
  const lines = [];
  const spotScout = process.env.SPOT_SCOUT_URL;
  const menuRag = process.env.MENU_RAG_URL;
  const health = process.env.AGENT_HEALTH_URL;
  if (!spotScout && !menuRag && !health) {
    lines.push('  agents not wired (SPOT_SCOUT_URL / MENU_RAG_URL / AGENT_HEALTH_URL unset) — see issues #B/#C');
    lines.push('  recommend_spots uses deterministic why-lines + cuisine bridge until then.');
    return { lines, ok: true };
  }
  let ok = true;
  for (const [label, url] of [['agent health', health], ['Spot Scout', spotScout], ['menu RAG/KB', menuRag]]) {
    if (!url) continue;
    try {
      const res = await fetch(url, { method: 'GET' });
      lines.push(`  ${label}: HTTP ${res.status} (${url})`);
      if (res.status >= 500) ok = false;
    } catch (err) {
      lines.push(`  ${label}: UNREACHABLE (${url}) — ${err.message}`);
      ok = false;
    }
  }
  return { lines, ok };
}

async function main() {
  console.log(`Prewarming "${SCENARIO.name}" via ${BASE_URL ? BASE_URL : 'local in-process main()'}` +
    `${process.env.DEMO_DATA_MODE ? ' [DEMO_DATA_MODE]' : ''}\n`);

  const results = [];
  for (const [name, args] of TARGETS) {
    const r = await ping(name, args);
    results.push(r);
    const mark = r.ok ? 'ok  ' : 'FAIL';
    console.log(`  [${mark}] ${name.padEnd(16)} ${String(r.ms).padStart(6)}ms  ${r.note}`);
  }

  console.log('\nAgents / KB:');
  const agents = await checkAgents();
  for (const l of agents.lines) console.log(l);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Functions warm.`);
  if (failed.length) {
    console.error(`PREWARM FAILED: ${failed.map((r) => r.name).join(', ')}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => { console.error('prewarm crashed:', err); process.exit(1); });
