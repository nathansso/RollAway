# Fixtures — local tool server (stub-first)

One HTTP route per `docs/CONTRACTS.md §B` tool, each returning that tool's §B example payload
**verbatim** (field names frozen). This unblocks building and evaluating both agents before
Person 3's Functions are live.

## Run

```bash
cd agents/fixtures
npm install        # express only
node serve.js      # http://localhost:8787
```

## Routes (GET or POST)

`/get_vendors`, `/get_closures`, `/get_foot_traffic`, `/get_restaurants`, `/get_events`,
`/check_clearance`, plus `/` (health + tool list).

```bash
curl -s localhost:8787/get_foot_traffic | jq .
curl -s -X POST localhost:8787/check_clearance -H 'content-type: application/json' \
  -d '{"lat":37.78,"lng":-122.40,"vendor_type":"truck"}' | jq .              # 3 rows
curl -s -X POST localhost:8787/check_clearance -H 'content-type: application/json' \
  -d '{"lat":37.78,"lng":-122.40,"vendor_type":"pushcart_cooking"}' | jq .   # 4 rows (adds sidewalk width, cite sf-sidewalk-width)
curl -s -X POST localhost:8787/get_restaurants -H 'content-type: application/json' \
  -d '{"lat":37.78,"lng":-122.40,"day":"fri","time_from":"18:00","time_to":"22:00"}' | jq .   # §B.4: adds a `window` block
curl -s -X POST localhost:8787/get_restaurants -H 'content-type: application/json' \
  -d '{"lat":37.78,"lng":-122.40,"day":"fri"}' | jq .   # partial window -> BAD_INPUT
```

## Force the error envelope

Add `?fail=CODE` (or `{"fail":"CODE"}` in the POST body). `CODE` ∈
`UPSTREAM_TIMEOUT | BAD_INPUT | RATE_LIMIT`. This exercises the agents' graceful-degradation path.

```bash
curl -s "localhost:8787/get_vendors?fail=RATE_LIMIT" | jq .   # -> { "error": { "code": "RATE_LIMIT", ... } }
```

## Files

- `payloads.mjs` — the six §B example payloads + error envelope. **Single source of truth**,
  imported by both `serve.js` and the offline eval, so fixture responses and eval expectations
  never drift.
- `serve.js` — Express server (per SETUP.md).
- `tool-schemas.json` — the six function-calling tool definitions to **paste into the Gradient
  console** for `spot_scout`. Input field names are verbatim §B.

## Making Gradient reach it, and swapping to real Functions

- **Local dev:** expose this server to Gradient with a tunnel (e.g. `ngrok http 8787`) or deploy
  it as a throwaway DO Function; put that base URL in each tool's endpoint in the console.
- **Go-live:** replace `tool_base_url` in `tool-schemas.json` (and the console endpoints) with
  Person 3's real Function URLs — a **one-line change per tool**. Then re-run `evals`
  (`--offline` now, `--live` once the endpoint exists). See `agents/RUNBOOK.md`.
