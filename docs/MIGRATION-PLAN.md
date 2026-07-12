# Migration Plan — DigitalOcean → Railway + Supabase

> **Implementation status (2026-07-12, branch `feat/migration-railway-supabase`):**
> all code for Phases 1–2 is implemented and verified (frontend unit+build,
> backend pytest 39/39, offline eval 38/38, LIVE eval 17/17 against the
> FastAPI service on real Gradient inference). Remaining work is
> account-access provisioning + cutover — see `docs/DEPLOY-RAILWAY-SUPABASE.md`
> and the tracking issues. Two deviations from the letter of this plan, each
> with a decision issue: eval live mode replays seeds against the DIRECT
> endpoints (POST /chat is dropped), and kb_chunks uses `vector(1024)`
> (Gradient `bge-m3`, verified live) instead of the placeholder 1536.

Decisions locked (2026-07-12):

- **Keep Vite** as the frontend build tool; fix the deployment model with runtime config instead of replacing the bundler.
- **Frontend hosting** moves to Railway (static container).
- **Agents runtime** is rewritten as a **FastAPI** service on Railway. No LangChain — the
  architecture is single-turn and deterministic; a plain OpenAI-compatible client suffices.
- **Gradient serverless inference stays on DigitalOcean** (`https://inference.do-ai.run/v1`).
  It is an HTTP API; nothing else pins us to DO for it.
- **Gradient Knowledge Bases are replaced by Supabase pgvector** (they are Spaces-gated and
  tier-flaky on this account — see `agents/DECISIONS.md` D19).
- **Supabase** also takes: menu file uploads (Storage), Bay Wheels data (Postgres), and
  persistent users (Auth + profiles).
- **DO Functions stay on DigitalOcean through Phases 1–2.** Folding them into the backend is
  Phase 3, tracked as a GitHub issue, not part of this plan's execution.

Target stack: JS/TypeScript, React, Tailwind, Vite (build only), FastAPI (Python), Node
(Functions layer), Supabase, Railway, DO Gradient inference.

---

## Phase 1 — Frontend to Railway + runtime config

Goal: frontend served from Railway; backend URLs become runtime configuration; nothing else
moves. Zero contract changes.

### 1.1 Runtime config loader

The six endpoint URLs currently inlined at build time move to a `config.json` fetched at app
boot. Build-time variables that remain: dev/demo toggles (`VITE_USE_FIXTURES`,
`VITE_FIXTURE_DELAY_MS`, `VITE_FORCE_FIRST_TIME_USER`) and, optionally, the public browser
keys (`VITE_MAPBOX_TOKEN`, `VITE_GOOGLE_MAPS_BROWSER_KEY`) — moving keys to runtime config
is a nice-to-have for rotation, not required.

- Add `frontend/src/lib/config.ts`: fetches `/config.json` before store init, exposes typed
  accessors, and **falls back to `import.meta.env.VITE_*`** when the file is absent — so
  `npm run dev`, Vitest, and the e2e suites work unchanged.
- Refactor consumers of endpoint URLs to read from the loader:
  - `frontend/src/lib/apiClient.ts` (`VITE_RECOMMEND_SPOTS_URL`, `VITE_VENDORS_URL`,
    `VITE_CLOSURES_URL`, `VITE_PERMIT_CHECKLIST_URL`, `VITE_MENU_EXTRACT_URL`)
  - `frontend/src/lib/pdfFill.ts` (`VITE_FORM_PDF_URL`)
- Keep the existing "recoverable configuration error" behavior when a URL is missing and
  fixtures are off (README invariant).

### 1.2 Static container

- `frontend/Caddyfile`: serve `dist/`, SPA catch-all to `index.html`, no-cache headers on
  `index.html` + `config.json` (service-worker safety), long cache on hashed assets.
- `frontend/Dockerfile.railway`: build stage (`npm ci && npm run build`) → Caddy stage.
- `frontend/docker-entrypoint.sh`: writes `/srv/config.json` from container env vars at
  startup. Changing a backend URL on Railway = restart with new env, **no rebuild**.

### 1.3 Railway service + cutover

- New Railway service from `frontend/Dockerfile.railway`, deploy from GitHub.
- Set env: the six endpoint URLs (pointing at the **existing** DO Functions + DO agents
  runtime), Mapbox/Google keys, `VITE_USE_FIXTURES=false` equivalents.
- Update `CORS_ORIGIN` on the DO agents runtime app to the Railway domain; confirm the DO
  Functions' CORS headers allow the new origin.
- Verify gate: `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:pwa` locally;
  then live smoke test on the Railway domain (map seed layer, recommend flow, permits tab,
  menu upload) with DevTools network tab confirming calls hit DO endpoints.
- PWA check: confirm the service worker updates cleanly from the old origin (new domain =
  new SW scope, so old installs simply die with the old domain; document this).
- Decommission the DO frontend static site (`.do/app.yaml` app) after 48h of stability.

Rollback: DO static site stays deployed until decommission; flipping DNS/links back is the
whole rollback.

---

## Phase 2 — Supabase foundation + FastAPI backend

### 2a. Supabase project

1. Create project; enable the `vector` extension.
2. **Knowledge base (replaces Gradient KBs):**
   ```sql
   create table kb_documents (
     id text primary key,          -- §E source id, e.g. 'dpw-182101'
     title text not null,
     body_md text not null,
     updated_at timestamptz default now()
   );
   create table kb_chunks (
     id bigint generated always as identity primary key,
     document_id text references kb_documents(id) on delete cascade,
     chunk_index int not null,
     content text not null,
     embedding vector(1536)        -- dimension per chosen embedding model
   );
   create index on kb_chunks using hnsw (embedding vector_cosine_ops);
   ```
   Ingest `agents/kb/*.md` keyed by the §E source ids (`agents/kb/SOURCES.md`) so
   **citations survive the migration unchanged** — Permit Copilot must keep citing the same
   ids (`docs/CONTRACTS.md` §E).
   - Embedding model decision (verify first): Gradient inference `/v1/embeddings` if the
     account exposes one; otherwise any OpenAI-compatible embeddings API. Chunk ~500 tokens,
     overlap 50.
3. **Bay Wheels:**
   ```sql
   create table baywheels_trips (      -- raw monthly CSVs, re-aggregatable
     ride_id text primary key,
     started_at timestamptz, ended_at timestamptz,
     start_station_short_id text, end_station_short_id text,
     start_lat double precision, start_lng double precision,
     end_lat double precision, end_lng double precision
   );
   create table station_hourly (       -- what the API reads
     station_short_id text,            -- GBFS short_name join key (e.g. 'SF-T21')
     day_of_week smallint,             -- 0=Sun..6=Sat (Date.getDay() order)
     hour smallint,
     avg_events real,                  -- avg trip starts+ends per hour
     primary key (station_short_id, day_of_week, hour)
   );
   create table station_hourly_meta (
     id boolean primary key default true,
     source text, generated_at timestamptz, synthetic boolean,
     days_covered int, p95_events_per_station_hour real
   );
   ```
   - Import script: trip CSV → `baywheels_trips` (copy semantics of
     `functions/scripts/aggregate_baywheels.js`, including the quoted-CSV handling).
   - Aggregation becomes one SQL statement writing `station_hourly` + meta; loading a new
     month is a data operation, not a redeploy.
   - `get_foot_traffic` reads `station_hourly` from Supabase (PostgREST or connection
     string) instead of the bundled `station_hourly.json`; keep the JSON as offline
     fallback. Output contract (§B.3) unchanged.
4. **Storage:** private `menus` bucket for uploaded menu PDFs/images.

### 2b. FastAPI service (`backend/`)

Scaffold `backend/` (FastAPI + httpx + `openai` client pointed at
`GRADIENT_INFERENCE_URL`, model `anthropic-claude-haiku-4.5`). Pydantic models mirror the §A
envelope exactly.

Port from `agents/runtime/` one endpoint at a time, in this order (least→most coupled):

| Endpoint | Notes |
|---|---|
| `GET /` | health + route listing |
| `POST /menu_overlap` | port `agents/menu_rag/overlap.mjs` (pure deterministic core) to Python; menu source becomes Supabase (`menus` table) instead of Gradient KB manifest |
| `POST /menu_extract` | vision/text extraction via Gradient inference; uploaded files go to Supabase Storage, extraction results to Postgres; keep the data-URL path working for back-compat until the frontend switches |
| `POST /permit_copilot` | RAG retrieval from `kb_chunks` (pgvector) instead of Gradient KB; **§E citation ids preserved**; guardrails config ported from `agents/instructions/guardrails.config.json` |
| `POST /spot_scout` | single-turn "why" prose from precomputed signals — no tools, no math (invariant: legality math is code, never the LLM) |
| `POST /form_fill`, `GET /form_pdf` | doc ingestion + verified PDF proxy |
| `POST /chat` | **dropped** (legacy router path; confirm nothing calls it) |

Gateway routes (Phase 2 = proxy, Phase 3 = absorb):

- `POST /api/recommend_spots`, `GET /api/vendors`, `GET /api/closures` → httpx proxy to the
  DO Functions namespace. The frontend ends Phase 2 with **one backend base URL**.

Repoint DO-side wiring: the `recommend_spots` Function's `SPOT_SCOUT_URL` and `MENU_RAG_URL`
env vars move from the DO agents runtime to the FastAPI service URLs.

**Verification gate (blocking):** `node agents/evals/run.mjs --live` against the FastAPI
endpoints must pass **24/24** before each cutover. The eval suite pins the §A envelope,
guardrails, and citation behavior — it is the contract test for this rewrite. Add pytest
unit tests for the ported overlap core (mirror the Node tests' cases).

Cutover + decommission:

- Update Railway frontend env: `PERMIT_CHECKLIST_URL`, `MENU_EXTRACT_URL`, `FORM_PDF_URL` →
  FastAPI; then `RECOMMEND_SPOTS_URL`, `VENDORS_URL`, `CLOSURES_URL` → the `/api/*` proxies.
- Decommission the DO agents runtime app (`.do/agents-runtime.app.yaml`) after the eval gate
  passes against production and a 48h soak.

Rollback: the DO agents runtime keeps running until decommission; rollback = restart the
frontend with the old URLs (runtime config, no rebuild).

### 2c. Users (after 2a/2b are stable)

- Supabase Auth (email magic link to start).
- ```sql
  create table profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    vendor_type text check (vendor_type in ('truck','trailer','pushcart_cooking','pushcart_nocook')),
    max_travel_minutes int,
    travel_mode text,
    home_lat double precision, home_lng double precision,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create table menus (
    id bigint generated always as identity primary key,
    user_id uuid references auth.users(id) on delete cascade,
    storage_path text,                 -- menus bucket object
    items jsonb, keywords jsonb,       -- menu_extract output
    created_at timestamptz default now()
  );
  ```
- RLS on both tables: users read/write only their own rows. Frontend uses the anon key
  directly for profile CRUD; the FastAPI service uses the service key to write extraction
  results.
- First-login migration: if a localStorage profile exists, offer to import it into
  `profiles`, then keep localStorage as an offline cache (PWA still works logged-out).

---

## Phase 3 — tracked as a GitHub issue, not executed here

Fold the seven DO Functions into the Railway backend (Node service or FastAPI port),
eliminating cold starts and the prewarm script. See the "Phase 3" issue on
`nathansso/RollAway` for scope, options, and the turf.js-geometry porting caveat.

## What stays on DigitalOcean at the end of Phase 2

- Gradient serverless inference (the only intentional keeper).
- The seven Functions (until Phase 3).

## End-state request flow (post Phase 2)

```
React PWA (Railway static, runtime config.json)
  ├── /api/recommend_spots ─► FastAPI (Railway) ─proxy─► DO recommend_spots Function
  │                                                        ├── signal Functions (DO)
  │                                                        ├── POST FastAPI /spot_scout
  │                                                        └── POST FastAPI /menu_overlap
  ├── /api/vendors, /api/closures ─► FastAPI ─proxy─► DO Functions
  ├── /permit_copilot, /menu_extract, /form_* ─► FastAPI ─► Gradient inference (DO)
  │                                                └────► Supabase (pgvector KB, Storage, Postgres)
  └── profiles/menus ─► Supabase (Auth + RLS)
```
