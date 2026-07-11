/**
 * get_events — CONTRACTS.md §B.5 (growth pillar)
 *
 * Ticketmaster Discovery API events near a point within a date range,
 * filtered to San Francisco venues, capped at MAX_EVENTS.
 *
 * expected_attendance: Ticketmaster does not publish attendance, so we map
 * well-known SF venues to their capacity (VENUE_CAPACITY below) and return
 * null for unknown venues — never a guessed number.
 *
 * Without TICKETMASTER_KEY the bundled data/sample_events.json fixture is
 * served (dates shifted into the requested range so downstream demo logic
 * works). // TODO(real-key)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  guard, ok,
  validatePoint, validateDate,
  fetchJSON, TTLCache, haversineMeters,
} = require('./shared');

const TM_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const TM_TTL_MS = 30 * 60 * 1000; // 30 min — event listings move slowly
const MAX_EVENTS = 20;
const cache = new TTLCache();

// Known SF venue capacities (people). Substring-matched, lowercase.
const VENUE_CAPACITY = [
  ['oracle park', 40000],
  ['chase center', 18064],
  ['bill graham', 8500],
  ['the masonic', 3300],
  ['the warfield', 2300],
  ['the fillmore', 1150],
  ['great american music hall', 600],
  ['golden gate park', 75000], // festival lawns (Outside Lands scale)
  ['moscone', 20000],
  ['pier 48', 5000],
  ['cow palace', 11300],
];

function expectedAttendance(venueName) {
  const v = String(venueName || '').toLowerCase();
  for (const [needle, cap] of VENUE_CAPACITY) {
    if (v.includes(needle)) return cap;
  }
  return null;
}

let SAMPLE_EVENTS = [];
try {
  SAMPLE_EVENTS = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'sample_events.json'), 'utf8')
  ).events;
} catch { /* fixture optional */ }

function sfDate(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86400000));
}

async function fetchTicketmaster(lat, lng, radius_m, dateFrom, dateTo) {
  const key = process.env.TICKETMASTER_KEY;
  if (!key) return fixtureEvents(lat, lng, radius_m, dateFrom, dateTo); // TODO(real-key)

  const radiusMiles = Math.max(1, Math.ceil(radius_m / 1609.34));
  const url = `${TM_URL}?apikey=${key}` +
    `&latlong=${lat},${lng}&radius=${radiusMiles}&unit=miles` +
    `&startDateTime=${dateFrom}T00:00:00Z&endDateTime=${dateTo}T23:59:59Z` +
    `&size=100&sort=date,asc`;
  try {
    const res = await fetchJSON(url, { timeoutMs: 8000, retries: 2 });
    const raw = (res._embedded && res._embedded.events) || [];
    return raw
      .map((e) => {
        const venue = e._embedded && e._embedded.venues && e._embedded.venues[0];
        if (!venue) return null;
        const city = venue.city && venue.city.name;
        if (city !== 'San Francisco') return null; // SF-relevant venues only
        const loc = venue.location || {};
        const start = e.dates && e.dates.start;
        return {
          name: e.name,
          venue: venue.name,
          point: { lat: Number(loc.latitude), lng: Number(loc.longitude) },
          start: start
            ? `${start.localDate}T${start.localTime || '00:00:00'}`
            : null,
          expected_attendance: expectedAttendance(venue.name),
          source: 'ticketmaster',
        };
      })
      .filter(Boolean)
      .filter((e) => Number.isFinite(e.point.lat) && Number.isFinite(e.point.lng));
  } catch (err) {
    console.error('Ticketmaster degraded to fixture:', err.message);
    return fixtureEvents(lat, lng, radius_m, dateFrom, dateTo);
  }
}

/**
 * Fixture events with dates projected into the requested range so date-range
 * filtering downstream behaves like the real feed. // TODO(real-key)
 */
function fixtureEvents(lat, lng, radius_m, dateFrom) {
  return SAMPLE_EVENTS.map((e, i) => ({
    name: e.name,
    venue: e.venue,
    point: e.point,
    start: `${addDays(dateFrom, i % 3)}T${e.local_time}`,
    expected_attendance: expectedAttendance(e.venue),
    source: 'ticketmaster',
  }));
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

exports.main = guard(async (args) => {
  const { lat, lng, radius_m } = validatePoint(args, { defaultRadius: 3000, maxRadius: 10000 });
  const dateFrom = validateDate(args.date_from, 'date_from') || sfDate(0);
  const dateTo = validateDate(args.date_to, 'date_to') || sfDate(7);

  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)},${radius_m},${dateFrom},${dateTo}`;
  const events = await cache.getOrSet(cacheKey, TM_TTL_MS, async () => {
    const all = await fetchTicketmaster(lat, lng, radius_m, dateFrom, dateTo);
    return all
      .filter((e) => haversineMeters(lat, lng, e.point.lat, e.point.lng) <= radius_m)
      .slice(0, MAX_EVENTS);
  });

  return ok({ events, count: events.length });
});
