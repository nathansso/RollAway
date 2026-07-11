// local_gateway.mjs — run the whole Rollaway backend LOCALLY against live APIs, behind ONE
// CORS-enabled origin the browser frontend can call. This is a DEV convenience: it loads each
// DO Function's real handler in-process and proxies the permit agent to the runtime. In
// production the Functions deploy to DO and the frontend points at their deployed URLs instead.
//
//   node agents/runtime/server.mjs                       # agent runtime on :8080 (needs GRADIENT_API_KEY)
//   node functions/scripts/local_gateway.mjs             # this gateway on :8090
//   (frontend/.env.local) VITE_USE_FIXTURES=false + the four VITE_*_URL -> http://localhost:8090/...
//
// Env it forwards to the Functions (set before starting): DEMO_DATA_MODE (off=live APIs),
// SOCRATA_APP_TOKEN, GOOGLE_PLACES_KEY, TICKETMASTER_KEY, MAPBOX_TOKEN, and SPOT_SCOUT_URL /
// MENU_RAG_URL / FUNCTIONS_BASE_URL for recommend_spots. Keys come from the environment only —
// never hardcode them here.
import http from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'rollaway')
const RUNTIME = process.env.RUNTIME_URL || 'http://localhost:8080'
const PORT = Number(process.env.GATEWAY_PORT || 8090)
const FUNCS = ['recommend_spots', 'get_vendors', 'get_closures', 'get_restaurants', 'get_foot_traffic', 'get_events', 'check_clearance']

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type,accept')
}
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)) })

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const name = url.pathname.replace(/^\//, '')

  try {
    // Permit checklist -> live agent runtime (server-side hop; browser only ever sees the gateway)
    if (name === 'permit_copilot') {
      const body = await readBody(req)
      const r = await fetch(`${RUNTIME}/permit_copilot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      const text = await r.text()
      res.writeHead(r.status, { 'content-type': 'application/json' })
      return res.end(text)
    }

    // Menu extraction (sign-up) -> live agent runtime (Gradient serverless inference)
    if (name === 'menu_extract') {
      const body = await readBody(req)
      const r = await fetch(`${RUNTIME}/menu_extract`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      const text = await r.text()
      res.writeHead(r.status, { 'content-type': 'application/json' })
      return res.end(text)
    }

    if (!FUNCS.includes(name)) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'no such function', name })) }

    // Merge query params (GET) + JSON body (POST) into the function's args object
    const args = {}
    for (const [k, v] of url.searchParams.entries()) args[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
    if (req.method === 'POST') { const b = await readBody(req); if (b) Object.assign(args, JSON.parse(b)) }

    const fn = require(`${ROOT}/${name}/index.js`)
    const t0 = Date.now()
    const result = await fn.main(args)
    const status = result?.statusCode || 200
    const payload = result?.body ?? result
    console.log(`[gw] ${req.method} /${name} -> ${status} (${Date.now() - t0}ms)`)
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(payload))
  } catch (e) {
    console.error(`[gw] /${name} ERROR:`, e.message)
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'GATEWAY_ERROR', message: e.message } }))
  }
})
server.listen(PORT, () => console.log(`[gateway] http://localhost:${PORT}  (runtime=${RUNTIME}, DEMO_DATA_MODE=${process.env.DEMO_DATA_MODE || 'off'}, funcs=${FUNCS.join(',')})`))
