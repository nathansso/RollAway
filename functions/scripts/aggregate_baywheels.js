/**
 * aggregate_baywheels.js — offline precompute: Bay Wheels trip CSV(s) ->
 * functions/packages/rollaway/get_foot_traffic/data/station_hourly.json
 * (station x day-of-week x hour -> average activity events per hour, where an
 * "event" is a trip STARTING or ENDING at the station).
 *
 * Usage:
 *   node functions/scripts/aggregate_baywheels.js <tripdata.csv> [more.csv...]
 *   node functions/scripts/aggregate_baywheels.js --synthetic
 *
 * Real mode: download a recent month from https://s3.amazonaws.com/baywheels-data/
 * (e.g. 202606-baywheels-tripdata.csv.zip), unzip, pass the CSV path.
 * Stations are keyed by the CSV's short station id (e.g. "SF-T21"), which is
 * the GBFS `short_name` — get_foot_traffic joins on that.
 *
 * --synthetic fallback (only if you cannot download real CSVs): fetches the
 * live GBFS station list (real ids) and fabricates a plausible commute-shaped
 * pattern. The output is marked meta.synthetic=true and
 * "TODO:replace-with-real-data" so it can never masquerade as real.
 *
 * Output schema (either mode):
 * {
 *   "meta": { source, generated_at, synthetic, days_covered,
 *             p95_events_per_station_hour },
 *   "stations": { "<short_id>": { "mon": [24 avgs], ..., "sun": [24 avgs] } }
 * }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const OUT_PATH = path.resolve(
  __dirname, '..', 'packages', 'rollaway', 'get_foot_traffic', 'data', 'station_hourly.json'
);
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Date.getDay() order
const STATION_INFO_URL = 'https://gbfs.lyft.com/gbfs/1.1/bay/en/station_information.json';

/** Minimal CSV line split honoring double-quoted fields. */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function aggregateReal(csvPaths) {
  // counts[station][dow][hour] and the set of dates seen per dow (to divide
  // counts into per-day averages)
  const counts = new Map();
  const datesByDow = Array.from({ length: 7 }, () => new Set());
  let rows = 0;

  const bump = (station, dow, hour) => {
    if (!station) return;
    let s = counts.get(station);
    if (!s) { s = Array.from({ length: 7 }, () => new Array(24).fill(0)); counts.set(station, s); }
    s[dow][hour]++;
  };

  for (const csvPath of csvPaths) {
    console.log(`reading ${csvPath} ...`);
    const rl = readline.createInterface({
      input: fs.createReadStream(csvPath),
      crlfDelay: Infinity,
    });
    let header = null;
    let idx = {};
    for await (const line of rl) {
      if (!header) {
        header = splitCsv(line);
        idx = {
          started_at: header.indexOf('started_at'),
          ended_at: header.indexOf('ended_at'),
          start_id: header.indexOf('start_station_id'),
          end_id: header.indexOf('end_station_id'),
        };
        if (Object.values(idx).some((i) => i < 0)) {
          throw new Error(`unexpected CSV header in ${csvPath}: ${line}`);
        }
        continue;
      }
      if (!line) continue;
      const f = splitCsv(line);
      rows++;
      // timestamps are local ("YYYY-MM-DD HH:MM:SS.mmm") — parse directly
      for (const [tsIdx, stIdx] of [[idx.started_at, idx.start_id], [idx.ended_at, idx.end_id]]) {
        const ts = f[tsIdx];
        if (!ts || ts.length < 13) continue;
        const d = new Date(ts.replace(' ', 'T'));
        if (Number.isNaN(d.getTime())) continue;
        const dow = d.getDay();
        datesByDow[dow].add(ts.slice(0, 10));
        bump(f[stIdx], dow, d.getHours());
      }
      if (rows % 200000 === 0) console.log(`  ${rows} trips ...`);
    }
  }
  console.log(`aggregated ${rows} trips from ${csvPaths.length} file(s).`);

  const stations = {};
  const allAvgs = [];
  for (const [station, grid] of counts) {
    const byDay = {};
    for (let dow = 0; dow < 7; dow++) {
      const nDays = Math.max(1, datesByDow[dow].size);
      byDay[DAY_KEYS[dow]] = grid[dow].map((c) => {
        const avg = Math.round((c / nDays) * 100) / 100;
        if (avg > 0) allAvgs.push(avg);
        return avg;
      });
    }
    stations[station] = byDay;
  }
  allAvgs.sort((a, b) => a - b);
  const p95 = allAvgs.length ? allAvgs[Math.floor(allAvgs.length * 0.95)] : 1;

  return {
    meta: {
      source: csvPaths.map((p) => path.basename(p)).join(', '),
      generated_at: new Date().toISOString(),
      synthetic: false,
      days_covered: [...new Set(datesByDow.flatMap((s) => [...s]))].length,
      p95_events_per_station_hour: p95,
    },
    stations,
  };
}

/** TODO:replace-with-real-data — commute-shaped fake pattern on real station ids. */
async function aggregateSynthetic() {
  console.log('SYNTHETIC mode: fetching real station list from GBFS ...');
  const res = await fetch(STATION_INFO_URL);
  if (!res.ok) throw new Error(`GBFS HTTP ${res.status}`);
  const info = await res.json();
  const stations = {};
  const allAvgs = [];
  for (const s of info.data.stations) {
    const key = s.short_name || s.station_id;
    const base = Math.max(0.5, (s.capacity || 15) / 10); // bigger stations busier
    const byDay = {};
    for (let dow = 0; dow < 7; dow++) {
      const weekend = dow === 0 || dow === 6;
      byDay[DAY_KEYS[dow]] = Array.from({ length: 24 }, (_, h) => {
        let shape;
        if (weekend) {
          shape = Math.exp(-((h - 14) ** 2) / 18); // lazy midday hump
        } else {
          shape =
            0.9 * Math.exp(-((h - 8.5) ** 2) / 2) +   // AM commute
            0.5 * Math.exp(-((h - 12.5) ** 2) / 2) +  // lunch
            1.0 * Math.exp(-((h - 17.5) ** 2) / 2);   // PM commute
        }
        const avg = Math.round(base * shape * 4 * 100) / 100;
        if (avg > 0) allAvgs.push(avg);
        return avg;
      });
    }
    stations[key] = byDay;
  }
  allAvgs.sort((a, b) => a - b);
  return {
    meta: {
      source: 'SYNTHETIC (TODO:replace-with-real-data) — commute-shaped pattern on real GBFS station ids',
      generated_at: new Date().toISOString(),
      synthetic: true,
      days_covered: 0,
      p95_events_per_station_hour: allAvgs[Math.floor(allAvgs.length * 0.95)] || 1,
    },
    stations,
  };
}

(async () => {
  const args = process.argv.slice(2);
  const result = args.includes('--synthetic') || args.length === 0
    ? await aggregateSynthetic()
    : await aggregateReal(args);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(result));
  const kb = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`wrote ${OUT_PATH} (${Object.keys(result.stations).length} stations, ${kb} KB, synthetic=${result.meta.synthetic})`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
