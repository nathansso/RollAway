/**
 * freeze_snapshots.mjs — freeze the demo snapshots (AGENT-BRIEF §6a).
 *
 * Reads functions/demo_data/scenario.json, generates the SAME 3 candidate
 * points recommend_spots uses (imported from recommend_spots/candidates.js so
 * they can't drift), calls every base Function's LIVE path (real keys if
 * present, else bundled fixtures) for each point, and writes each output body
 * to functions/demo_data/<fn>.<snapshotKey>.json using the shared snapshotKey.
 * Also freezes the Mapbox travel matrix. Then syncs the per-function copies.
 *
 * Usage:  node functions/scripts/freeze_snapshots.mjs
 *
 * Idempotent modulo live-data drift: output is canonicalized (sorted keys,
 * trailing newline) so structurally identical data produces identical bytes.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEMO_DIR = path.join(ROOT, 'demo_data');
const PKG = path.join(ROOT, 'packages', 'rollaway');

// --- load .env so live keys (Socrata/Google/Ticketmaster/Mapbox) are present ---
for (const envPath of [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
// Freeze must hit LIVE paths — force demo mode OFF regardless of .env.
delete process.env.DEMO_DATA_MODE;

const { snapshotKey } = require(path.join(ROOT, 'lib', 'shared.js'));
const { makeCandidates, signalArgs } = require(path.join(PKG, 'recommend_spots', 'candidates.js'));
const { travelMatrix, travelKey } = require(path.join(PKG, 'recommend_spots', 'travel.js'));

const SCENARIO = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'scenario.json'), 'utf8'));

const BASE_FUNCTIONS = [
  'get_vendors', 'get_closures', 'get_restaurants',
  'get_foot_traffic', 'get_events', 'check_clearance',
];
const TRAVEL_MODES = ['driving', 'walking']; // driving is the demo default; walking for flexibility

/** Recursively sort object keys so re-runs produce stable diffs. */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
    return out;
  }
  return v;
}

function writeSnapshot(fn, key, body) {
  const file = path.join(DEMO_DIR, `${fn}.${key}.json`);
  fs.writeFileSync(file, JSON.stringify(canonical(body), null, 2) + '\n');
  return path.basename(file);
}

async function main() {
  const ctx = {
    day: SCENARIO.when.day,
    time: SCENARIO.when.time,
    hour: SCENARIO.when.hour,
    date_from: SCENARIO.when.date_from,
    date_to: SCENARIO.when.date_to,
    radius_m: SCENARIO.radius_m,
    vendor_type: SCENARIO.default_vendor_type,
  };
  const candidates = makeCandidates(SCENARIO.anchor);
  const points = candidates.map((c) => c.point);

  console.log(`Freezing snapshots for scenario "${SCENARIO.name}" (${candidates.length} candidate points)\n`);

  const coverage = []; // { point, fn, key, ok, note }

  for (const c of candidates) {
    const argsByFn = signalArgs(c.point, ctx);
    for (const fn of BASE_FUNCTIONS) {
      const args = argsByFn[fn];
      const key = snapshotKey(args);
      try {
        // fresh module each point is unnecessary; main() is pure over args.
        const { main: fnMain } = require(path.join(PKG, fn, 'index.js'));
        const res = await fnMain(args);
        if (!res || res.statusCode !== 200 || !res.body || res.body.error) {
          coverage.push({ point: c.id, fn, key, ok: false, note: res && res.body && res.body.error ? res.body.error.code : `HTTP ${res && res.statusCode}` });
          continue;
        }
        const name = writeSnapshot(fn, key, res.body);
        coverage.push({ point: c.id, fn, key, ok: true, note: name });
      } catch (err) {
        coverage.push({ point: c.id, fn, key, ok: false, note: err.message });
      }
    }
  }

  // --- travel matrix (anchor -> all candidate points), per mode ---
  for (const mode of TRAVEL_MODES) {
    const key = travelKey(SCENARIO.anchor, mode);
    try {
      const rows = await travelMatrix(SCENARIO.anchor, points, mode);
      writeSnapshot('travel', key, { mode, origin: SCENARIO.anchor, rows });
      const est = rows.some((r) => r.estimated);
      coverage.push({ point: 'anchor', fn: `travel(${mode})`, key, ok: true, note: est ? 'travel.*.json (ESTIMATED — Mapbox miss)' : 'travel.*.json (live Mapbox)' });
    } catch (err) {
      coverage.push({ point: 'anchor', fn: `travel(${mode})`, key, ok: false, note: err.message });
    }
  }

  // --- coverage report ---
  console.log('Coverage report (fn × point):');
  let okCount = 0;
  for (const row of coverage) {
    const mark = row.ok ? 'ok ' : 'FAIL';
    if (row.ok) okCount++;
    console.log(`  [${mark}] ${row.point.padEnd(7)} ${row.fn.padEnd(18)} ${row.note}`);
  }
  console.log(`\n${okCount}/${coverage.length} snapshots written to ${path.relative(ROOT, DEMO_DIR)}/`);

  // --- propagate per-function copies (recommend_spots reads siblings' snapshots) ---
  console.log('\nSyncing per-function demo_data copies...');
  execFileSync('node', [path.join(ROOT, 'scripts', 'sync_shared.js')], { stdio: 'inherit' });

  const anyFail = coverage.some((r) => !r.ok);
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => { console.error('freeze failed:', err); process.exit(1); });
