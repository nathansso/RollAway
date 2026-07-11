/**
 * fetch_static_data.js — offline precompute for check_clearance.
 *
 * Snapshots three datasets into functions/packages/rollaway/check_clearance/data/
 * (these don't change during a hackathon — snapshot, don't fetch live):
 *
 *  1. schools.geojson   — SF Schools (Socrata 7e7j-59qk, active schools with
 *                         coordinates; keeps grade range so the 500 ft rule can
 *                         target middle schools = grades 6-8 overlap).
 *  2. hydrants.geojson  — fire hydrants from OpenStreetMap via Overpass
 *                         (data.sfgov.org has NO public hydrant dataset —
 *                         checked the Socrata catalog 2026-07-10; OSM is the
 *                         best open substitute). If Overpass is down the file
 *                         is written empty and check_clearance SKIPS the
 *                         hydrant check (documented there).
 *  3. sidewalks.geojson — Sidewalk Widths 2014 (Socrata 4g86-grxu), slimmed to
 *                         street + sidewalk_f (actual width, feet) + geometry,
 *                         for the pushcart sidewalk-clearance rule.
 *
 * Run:  node functions/scripts/fetch_static_data.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'packages', 'rollaway', 'check_clearance', 'data');

const SCHOOLS_URL = 'https://data.sfgov.org/resource/7e7j-59qk.json?$limit=5000';
const SIDEWALKS_URL =
  'https://data.sfgov.org/resource/4g86-grxu.json?' +
  '$select=street,st_type,sidewalk_f,shape&$limit=50000';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// SF proper bounding box (south, west, north, east)
const OVERPASS_QUERY =
  '[out:json][timeout:90];node["emergency"="fire_hydrant"](37.70,-122.52,37.84,-122.35);out;';

const round6 = (n) => Math.round(n * 1e6) / 1e6;

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

function writeGeoJSON(file, features, meta) {
  const fc = { type: 'FeatureCollection', _meta: meta, features };
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(fc));
  console.log(`${file}: ${features.length} features`);
}

async function snapshotSchools() {
  const rows = await fetchJSON(SCHOOLS_URL);
  const features = rows
    .filter((r) => r.latitude && r.longitude && r.status === 'Active')
    .map((r) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [round6(Number(r.longitude)), round6(Number(r.latitude))],
      },
      properties: {
        name: r.school,
        low_grade: r.low_grade ?? null,
        high_grade: r.high_grade ?? null,
        entity_type: r.entity_type ?? null,
      },
    }));
  writeGeoJSON('schools.geojson', features, {
    source: 'data.sfgov.org 7e7j-59qk (SF Schools, Active only)',
    snapshot_date: new Date().toISOString().slice(0, 10),
  });
}

async function snapshotHydrants() {
  try {
    const body = 'data=' + encodeURIComponent(OVERPASS_QUERY);
    const res = await fetchJSON(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const features = (res.elements || [])
      .filter((e) => e.lat && e.lon)
      .map((e) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [round6(e.lon), round6(e.lat)] },
        properties: { osm_id: e.id },
      }));
    writeGeoJSON('hydrants.geojson', features, {
      source: 'OpenStreetMap via Overpass (emergency=fire_hydrant, SF bbox). ' +
        'data.sfgov.org publishes no hydrant dataset (catalog checked 2026-07-10).',
      snapshot_date: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error(`hydrants: Overpass failed (${err.message}) — writing empty file; ` +
      'check_clearance will SKIP the hydrant check and document it.');
    writeGeoJSON('hydrants.geojson', [], {
      source: 'UNAVAILABLE — Overpass fetch failed and data.sfgov.org has no hydrant dataset',
      snapshot_date: new Date().toISOString().slice(0, 10),
    });
  }
}

async function snapshotSidewalks() {
  const rows = await fetchJSON(SIDEWALKS_URL);
  const features = rows
    .filter((r) => r.shape && r.shape.coordinates && r.sidewalk_f !== undefined)
    .map((r) => ({
      type: 'Feature',
      geometry: {
        type: r.shape.type,
        coordinates: r.shape.coordinates.map(([x, y]) => [round6(x), round6(y)]),
      },
      properties: {
        street: `${r.street || ''} ${r.st_type || ''}`.trim(),
        sidewalk_f: Number(r.sidewalk_f),
      },
    }));
  writeGeoJSON('sidewalks.geojson', features, {
    source: 'data.sfgov.org 4g86-grxu (Sidewalk Widths 2014; sidewalk_f = actual width, feet)',
    snapshot_date: new Date().toISOString().slice(0, 10),
  });
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await snapshotSchools();
  await snapshotHydrants();
  await snapshotSidewalks();
  console.log('done.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
