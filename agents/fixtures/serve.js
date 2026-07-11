// Fixture tool server — one route per §B tool, each returning its §B example verbatim.
// Until Person 3's real Functions are live, point every Gradient tool at this server.
// Swap to real Functions later with a one-line base-URL change (see RUNBOOK.md / TOOL_BASE_URL).
//
//   cd agents/fixtures && npm install && node serve.js
//   curl -s localhost:8787/get_foot_traffic | jq .
//   curl -s "localhost:8787/clearance_check?fail=UPSTREAM_TIMEOUT" | jq .   # error envelope
//
// Node/Express (per SETUP.md). Payloads come from payloads.mjs so the fixture responses
// and the offline eval's expectations can never drift.

import express from "express";
import { payloads, errorEnvelope, errorStatus, TOOL_NAMES } from "./payloads.mjs";

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
    return res.json(payloads[tool]);
  };
  app.get(`/${tool}`, handler);
  app.post(`/${tool}`, handler);
}

app.listen(PORT, () => {
  console.log(`[fixture] rollaway fixture tools on http://localhost:${PORT}`);
  console.log(`[fixture] routes: ${TOOL_NAMES.map((t) => "/" + t).join(", ")}`);
});
