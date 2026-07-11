// §B example payloads — copied field-for-field from docs/CONTRACTS.md §B.
// "..." placeholders in the contract are materialized into concrete sample values;
// every FIELD NAME is verbatim (that is what §B freezes). Shared by serve.js and the
// offline eval so the fixture responses and the eval's expectations can never drift.

export const payloads = {
  // 1. get_vendors
  get_vendors: {
    vendors: [
      {
        permit_id: "21MFF-0123",
        name: "El Sabor",
        type: "Truck",
        cuisine: "tacos",              // enriched by serverless inference (P2)
        status: "APPROVED",
        point: { lat: 37.781, lng: -122.401 },
        scheduled_here: true,
        schedule_window: "11:00-14:00"
      }
    ],
    count: 1
  },

  // 2. get_closures
  get_closures: {
    closures: [
      {
        id: "clo-2026-0711-fair",
        reason: "Street fair",
        source: "sfmta_event",         // sfmta_event | dpw_permit
        geometry: { type: "LineString", coordinates: [[-122.401, 37.781], [-122.399, 37.782]] },
        active_from: "2026-07-11T08:00:00",
        active_to: "2026-07-11T20:00:00"
      }
    ],
    count: 1
  },

  // 3. get_foot_traffic  (bike activity is a PROXY for pedestrians)
  get_foot_traffic: {
    score: 0.7,
    basis: "bay_wheels",
    nearby_stations: 4,
    live_activity: 22,
    historical_avg: 18
  },

  // 4. get_restaurants
  get_restaurants: {
    total: 14,
    by_cuisine: { tacos: 2, burgers: 3, coffee: 5 },
    by_price: { "1": 6, "2": 7, "3": 1 },
    saturation: "low"                  // low | medium | high
  },

  // 5. get_events
  get_events: {
    events: [
      {
        name: "SF Giants vs Dodgers",
        venue: "Oracle Park",
        point: { lat: 37.778, lng: -122.389 },
        start: "2026-07-11T18:45:00",
        expected_attendance: 40000,
        event_url: "https://www.ticketmaster.com/event/123",
        promoter_name: null,
        source: "ticketmaster"
      }
    ],
    count: 1
  },

  // 6. check_clearance — 50ft < 75ft ⇒ pass:false ⇒ NOT allowed.
  //    This is the exact §B example (truck ⇒ 3 rows) and the answer eval seed #2 asserts
  //    (answers NO from geometry). Pushcart types get a 4th sidewalk-width row — see
  //    clearancePayload() below, which is what serve.js returns per vendor_type.
  check_clearance: {
    allowed: false,
    checks: [
      { rule: "75ft from restaurant entrance", required_ft: 75, actual_ft: 50, pass: false, cite: "dpw-182101" },
      { rule: "7ft from hydrant", required_ft: 7, actual_ft: 20, pass: true, cite: "dpw-182101" },
      { rule: "500ft from middle school (school hours)", required_ft: 500, actual_ft: 900, pass: true, cite: "dpw-182101" }
    ]
  }
};

// The 4th clearance row (sidewalk width) — pushcart types ONLY, distinct legal basis, so it
// cites sf-sidewalk-width (NOT dpw-182101). 10 ft min = 6 ft clear path + 4 ft cart footprint.
export const SIDEWALK_WIDTH_ROW = {
  rule: "10ft min sidewalk width (6ft path + 4ft cart)",
  required_ft: 10, actual_ft: 12, pass: true, cite: "sf-sidewalk-width"
};

const PUSHCART_TYPES = new Set(["pushcart_cooking", "pushcart_nocook"]);

// check_clearance's real, vendor-type-aware shape: 3 rows for truck/trailer, 4 for pushcarts.
// This is what agents are built and evaluated against.
export function clearancePayload(vendorType) {
  const base = payloads.check_clearance;
  if (!PUSHCART_TYPES.has(vendorType)) return base;                 // truck / trailer -> 3 rows
  const checks = [...base.checks, SIDEWALK_WIDTH_ROW];              // pushcart -> 4 rows
  return { allowed: checks.every((c) => c.pass), checks };
}

// §B.4 — get_restaurants gains an optional `window` block ONLY when a valid day+time_from+time_to
// is supplied. The base payload above keeps its exact 4 §B keys (no window) when no window is asked.
export const restaurantsWindowBlock = (day, time_from, time_to) => ({
  day, time_from, time_to,
  open_count: 6,
  open_weighted: 7.4,
  saturation: "low",                 // low | medium | high (window-specific weighted verdict)
  by_cuisine_open: { tacos: 1, burgers: 3 }
});

// Returns { ok, body } — ok:false with a BAD_INPUT envelope for a partial window (all three
// window fields go together, per §B.4).
export function restaurantsPayload({ day, time_from, time_to } = {}) {
  const any = day || time_from || time_to;
  const all = day && time_from && time_to;
  if (any && !all) return { ok: false, body: errorEnvelope("BAD_INPUT") };
  const base = payloads.get_restaurants;
  return { ok: true, body: all ? { ...base, window: restaurantsWindowBlock(day, time_from, time_to) } : base };
}

// Common error envelope (all Functions) — reachable via ?fail=CODE on any route.
export function errorEnvelope(code) {
  const messages = {
    UPSTREAM_TIMEOUT: "The upstream data source timed out.",
    BAD_INPUT: "The request was missing or had invalid parameters.",
    RATE_LIMIT: "Rate limit exceeded; try again shortly."
  };
  const c = messages[code] ? code : "UPSTREAM_TIMEOUT";
  return { error: { code: c, message: messages[c] } };
}

// HTTP status to pair with an error code (agents key off the body, not the status).
export const errorStatus = { BAD_INPUT: 400, RATE_LIMIT: 429, UPSTREAM_TIMEOUT: 504 };

export const TOOL_NAMES = Object.keys(payloads);
