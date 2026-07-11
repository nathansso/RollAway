// POST /chat server — the single routed entry point Person 1 calls (the §A contract).
// This is the "build-your-own agent runtime on Gradient inference" path, used because managed
// Gradient Agent creation is currently gated on the account (see RUNBOOK "Managed vs runtime").
// Uses Node's built-in http (no dependency / no npm install needed).
//
//   GRADIENT_API_KEY=<model key> TOOL_BASE_URL=http://localhost:8787 node server.mjs
//   curl -s localhost:8080/chat -X POST -H 'content-type: application/json' \
//     -d '{"session_id":"s1","message":"pushcart selling ice cream, what permits?","context":{"vendor_type":"pushcart_nocook"}}'

import { createServer } from "node:http";
import { handleChat } from "./chat.mjs";
import { haveKey, config } from "./gradient.mjs";
import { toolBase } from "./tools.mjs";

const PORT = process.env.PORT || 8080;

const send = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, { service: "rollaway-agents-runtime", model: config.MODEL, inference: config.URL, tool_base_url: toolBase, key_present: haveKey() });
  }
  if (req.method === "POST" && url.pathname === "/chat") {
    let raw = "";
    req.on("data", (d) => { raw += d; if (raw.length > 1e6) req.destroy(); });
    req.on("end", async () => {
      let payload = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch { return send(res, 400, { error: "invalid JSON" }); }
      try {
        const { envelope, meta } = await handleChat(payload);
        send(res, 200, url.searchParams.get("debug") ? { envelope, meta } : envelope);   // §A contract: bare envelope
      } catch (e) {
        send(res, 500, { agent: "spot_scout", reply_markdown: `error: ${e.message}`, citations: [], map_actions: [], checklist: null });
      }
    });
    return;
  }
  send(res, 404, { error: "not found", routes: ["GET /", "POST /chat"] });
});

server.listen(PORT, () => console.log(`[runtime] rollaway agents on http://localhost:${PORT}  (model=${config.MODEL}, tools=${toolBase}, key=${haveKey()})`));
