// Fixture tool server — one route per §B tool, each returning its §B example verbatim.
// Until Person 3's real Functions are live, point every Gradient tool at this server.
// Swap to real Functions later with a one-line base-URL change (see RUNBOOK.md / TOOL_BASE_URL).
//
//   cd agents/fixtures && npm install && node serve.js
//   curl -s localhost:8787/get_foot_traffic | jq .
//   curl -s "localhost:8787/check_clearance?fail=UPSTREAM_TIMEOUT" | jq .   # error envelope
//   curl -s -X POST localhost:8787/check_clearance -d '{"vendor_type":"pushcart_cooking"}' \
//     -H 'content-type: application/json' | jq .   # 4 rows (adds sidewalk width)
//
// Node/Express (per SETUP.md). Payloads come from payloads.mjs so the fixture responses
// and the offline eval's expectations can never drift.

import express from "express";
import { payloads, errorEnvelope, errorStatus, TOOL_NAMES, clearancePayload, restaurantsPayload } from "./payloads.mjs";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8787;

// Log with any PII stripped (mirror of the guardrail logging rule) — fixtures never see PII,
// but we keep the discipline so this stub matches production behavior.
app.use((req, _res, next) => {
  console.log(`[fixture] ${req.method} ${req.path}${req.query.fail ? ` (fail=${req.query.fail})` : ""}`);
  next();
});

// Health / index
app.get("/", (_req, res) => {
  res.json({
    service: "rollaway-fixtures",
    tools: TOOL_NAMES,
    usage: "GET or POST /<tool>. Add ?fail=UPSTREAM_TIMEOUT|BAD_INPUT|RATE_LIMIT to force the error envelope."
  });
});

// One handler per tool; accept GET (easy curl) and POST (how Gradient calls it).
for (const tool of TOOL_NAMES) {
  const handler = (req, res) => {
    const fail = (req.query.fail || (req.body && req.body.fail));
    if (fail) {
      const body = errorEnvelope(String(fail).toUpperCase());
      return res.status(errorStatus[body.error.code] || 500).json(body);
    }
    // check_clearance is vendor-type-aware: 3 rows for truck/trailer, 4 (adds sidewalk width) for pushcarts.
    if (tool === "check_clearance") {
      const vt = (req.body && req.body.vendor_type) || req.query.vendor_type || "truck";
      return res.json(clearancePayload(vt));
    }
    // get_restaurants is window-aware (§B.4): adds a `window` block when day+time_from+time_to given.
    if (tool === "get_restaurants") {
      const b = req.body || {};
      const r = restaurantsPayload({
        day: b.day || req.query.day,
        time_from: b.time_from || req.query.time_from,
        time_to: b.time_to || req.query.time_to
      });
      if (!r.ok) return res.status(errorStatus[r.body.error.code] || 500).json(r.body);
      return res.json(r.body);
    }
    return res.json(payloads[tool]);
  };
  app.get(`/${tool}`, handler);
  app.post(`/${tool}`, handler);
}

app.listen(PORT, () => {
  console.log(`[fixture] rollaway fixture tools on http://localhost:${PORT}`);
  console.log(`[fixture] routes: ${TOOL_NAMES.map((t) => "/" + t).join(", ")}`);
});
