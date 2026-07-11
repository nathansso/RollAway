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
        source: "ticketmaster"
      }
    ],
    count: 1
  },

  // 6. clearance geometry check — 50ft < 75ft ⇒ pass:false ⇒ NOT allowed.
  //    This is the exact §B example and the answer eval seed #2 asserts (answers NO from geometry).
  clearance_check: {
    allowed: false,
    checks: [
      { rule: "75ft from restaurant entrance", required_ft: 75, actual_ft: 50, pass: false, cite: "dpw-182101" },
      { rule: "7ft from hydrant", required_ft: 7, actual_ft: 20, pass: true, cite: "dpw-182101" },
      { rule: "500ft from middle school (school hours)", required_ft: 500, actual_ft: 900, pass: true, cite: "dpw-182101" }
    ]
  }
};

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
