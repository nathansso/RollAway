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
import { runSpotScoutSingleTurn, runPermitCopilot, runFormFill, resolveFormPdfUrl } from "./agents.mjs";
import { validateEnvelope } from "../evals/lib/schema.mjs";
import { competitionOverlap } from "../menu_rag/query.mjs";
import { extractMenu } from "../menu_rag/extract.mjs";

const PORT = process.env.PORT || 8080;

const send = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = "";
  // 8MB cap: menu-image data URLs (base64) can exceed the default 1MB.
  req.on("data", (d) => { raw += d; if (raw.length > 8e6) req.destroy(); });
  req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
});

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const debug = url.searchParams.get("debug");

  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, {
      service: "rollaway-agents-runtime", model: config.MODEL, inference: config.URL,
      tool_base_url: toolBase, key_present: haveKey(),
      routes: ["GET /", "POST /chat (legacy, router)", "POST /spot_scout (single-turn, no router)", "POST /permit_copilot (direct)", "POST /menu_extract", "POST /menu_overlap", "POST /form_fill (doc ingestion)", "GET /form_pdf?source= (verified PDF proxy)"]
    });
  }

  // Legacy routed entry (kept for back-compat; NOT the map-first demo critical path).
  if (req.method === "POST" && url.pathname === "/chat") {
    readBody(req).then(async (payload) => {
      try {
        const { envelope, meta } = await handleChat(payload);
        send(res, 200, debug ? { envelope, meta } : envelope);
      } catch (e) {
        send(res, 500, { agent: "spot_scout", reply_markdown: `error: ${e.message}`, citations: [], map_actions: [], checklist: null });
      }
    }).catch(() => send(res, 400, { error: "invalid JSON" }));
    return;
  }

  // DIRECT single-turn Spot Scout — called by recommend_spots with pre-gathered signals. No router.
  if (req.method === "POST" && url.pathname === "/spot_scout") {
    readBody(req).then(async (payload) => {
      try {
        const { env, trace } = await runSpotScoutSingleTurn(payload);
        const errors = validateEnvelope(env);
        send(res, 200, debug ? { envelope: env, meta: { single_turn: true, tool_calls: trace.length, valid: errors.length === 0, errors } } : env);
      } catch (e) {
        send(res, 500, { agent: "spot_scout", reply_markdown: `error: ${e.message}`, citations: [], map_actions: [], checklist: null });
      }
    }).catch(() => send(res, 400, { error: "invalid JSON" }));
    return;
  }

  // DIRECT Permit Copilot — called by the Permits tab with { vendor_type, permit_progress }. No router.
  if (req.method === "POST" && url.pathname === "/permit_copilot") {
    readBody(req).then(async (payload) => {
      try {
        const ctx = { vendor_type: payload.vendor_type, ...(payload.context || {}), permit_progress: payload.permit_progress };
        const { env, trace } = await runPermitCopilot(payload.message || `permit checklist for ${payload.vendor_type}`, ctx);
        const errors = validateEnvelope(env);
        send(res, 200, debug ? { envelope: env, meta: { direct: true, tool_calls: trace.length, valid: errors.length === 0, errors } } : env);
      } catch (e) {
        send(res, 500, { agent: "permit_copilot", reply_markdown: `error: ${e.message}`, citations: [], map_actions: [], checklist: null });
      }
    }).catch(() => send(res, 400, { error: "invalid JSON" }));
    return;
  }

  // Menu extraction (sign-up) — { input_type, text|url|image_data_url, vendor_id, vendor_type }.
  // Uses Gradient serverless inference (text/url via parseMenuText, images via the vision model).
  if (req.method === "POST" && url.pathname === "/menu_extract") {
    readBody(req).then(async (payload) => {
      try {
        const r = await extractMenu(payload);
        send(res, 200, r);
      } catch (e) {
        send(res, 200, { ok: false, error: e.message });
      }
    }).catch(() => send(res, 400, { error: "invalid JSON" }));
    return;
  }

  // Menu-RAG competition overlap — { menu_kb_id, competitors }. Items+prices, never cuisine.
  if (req.method === "POST" && url.pathname === "/menu_overlap") {
    readBody(req).then(async (payload) => {
      try {
        const r = await competitionOverlap({ menu_kb_id: payload.menu_kb_id, competitors: payload.competitors, menu: payload.menu });
        send(res, 200, r);
      } catch (e) {
        send(res, 400, { error: e.message });
      }
    }).catch(() => send(res, 400, { error: "invalid JSON" }));
    return;
  }

  // PDF proxy — GET /form_pdf?source=<cite>. Fetches the LIVE verified, allowlisted agency PDF
  // server-side (the agency hosts send no CORS headers, so the browser can't) and streams the bytes
  // back with permissive CORS so the frontend can fill the AcroForm client-side. Never a guessed URL.
  if (req.method === "GET" && url.pathname === "/form_pdf") {
    (async () => {
      const source = url.searchParams.get("source");
      const pdfUrl = resolveFormPdfUrl(source);
      if (!pdfUrl) return send(res, 400, { error: { code: "BAD_INPUT", message: `no verified form PDF for source '${source}'` } });
      try {
        const upstream = await fetch(pdfUrl, { redirect: "follow" });
        if (!upstream.ok) return send(res, 502, { error: { code: "UPSTREAM_TIMEOUT", message: `agency PDF ${upstream.status}` } });
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(200, {
          "content-type": "application/pdf",
          "content-length": buf.length,
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
          "x-form-source": source,
        });
        res.end(buf);
      } catch (e) {
        send(res, 502, { error: { code: "UPSTREAM_TIMEOUT", message: e.message } });
      }
    })();
    return;
  }

  // Doc ingestion for paperwork — { source, vendor_type, context } -> grounded fillable form schema
  // pre-filled from the supplied profile. Plain JSON (not a §A envelope), like /menu_overlap.
  if (req.method === "POST" && url.pathname === "/form_fill") {
    readBody(req).then(async (payload) => {
      try {
        const schema = await runFormFill(payload);
        send(res, schema.error ? 400 : 200, schema);
      } catch (e) {
        send(res, 500, { error: { code: "UPSTREAM_TIMEOUT", message: e.message } });
      }
    }).catch(() => send(res, 400, { error: "invalid JSON" }));
    return;
  }

  send(res, 404, { error: "not found", routes: ["GET /", "POST /chat", "POST /spot_scout", "POST /permit_copilot", "POST /menu_overlap", "POST /form_fill"] });
});

server.listen(PORT, () => console.log(`[runtime] rollaway agents on http://localhost:${PORT}  (model=${config.MODEL}, tools=${toolBase}, key=${haveKey()})`));
